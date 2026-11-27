/* #43 item 2: the bat boy (plain data + pure maths, no three.js, no DOM, no Date / Math.random).
 * The bat the batter lets go (render/batdrop.js) used to lie by the plate until the event ended and then vanish. Now the batting team's bat
 * boy comes out of that team's dugout once it lies still, runs to it, bends and picks it up, and runs back with it into the dugout, where he
 * is gone (entrance and exit, #42). Renderer only (rule 12): nothing waits for him; the next pitch happens on time while he is still out.
 * Route: straight when the bat lies on his dugout's side of the plate; otherwise round behind the plate umpire at BOY_BEHIND_Z, like the
 * on-deck walk (game.js odRoute), then down outside BAT_FROM and in from the field side, so he never crosses the pitch line or runs
 * through the catcher, the umpire or the next batter's walk-in spot. Back = the same route reversed.
 * Time tau = seconds since the batter's release (batdrop.js batRelease), so game.js can draw him in later events too (pure in time).
 * World frame as batdrop.js: x toward the first-base side, z toward the backstop; dugout = game.js dugout(team) = [+-26, -6]. */
export const BOY_GO = 2.0;              /* s after release he sets off: after the longest flight (HR flip from <= 2.5 m: 1.6 s) */
export const BOY_RUN_V = 6.0;           /* m/s out and back, a quick run */
export const BOY_ACCEL = .6;            /* s to reach full speed from a standstill (out of the dugout, out of the pick-up) */
export const BOY_PICK = .8;             /* s bent over the bat: down, grab, up */
export const BOY_PICK_OFF = [.2, -.45]; /* m from the bat's middle he stands at: [away from the plate, toward the field] (in front of it) */
export const BOY_BEHIND_Z = 4.2, BOY_ROUND_X = 3; /* round-behind waypoints (same as game.js OD_BEHIND_Z, OD_ROUND_X) */
export const BOY_SIDE_X = 3.6, BOY_SIDE_DZ = .25; /* then down the bat's side outside BAT_FROM (2.6) and in to the pick spot from the field side */
export const BOY_SCALE = .88;           /* a teenager next to the players */

/* where he stands to pick up a bat lying at land = {x, z, head} (batdrop.js batLand), len = bat length (m) */
export function pickSpot(land, len) {
  const mx = land.x + Math.sin(land.head) * len / 2, mz = land.z + Math.cos(land.head) * len / 2;
  return [mx + Math.sign(land.x || 1) * BOY_PICK_OFF[0], mz + BOY_PICK_OFF[1]];
}
/* route from the dugout point dug = [x, z] to the pick spot P: polyline points, cumulative lengths, total length */
export function boyRoute(dug, P) {
  const pts = Math.sign(dug[0]) === Math.sign(P[0]) ? [dug, P]
    : [dug, [Math.sign(dug[0]) * BOY_ROUND_X, BOY_BEHIND_Z], [Math.sign(P[0]) * BOY_SIDE_X, BOY_BEHIND_Z], [Math.sign(P[0]) * BOY_SIDE_X, P[1] - BOY_SIDE_DZ], P];
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, L: cum[cum.length - 1] };
}
/* distance run t s after setting off from a standstill (linear ramp to BOY_RUN_V over BOY_ACCEL), and its inverse total time */
function runS(t) { const a = BOY_RUN_V / BOY_ACCEL; return t < BOY_ACCEL ? a * t * t / 2 : BOY_RUN_V * BOY_ACCEL / 2 + BOY_RUN_V * (t - BOY_ACCEL); }
export function runT(L) { const s0 = BOY_RUN_V * BOY_ACCEL / 2; return L < s0 ? Math.sqrt(2 * L * BOY_ACCEL / BOY_RUN_V) : BOY_ACCEL + (L - s0) / BOY_RUN_V; }
function along(R, s) {
  s = Math.max(0, Math.min(R.L, s)); let i = 1;
  while (i < R.pts.length - 1 && R.cum[i] < s) i++;
  const a = R.pts[i - 1], b = R.pts[i], f = (s - R.cum[i - 1]) / Math.max(1e-9, R.cum[i] - R.cum[i - 1]);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, b[0] - a[0], b[1] - a[1]];
}
/* the whole trip for a bat lying at land, dugout dug: {route, pick: [x, z], bat: [x, z] middle, tOut, tPick, tBack, end} (tau, s) */
export function boyPlan(land, dug, len) {
  const P = pickSpot(land, len), route = boyRoute(dug, P), T = runT(route.L);
  const tOut = BOY_GO + T, tBack = tOut + BOY_PICK;
  return { route, pick: P, bat: [land.x + Math.sin(land.head) * len / 2, land.z + Math.cos(land.head) * len / 2], tOut, tPick: tOut + BOY_PICK / 2, tBack, end: tBack + T };
}
/* him at tau: null before BOY_GO and once back in the dugout; else {x, z, fx, fz (facing), bend 0..1, carry (holds the bat), phase} */
export function boyAt(plan, tau) {
  if (!(tau >= BOY_GO) || tau >= plan.end) return null;
  const R = plan.route;
  if (tau < plan.tOut) { const [x, z, fx, fz] = along(R, runS(tau - BOY_GO)); return { x, z, fx, fz, bend: 0, carry: false, phase: 'out' }; }
  if (tau < plan.tBack) {
    const k = (tau - plan.tOut) / BOY_PICK, bend = Math.sin(Math.PI * k);
    return { x: plan.pick[0], z: plan.pick[1], fx: plan.bat[0] - plan.pick[0], fz: plan.bat[1] - plan.pick[1], bend, carry: tau >= plan.tPick, phase: 'pick' };
  }
  const [x, z, fx, fz] = along(R, R.L - runS(tau - plan.tBack));
  return { x, z, fx: -fx, fz: -fz, bend: 0, carry: true, phase: 'back' };
}
