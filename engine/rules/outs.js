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
});

import { STRIKES_FOR_OUT } from '../constants.js';

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

/* Force out: a fielder holding the ball touches the base before the forced runner gets there.
 * ballAt: when the fielder has the ball; touchAt: when he is on the base; runnerAt: runner's arrival. */
export function forceOut({ runner, from, base, fielder, forced, ballAt, touchAt, runnerAt }) {
  need(fielder, `nobody is covering base ${base}`);
  need(forced, `runner ${runner} is not forced to base ${base}`);
  need(isTime(ballAt) && isTime(touchAt) && isTime(runnerAt), 'missing times');
  const at = Math.max(ballAt, touchAt);   /* the out exists only once the ball is held ON the base */
  need(at < runnerAt, `ball reaches base ${base} at ${at.toFixed(2)}, runner at ${runnerAt.toFixed(2)}`);
  return { reason: OUT.FORCE, runner, from, base, fielder, ballAt, touchAt, runnerAt, at };
}

/* Tag out: a fielder holding the ball tags the runner before he reaches the base. */
export function tagOut({ runner, from, base, fielder, ballAt, fielderAt, runnerAt }) {
  need(fielder, `nobody is there to tag at base ${base}`);
  need(isTime(ballAt) && isTime(fielderAt) && isTime(runnerAt), 'missing times');
  need(ballAt < runnerAt && fielderAt < runnerAt, `no ball in the glove at base ${base} before the runner arrives`);
  return { reason: OUT.TAG, runner, from, base, fielder, ballAt, fielderAt, runnerAt, at: runnerAt };
}

/* Non-throwing checks, for callers that decide between "out" and "safe". */
export const beats = (ballAt, touchAt, runnerAt) => Math.max(ballAt, touchAt) < runnerAt;
