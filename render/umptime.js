/* #609 part 3a: the plate umpire's "time" and "play" (pure, no DOM, no three.js). Read from the engine events only (rule 12);
 * a pure function of (event, previous event, time), like plateSignal in umpsig.js.
 *   time  a VOTE, CHG, VIS, CVIS or SUB frame starts: both hands up
 *   play  a pitch frame that follows such a frame: the right arm points at the pitcher (a balk or an intentional walk has its own signal)
 * timeSignal(e, prev, u) -> null | {kind, w, arms}: w 0..1 is how far he is into the signal, arms = [rx,ry,rz, lx,ly,lz] in the
 * umpire's upper-body frame (+z forward, +x his RIGHT), the frame of umpsig.js. Infield fly is not here (part 3b). */
export const TM_UP = .25, TM_DOWN = .35;
export const TIME_AT = .3, TIME_HOLD = 1.0, PLAY_AT = .15, PLAY_HOLD = .9;
export const TIME_KINDS = new Set(['VOTE', 'CHG', 'VIS', 'CVIS', 'SUB']);   /* CVIS: the catcher's mound visit (#614 part 11) */
export const TM_STAND = .8;                                    /* how far he straightens out of the crouch at full signal */
const REST_R = [.25, .1, .45], REST_L = [-.25, .1, .45];
const UP_R = [.3, 1.25, .1], UP_L = [-.3, 1.25, .1];
const AT_P = [.2, .66, .95];
const sat = x => x < 0 ? 0 : x > 1 ? 1 : x;
const ease = x => x * x * (3 - 2 * x);
const env = (t, hold) => ease(sat(t / TM_UP)) * (1 - ease(sat((t - TM_UP - hold) / TM_DOWN)));
/* the call of this frame: {kind, at, hold} or null; never runs past the frame */
export function timeCall(e, prev) {
  if (!e) return null;
  let c = null;
  if (TIME_KINDS.has(e.k)) c = { kind: 'time', at: TIME_AT, hold: TIME_HOLD };
  else if (e.k === 'P' && !e.bk && e.r !== 'ibb' && prev && TIME_KINDS.has(prev.k)) c = { kind: 'play', at: PLAY_AT, hold: PLAY_HOLD };
  if (!c) return null;
  const end = c.at + TM_UP + c.hold + TM_DOWN;
  if (Number.isFinite(e.d) && end > e.d) c.at = Math.max(0, c.at - (end - e.d));
  return c;
}
export function timeEnd(e, prev) { const c = timeCall(e, prev); return c ? c.at + TM_UP + c.hold + TM_DOWN : 0; }
export function timeSignal(e, prev, u) {
  const c = timeCall(e, prev);
  if (!c) return null;
  const w = env(u - c.at, c.hold);
  if (!(w > 0)) return null;
  return { kind: c.kind, w, arms: c.kind === 'time' ? UP_R.concat(UP_L) : AT_P.concat(REST_L) };
}
