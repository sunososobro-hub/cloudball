/* #718 part 1: the ball of a ground-rule double (engine `play.groundRule`, #614 part 7). Pure: no three.js, no DOM, no clock.
 * It lands where the engine says (land, reached at T), takes GRD_RUN s to the warning track along the ray from home, bounces once there
 * and goes over the outfield wall, then comes down and stops beyond it. Nothing here changes a result (rules 10, 12): the engine already
 * decided it is a double, the ball is dead and every runner gets two bases; this only draws that ball.
 * game.js feeds it land and the time t since the landing; tests/grd_path.check.mjs runs it over seeds 1-200. */
export const GRD_FENCE_R = 110;     /* outfield wall radius from home, m (same as engine FENCE_R; the check compares them) */
export const GRD_WALL_H = 3;        /* wall height, m (render/game.js fence mesh) */
export const GRD_TRACK_M = 5;       /* the bounce point lies this far in front of the wall, m */
export const GRD_OVER_M = 6;        /* the ball comes to rest this far beyond the wall, m */
export const GRD_RUN_V = 18;        /* m/s along the ground from the landing to the bounce */
export const GRD_MIN_GAP = .3;      /* a ball that lands closer than this to the wall bounces from where it landed, m */
export const GRD_MIN_TW = .25;      /* s: least time from the bounce to the wall, so a short gap does not make a rocket */
export const GRD_PULL_K = .6;       /* part 2: the outfielder pulls up after this share of his run to the engine's stand point (the ball is dead, nothing to field) */
export const GRD_G = 9.81;          /* m/s^2 */
export const GRD_CLEAR_M = 1.2;     /* the ball passes this much above the wall top, m */
export const GRD_REST_Y = .15;      /* ball centre height at rest (game.js land / rollEnd y) */

/* ground leg land -> bounce point (a low skip), then a parabola over the wall to the rest point; returns { dur, tRun, tAir, ux, uz, r0, r1, r2, vy } */
export function grdPlan(land) {
  const r0 = Math.hypot(land[0], land[2]) || 1, ux = land[0] / r0, uz = land[2] / r0;
  const r1 = Math.max(GRD_FENCE_R - GRD_TRACK_M, r0), dw = Math.max(GRD_FENCE_R - r1, GRD_MIN_GAP), r2 = GRD_FENCE_R + GRD_OVER_M;
  const tRun = Math.max(r1 - r0, 0) / GRD_RUN_V;
  const vh = Math.min(GRD_RUN_V * .6, dw / GRD_MIN_TW);                                        /* horizontal speed after the bounce */
  const tAir = (r2 - r1) / vh;
  /* y(t) = REST + vy t - g t^2 / 2 must be GRD_WALL_H + CLEAR when the ball is at the wall (t = TRACK_M / vh) and REST at tAir */
  const tw = dw / vh, need = GRD_WALL_H + GRD_CLEAR_M - GRD_REST_Y;
  const vy = (need + GRD_G * tw * tw / 2) / tw;
  return { dur: tRun + tAir, tRun, tAir, ux, uz, r0, r1, r2, vh, vy };
}
/* ball position t seconds after the landing; the airborne leg ends where y returns to rest, the last stretch is a roll */
export function grdAt(P, t) {
  const at = r => [P.ux * r, 0, P.uz * r];
  if (t <= 0) { const q = at(P.r0); q[1] = GRD_REST_Y; return q; }
  if (t < P.tRun) { const r = P.r0 + GRD_RUN_V * t, q = at(r); q[1] = GRD_REST_Y; return q; }
  const s = t - P.tRun, tFlight = 2 * (P.vy - 0) / GRD_G;
  const r = Math.min(P.r2, P.r1 + P.vh * s), q = at(r);
  q[1] = s < tFlight ? Math.max(GRD_REST_Y, GRD_REST_Y + P.vy * s - GRD_G * s * s / 2) : GRD_REST_Y;
  return q;
}
/* part 2: share of the run toward the stand point the fielder makes on a ground-rule double (k = the normal chase share, 0..1) */
export const grdPull = k => Math.min(k, GRD_PULL_K);
