/* #718 part 4: runners of a ground-rule double trot once the ball is dead (pure, no DOM, no three.js). Read from the engine event only (rule 12):
 * `play.groundRule` (#614 part 7). The engine already put every runner on two bases (rule 10); this only redraws how fast they cover the rest.
 * They run at the engine's pace until the ball is over the wall (render/grd_path.js), then trot at GRD_TROT_V (same pace as the engine's home-run trot).
 * grdTl(e, tl, T, trotV) -> tl (same object when nothing changes) with { trotAt, trotD, trotV, arriveT, slide: false, ts: Infinity }.
 * grdProg(tl, u) -> metres along the runner's path at u when u >= tl.trotAt, else null. Moves are [from, to, name, tl]; T = { ARRIVE }. */
import { grdPlan, GRD_FENCE_R, GRD_MIN_GAP } from './grd_path.js';
import { isGroundRule } from './umpgrd.js';
export const GRD_TROT_V = 5;        /* m/s, engine HR_TROT_SPEED (tests/grd_run.check.mjs compares) */
export const GRD_BASE_M = 27.43;    /* base path, m (engine BASE_PATH) */
/* seconds into the event at which the ball passes over the wall: it lands at ARRIVE + hang, runs to the warning track, bounces and clears the wall */
export function grdDeadAt(e, T) {
  const p = e.play, P = grdPlan([p.lx, .15, p.lz]);
  return T.ARRIVE + p.hang + P.tRun + Math.max(GRD_FENCE_R - P.r1, GRD_MIN_GAP) / P.vh;
}
/* runDist(t, v): the engine's own run curve, passed in by the caller (window.ENGINE.runDist) so the two cannot drift apart */
export function grdTl(e, tl, T, runDist, from, to) {
  if (!isGroundRule(e) || !tl || !Number.isFinite(e.play.lx) || !Number.isFinite(e.play.lz)) return tl;
  const L = (to - from) * GRD_BASE_M, at = Math.max(grdDeadAt(e, T), tl.st0);
  const d0 = runDist(at - tl.st0, tl.spd) + (from > 0 ? tl.lead : 0);
  if (d0 >= L) return tl;                       /* he is already on his base when the ball dies: nothing slows him */
  return { ...tl, slide: false, ts: Infinity, trotAt: at, trotD: d0, trotV: GRD_TROT_V, arriveT: at + (L - d0) / GRD_TROT_V };
}
export function grdProg(tl, u, L) {
  return tl && tl.trotAt != null && u >= tl.trotAt ? Math.min(L, tl.trotD + (u - tl.trotAt) * tl.trotV) : null;
}
