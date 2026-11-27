/* #708: the check-swing appeal (pure, no DOM, no three.js). Read from the engine event only (rule 12): a pitch frame whose `chk`
 * ({ump: 1 | 3, swing}) the engine set is also the `appeal` stream event at ARRIVE + CHECK_APPEAL_AT. Cosmetic: the engine's call stands.
 *   batter   halfSwing(e, u): the swing goes HALF_SWING of the way round and comes back (he holds up), instead of the full swing
 *   catcher  catcherPoint(e, u, T): his bare (right) hand points at the base umpire, full by the appeal time, held, then back
 *   umpire   appealSignal(e, u, b, T): the named base umpire answers APPEAL_SIG_AT after the appeal:
 *            `no_swing` = the safe sign (both arms out level to the sides), `swing` = the strike fist (right fist up beside the head)
 * appealOf(e, T) -> null | {b, swing, at}: b = 1 (first-base umpire) or 3 (third), at = frame-local s of the appeal.
 * Arms are [rx,ry,rz, lx,ly,lz], hand targets in the umpire's upper-body frame (+z forward, +x his RIGHT), as umpsig.js / umpinf.js.
 * T = {ARRIVE, CHECK_APPEAL_AT} from the engine, so a changed engine timing moves the whole act with it. */
export const HALF_SWING = .45;                                   /* share of the full swing he gets round before he holds up */
export const HALF_HOLD = .25, HALF_BACK = .5;                    /* s held at the half swing after the pitch arrives, s to bring it back */
export const POINT_LEAD = .4, POINT_UP = .25, POINT_HOLD = .3, POINT_DOWN = .3;   /* catcher: starts POINT_LEAD s before the appeal, down before the lob back (game.js BALL_BACK_AT) gets far */
export const APPEAL_SIG_AT = .15, APPEAL_UP = .25, APPEAL_HOLD = 1.0, APPEAL_DOWN = .35;   /* umpire: starts APPEAL_SIG_AT s after it */
const REST_L = [-.25, .1, .45];
const SAFE_R = [.88, .55, .2], SAFE_L = [-.88, .55, .2];         /* both arms straight out to the sides, level with the shoulders */
const FIST_R = [.4, .95, .2];                                    /* right fist up beside the head */
const sat = x => x < 0 ? 0 : x > 1 ? 1 : x;
const ease = x => x * x * (3 - 2 * x);
const env = (t, up, hold, down) => ease(sat(t / up)) * (1 - ease(sat((t - up - hold) / down)));
export function appealOf(e, T) {
  const c = e && e.k === 'P' ? e.chk : null;
  if (!c || (c.ump !== 1 && c.ump !== 3)) return null;
  return { b: c.ump, swing: !!c.swing, at: T.ARRIVE + T.CHECK_APPEAL_AT };
}
/* how far round the swing is allowed (1 = no cap): rises with the normal swing, held at HALF_SWING, then eased back to 0 */
export function halfSwing(e, u, T) {
  if (!appealOf(e, T)) return null;
  const back = ease(sat((u - (T.ARRIVE + HALF_HOLD)) / HALF_BACK));
  return { cap: HALF_SWING, back };
}
export function catcherPoint(e, u, T) {
  const a = appealOf(e, T);
  if (!a) return null;
  const w = env(u - (a.at - POINT_LEAD), POINT_UP, POINT_HOLD, POINT_DOWN);
  return w > 0 ? { b: a.b, w } : null;
}
export function appealEnd(e, T) {
  const a = appealOf(e, T);
  return a ? a.at + APPEAL_SIG_AT + APPEAL_UP + APPEAL_HOLD + APPEAL_DOWN : 0;
}
export function appealSignal(e, u, b, T) {
  const a = appealOf(e, T);
  if (!a || a.b !== b) return null;
  const w = env(u - (a.at + APPEAL_SIG_AT), APPEAL_UP, APPEAL_HOLD, APPEAL_DOWN);
  if (!(w > 0)) return null;
  return a.swing ? { kind: 'swing', w, arms: FIST_R.concat(REST_L) } : { kind: 'no_swing', w, arms: SAFE_R.concat(SAFE_L) };
}
