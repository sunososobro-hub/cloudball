/* The only place an out can be created. Every constructor checks the baseball rule that makes
 * the out legal and throws if the evidence is missing, so an illegal out cannot be recorded.
 *
 * Times are seconds on one shared clock (the engine uses seconds into the pitch frame). */

export const OUT = Object.freeze({
  STRIKEOUT_SWINGING: 'strikeout_swinging',
  STRIKEOUT_LOOKING: 'strikeout_looking',
  FLY_CATCH: 'fly_catch',
  FORCE: 'force',
  TAG: 'tag',
  INFIELD_FLY: 'infield_fly',
});

import { STRIKES_FOR_OUT, CLOSE_PLAY_MARGIN } from '../constants.js';

const need = (cond, msg) => { if (!cond) throw new Error('illegal out: ' + msg); };
const isTime = x => typeof x === 'number' && Number.isFinite(x);

/* Is the runner who started the play on `from` (0 = batter, 1..3) forced to advance?
 * bases: [1st, 2nd, 3rd] before the play; batterRuns: the batter became a runner. */
export function isForced(from, bases, batterRuns) {
  if (!batterRuns) return false;
  for (let b = from - 1; b >= 1; b--) if (!bases[b - 1]) return false;
  return true;
}

export function strikeout({ batter, looking, strikes, at }) {
  need(strikes === STRIKES_FOR_OUT, 'a strikeout needs three strikes');
  need(isTime(at), 'missing time');
  return { reason: looking ? OUT.STRIKEOUT_LOOKING : OUT.STRIKEOUT_SWINGING, runner: batter, from: 0, base: 0, fielder: 'C', at };
}

/* Batter is out when a fielder catches the batted ball before it touches the ground. */
export function flyCatch({ batter, fielder, fielderAt, ballDownAt, at }) {
  need(fielder, 'nobody caught the ball');
  need(isTime(fielderAt) && isTime(ballDownAt), 'missing times');
  need(fielderAt <= ballDownAt, `fielder ${fielder} is not under the ball when it comes down`);
  need(at >= ballDownAt, 'catch recorded before the ball arrives');
  return { reason: OUT.FLY_CATCH, runner: batter, from: 0, base: 0, fielder, fielderAt, ballAt: ballDownAt, at };
}

/* Infield fly (OBR 5.09(a)(5), definition in Definitions of Terms): a fair fly, not a line drive or a bunt, that an
 * infielder can catch with ordinary effort, runners on first and second, fewer than two outs. The umpire declares it and
 * the batter is out whether the ball is caught or not; this constructor is the out for one that is NOT caught (#614).
 * at: when the ball comes down (the batter was declared out while it was in the air). */
const IFF_FIELDERS = ['P', 'C', '1B', '2B', '3B', 'SS'];
export function infieldFly({ batter, fielder, type, foul, bunt, outs, bases, ballDownAt, at }) {
  need(IFF_FIELDERS.includes(fielder), `${fielder} is not an infielder`);
  need(type === 'PU' || type === 'FB', `a ${type} is not a fly ball`);
  need(!foul && !bunt, 'an infield fly is a fair fly, not a bunt');
  need(outs < 2 && !!bases[0] && !!bases[1], 'no infield-fly situation (runners on first and second, fewer than two outs)');
  need(isTime(ballDownAt) && isTime(at) && at >= ballDownAt, 'missing times');
  return { reason: OUT.INFIELD_FLY, runner: batter, from: 0, base: 0, fielder, ballAt: ballDownAt, at };
}

/* Force out: a fielder holding the ball touches the base before the forced runner gets there.
 * ballAt: when the fielder has the ball; touchAt: when he is on the base; runnerAt: runner's arrival. */
export function forceOut({ runner, from, base, fielder, forced, ballAt, touchAt, runnerAt }) {
  need(fielder, `nobody is covering base ${base}`);
  need(forced, `runner ${runner} is not forced to base ${base}`);
  need(isTime(ballAt) && isTime(touchAt) && isTime(runnerAt), 'missing times');
  const at = Math.max(ballAt, touchAt);   /* the out exists only once the ball is held ON the base */
  need(beats(ballAt, touchAt, runnerAt), `ball reaches base ${base} at ${at.toFixed(3)}, runner at ${runnerAt.toFixed(3)}`);
  return { reason: OUT.FORCE, runner, from, base, fielder, ballAt, touchAt, runnerAt, at };
}

/* Tag out: a fielder holding the ball tags the runner before he reaches the base.
 * tagAt (optional): a tag in the base path, before the runner gets near the base (the catcher tagging a batter on a
 * dropped third strike, #614); it must come after the fielder holds the ball and before the runner arrives. */
export function tagOut({ runner, from, base, fielder, ballAt, fielderAt, runnerAt, tagAt = null }) {
  need(fielder, `nobody is there to tag at base ${base}`);
  need(isTime(ballAt) && isTime(fielderAt) && isTime(runnerAt), 'missing times');
  need(beats(ballAt, fielderAt, runnerAt), `no ball in the glove at base ${base} before the runner arrives`);
  if (tagAt != null) need(isTime(tagAt) && tagAt >= Math.max(ballAt, fielderAt) && tagAt < runnerAt, `tag at ${tagAt} is not between the ball in the glove and the runner's arrival`);
  return { reason: OUT.TAG, runner, from, base, fielder, ballAt, fielderAt, runnerAt, at: tagAt != null ? tagAt : runnerAt };
}

/* Does the ball, held by a fielder who is there, beat the runner? The only test for a force or a tag,
 * used by the constructors above and by callers that decide between "out" and "safe".
 * A play closer than CLOSE_PLAY_MARGIN goes to the runner. */
export function beats(ballAt, touchAt, runnerAt) { return Math.max(ballAt, touchAt) < runnerAt - CLOSE_PLAY_MARGIN; }
