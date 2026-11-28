/* #718 part 3: the ground-rule double signal (pure, no DOM, no three.js). Read from the engine event only (rule 12): `play.groundRule`
 * (#614 part 7). Cosmetic: the engine already made it a double and put every runner on two bases (rule 10).
 *   the umpire of the line on the side of the spray (U1 right / left-of-centre U3; dead centre U1) raises both arms
 *   high and wide (two bases) once the ball is over the wall, holds, and lowers them before the event ends.
 * grdCall(e, T) -> null | {b, at, hold}: b = 1 or 3, at = signal start (s into the event). grdSignal(e, u, b, T) -> null | {kind, w, arms},
 * arms = [rx,ry,rz, lx,ly,lz] in the umpire's own frame (+z forward, +x his RIGHT), the frame of umpinf.js / umpsig.js. T = {ARRIVE}. */
export const GRD_UP = .3, GRD_DOWN = .4, GRD_AFTER = 1.2, GRD_HOLD = 1.6;   /* s: raise, lower, delay after the landing, hold */
export const GRD_ARMS_R = [.55, 1.3, .1], GRD_ARMS_L = [-.55, 1.3, .1];
const sat = x => x < 0 ? 0 : x > 1 ? 1 : x;
const ease = x => x * x * (3 - 2 * x);
export function isGroundRule(e) { return !!e && e.k === 'P' && e.r === 'inplay' && !!e.play && !!e.play.groundRule && Number.isFinite(e.play.hang); }
export function grdCall(e, T) {
  if (!isGroundRule(e)) return null;
  const p = e.play;
  return { b: p.spray < 0 ? 3 : 1, at: T.ARRIVE + p.hang + GRD_AFTER, hold: GRD_HOLD };
}
export function grdEnd(e, T) { const c = grdCall(e, T); return c ? c.at + GRD_UP + c.hold + GRD_DOWN : 0; }
export function grdSignal(e, u, b, T) {
  const c = grdCall(e, T);
  if (!c || c.b !== b) return null;
  const t = u - c.at, w = ease(sat(t / GRD_UP)) * (1 - ease(sat((t - GRD_UP - c.hold) / GRD_DOWN)));
  return w > 0 ? { kind: 'grd', w, arms: GRD_ARMS_R.concat(GRD_ARMS_L) } : null;
}
