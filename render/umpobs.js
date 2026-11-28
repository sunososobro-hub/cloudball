/* #841 part 1: the first-base umpire's obstruction signal (pure, no DOM, no three.js). Read from the engine event only (rule 12); a pure
 * function of (event, time), like infSignal in umpinf.js. Cosmetic: the engine recorded the award (play.obstruction, rule 13).
 *   obstruction  outfield single, second open, the batter rounding first is impeded (OBR 6.01(h)(2)): U1 points the right arm at the
 *                first baseman from the moment the batter reaches first until the batter has second (delayed dead ball), then lowers it.
 * obsCall(e, T) -> null | {b: 1, at, hold}: at = s into the event the batter reaches first, hold = how long the arm stays out.
 * obsSignal(e, u, b, T) -> null | {kind: 'obs', w, arms}: arms = [rx,ry,rz, lx,ly,lz] in the umpire's own frame (+z forward, +x his RIGHT),
 * the frame of umpsig.js. T = {runTime(d, v), BASE_PATH} from the engine (so a changed run model moves the signal with it). */
export const OBS_UP = .3, OBS_DOWN = .4, OBS_MIN_HOLD = .3;
const POINT_R = [.85, .62, .5], REST_L = [-.25, .1, .45];   /* point at the first baseman: out to his right, level */
const sat = x => x < 0 ? 0 : x > 1 ? 1 : x;
const ease = x => x * x * (3 - 2 * x);
const env = (t, hold) => ease(sat(t / OBS_UP)) * (1 - ease(sat((t - OBS_UP - hold) / OBS_DOWN)));
export function isObstruction(e) {
  return !!e && e.k === 'P' && e.r === 'inplay' && !!e.play && e.play.obstruction === true && Array.isArray(e.moves)
    && e.moves.some(m => m[0] === 0 && m[1] === 2 && m[3] && Number.isFinite(m[3].st0) && Number.isFinite(m[3].arriveT));
}
export function obsCall(e, T) {
  if (!isObstruction(e)) return null;
  const m = e.moves.find(x => x[0] === 0 && x[1] === 2), tl = m[3];
  const at = tl.st0 + T.runTime(T.BASE_PATH, tl.spd);
  let hold = tl.arriveT - at - OBS_UP;
  if (Number.isFinite(e.d)) hold = Math.min(hold, e.d - at - OBS_UP - OBS_DOWN);
  hold = Math.max(OBS_MIN_HOLD, hold);
  return { b: 1, at, hold };
}
export function obsEnd(e, T) { const c = obsCall(e, T); return c ? c.at + OBS_UP + c.hold + OBS_DOWN : 0; }
export function obsSignal(e, u, b, T) {
  const c = obsCall(e, T);
  if (!c || c.b !== b) return null;
  const w = env(u - c.at, c.hold);
  return w > 0 ? { kind: 'obs', w, arms: POINT_R.concat(REST_L) } : null;
}
