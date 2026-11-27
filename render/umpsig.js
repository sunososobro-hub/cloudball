/* #609 part 1: plate umpire signals for what the engine already records (pure, no DOM, no three.js).
 * Read from the event only (rule 12); a pure function of (event, time), like umpCall in game.js.
 *   foul  (e.r 'foul')   both arms straight up, after the ball is off the bat
 *   hbp   (e.r 'hbp')    time (both hands up), then the right arm points the batter to first
 *   ibb   (e.r 'ibb')    the right arm points to first
 *   bk    (e.bk)         the right arm points at the pitcher, then waves the runners on
 * plateSignal(e, u, T) -> null | {kind, w, arms}: w 0..1 is how far he is into the signal (0 = crouched as before),
 * arms = [rx,ry,rz, lx,ly,lz], the two hand targets in the umpire's upper-body frame (+z forward, +x his RIGHT = first-base side),
 * the same frame as umpArms. T = {ARRIVE, BK_CALL_AT} from the engine, so a changed engine timing moves the signal with it. */
export const SIG_UP = .25, SIG_DOWN = .35;
export const FOUL_AT = .35, FOUL_HOLD = 1.0;
export const HBP_TIME_AT = .3, HBP_TIME_HOLD = .7, HBP_POINT_GAP = .15, HBP_POINT_HOLD = 1.0;
export const IBB_AT = .4, IBB_HOLD = 1.1;
export const BK_POINT_HOLD = .7, BK_WAVE_HOLD = 1.1, BK_WAVE_HZ = 1.6;
export const SIG_STAND = .8;                                  /* how far he straightens out of the crouch at full signal */
const REST_R = [.25, .1, .45], REST_L = [-.25, .1, .45];
const UP_R = [.3, 1.25, .1], UP_L = [-.3, 1.25, .1];          /* time / foul: both hands high */
const FIRST = [.85, .62, .5];                                 /* point to first: out to his right, level, a little forward */
const AT_P = [.2, .66, .95];                                  /* point at the pitcher: straight ahead */
const WAVE = [[.75, .75, .35], [.1, .75, .55]];               /* wave the runners on: sweeps across */
const sat = x => x < 0 ? 0 : x > 1 ? 1 : x;
const ease = x => x * x * (3 - 2 * x);
const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
const env = (t, up, hold, down) => ease(sat(t / up)) * (1 - ease(sat((t - up - hold) / down)));  /* 0 -> 1 -> 0 */
/* the frame's timeline as [start, kind-of-segment...]: used by plateSignal and by the check (signalEnd) */
export function signalKind(e) {
  if (!e || e.k !== 'P') return null;
  if (e.bk) return 'bk';
  if (e.r === 'foul') return 'foul';
  if (e.r === 'hbp') return 'hbp';
  if (e.r === 'ibb') return 'ibb';
  return null;
}
export function signalEnd(e, T) {
  switch (signalKind(e)) {
    case 'foul': return T.ARRIVE + FOUL_AT + SIG_UP + FOUL_HOLD + SIG_DOWN;
    case 'hbp': return T.ARRIVE + HBP_TIME_AT + hbpPointAt() + SIG_UP + HBP_POINT_HOLD + SIG_DOWN;
    case 'ibb': return IBB_AT + SIG_UP + IBB_HOLD + SIG_DOWN;
    case 'bk': return T.BK_CALL_AT + SIG_UP + BK_POINT_HOLD + BK_WAVE_HOLD + SIG_DOWN;
    default: return 0;
  }
}
const hbpPointAt = () => SIG_UP + HBP_TIME_HOLD + HBP_POINT_GAP;     /* from the time signal's start to the point's start */
export function plateSignal(e, u, T) {
  const kind = signalKind(e);
  if (!kind) return null;
  let w = 0, R = REST_R, L = REST_L;
  if (kind === 'foul') {
    w = env(u - (T.ARRIVE + FOUL_AT), SIG_UP, FOUL_HOLD, SIG_DOWN); R = UP_R; L = UP_L;
  } else if (kind === 'hbp') {
    const t0 = T.ARRIVE + HBP_TIME_AT, t1 = t0 + hbpPointAt();
    const a = env(u - t0, SIG_UP, HBP_TIME_HOLD, SIG_DOWN), b = env(u - t1, SIG_UP, HBP_POINT_HOLD, SIG_DOWN);
    w = Math.max(a, b);
    const k = sat((u - t1) / SIG_UP);                           /* time hands -> the point, the left hand drops */
    R = mix(UP_R, FIRST, ease(k)); L = mix(UP_L, REST_L, ease(k));
  } else if (kind === 'ibb') {
    w = env(u - IBB_AT, SIG_UP, IBB_HOLD, SIG_DOWN); R = FIRST;
  } else {
    const t0 = T.BK_CALL_AT, tw = t0 + SIG_UP + BK_POINT_HOLD;
    w = env(u - t0, SIG_UP, BK_POINT_HOLD + BK_WAVE_HOLD, SIG_DOWN);
    const sw = .5 - .5 * Math.cos(2 * Math.PI * BK_WAVE_HZ * Math.max(0, u - tw)), k = ease(sat((u - tw) / .2));
    R = u < tw ? AT_P : mix(AT_P, mix(WAVE[0], WAVE[1], sw), k);
  }
  if (!(w > 0)) return null;
  return { kind, w, arms: R.concat(L) };
}
