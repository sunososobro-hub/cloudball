/* #609 part 3b: the infield fly (pure, no DOM, no three.js). Read from the engine event only (rule 12); a pure function of
 * (event, time), like lineSignal in umpline.js. Cosmetic: the engine records the catch as the out (rule 13).
 *   infield fly  a fair pop-up or fly (play.type PU / FB, not a line drive, bunt or foul) caught for the out by an infielder or the catcher,
 *                runners on 1st and 2nd (or loaded), fewer than 2 outs: the nearest umpire points straight up with his right arm
 *                while the ball is still in the air (from INF_AT of its hang), down again before the catch.
 * infCall(e, T) -> null | {b, at, hold}: b = 1..3 the base umpire (1B, 2B -> U1; 3B, SS -> U3; P -> U2; C by the side of the spray).
 * infSignal(e, u, b, T) -> null | {kind: 'inf', w, arms}: arms = [rx,ry,rz, lx,ly,lz] in the umpire's own frame (+z forward, +x his RIGHT),
 * the frame of umpsig.js. T = {ARRIVE} from the engine. */
export const INF_UP = .25, INF_DOWN = .35, INF_AT = .4, INF_HOLD_MAX = 1.8, INF_HOLD_MIN = .3, INF_MARGIN = .1;
const INF_UMP = { '1B': 1, '2B': 1, '3B': 3, SS: 3, P: 2 };
const UP_R = [.3, 1.3, .1], REST_L = [-.25, .1, .45];
const sat = x => x < 0 ? 0 : x > 1 ? 1 : x;
const ease = x => x * x * (3 - 2 * x);
const env = (t, hold) => ease(sat(t / INF_UP)) * (1 - ease(sat((t - INF_UP - hold) / INF_DOWN)));
export function isInfieldFly(e) {
  if (!e || e.k !== 'P' || e.r !== 'inplay' || !e.play || !e.s0 || !Array.isArray(e.s0.b)) return false;
  const p = e.play;
  return (p.type === 'PU' || p.type === 'FB') && p.res === 'out' && !p.foul && !p.bunt && (p.fielder === 'C' || p.fielder in INF_UMP)
    && e.s0.outs < 2 && !!e.s0.b[0] && !!e.s0.b[1] && Number.isFinite(p.hang) && Array.isArray(e.outs) && e.outs.some(o => o.reason === 'fly_catch');
}
export function infCall(e, T) {
  if (!isInfieldFly(e)) return null;
  const p = e.play, b = p.fielder === 'C' ? (p.spray >= 0 ? 1 : 3) : INF_UMP[p.fielder];
  const hold = Math.min(INF_HOLD_MAX, Math.max(INF_HOLD_MIN, p.hang * (1 - INF_AT) - INF_UP - INF_DOWN - INF_MARGIN));
  return { b, at: T.ARRIVE + p.hang * INF_AT, hold };
}
export function infEnd(e, T) { const c = infCall(e, T); return c ? c.at + INF_UP + c.hold + INF_DOWN : 0; }
export function infSignal(e, u, b, T) {
  const c = infCall(e, T);
  if (!c || c.b !== b) return null;
  const w = env(u - c.at, c.hold);
  return w > 0 ? { kind: 'inf', w, arms: UP_R.concat(REST_L) } : null;
}
