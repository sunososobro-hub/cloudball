/* #645 (#638 step 1 audit: a grounder was one 0.6 m parabola from the bat to the fielder over the engine's hang, so it floated,
 * then sat still at the land point until the catch). Pure path of a ground ball, no DOM: game.js feeds it the bat point p0, the
 * engine's land point p1 (reached at T = play.hang, rule 12) and the play time t; tests/gb_path.check.mjs runs it.
 *   Air: the ball leaves the bat going down and touches the ground after GB_DROP_SHARE of the air time, then takes up to GB_HOPS
 *   hops. Every airborne piece is a real gravity parabola (GB_G). Each touch keeps GB_E of the vertical speed and GB_KEEP of the
 *   horizontal one; dirt (dust.js onDirt, same field map as the puffs) bounces higher and grabs more than grass. A hop shorter than
 *   GB_HOP_MIN, or the time left after GB_AIR_SHARE of T, is a roll on the ground.
 *   Roll: speed decays by GB_ROLL_K per second (friction), so the ball is still moving at T and keeps rolling past the land point
 *   toward the glove until the catch.
 *   Horizontal speeds are one unknown times fixed factors, solved so the ball is at p1 exactly at T. */
export const GB_G = 9.81;              /* m/s^2 */
export const GB_GROUND_Y = .15;        /* game.js ground-ball height (land[1] of a grounder) */
export const GB_HOPS = 3;              /* hops after the first touch: 2-4 touches with the drop */
export const GB_AIR_SHARE = .8;        /* most of T the ball may spend in the air; the rest rolls */
export const GB_DROP_SHARE = .3;       /* share of the air time from the bat to the first touch */
export const GB_HOP_MIN = .04;         /* s: shorter hops are folded into the roll */
export const GB_E = { dirt: .5, grass: .4 };      /* vertical restitution at a touch */
export const GB_KEEP = { dirt: .85, grass: .9 };  /* horizontal speed kept at a touch */
export const GB_ROLL_K = { dirt: .6, grass: .9 }; /* 1/s rolling speed decay */

/* plan of one grounder: drop + hops (start, duration, vertical launch speed, start height, horizontal speed factor) and the roll */
export function gbPlan(p0, p1, T, dirt) {
  const s = dirt ? 'dirt' : 'grass', e = GB_E[s], kp = GB_KEEP[s], kr = GB_ROLL_K[s], g = GB_G;
  const h = Math.max(.01, p0[1] - GB_GROUND_Y), A = GB_AIR_SHARE * Math.max(T, 1e-6);
  const t0 = Math.min(GB_DROP_SHARE * A, Math.sqrt(2 * h / g)), vy0 = (g * t0 * t0 / 2 - h) / t0, vimp = g * t0 - vy0;
  const segs = [{ a: 0, d: t0, vy: vy0, y: p0[1], f: 1 }];
  let geo = 0; for (let k = 0; k < GB_HOPS; k++) geo += e ** k;
  let d1 = Math.min((A - t0) / geo, 2 * e * vimp / g), a = t0, f = 1;
  for (let k = 0; k < GB_HOPS; k++, d1 *= e) {
    if (d1 < GB_HOP_MIN) break;
    f *= kp; segs.push({ a, d: d1, vy: g * d1 / 2, y: GB_GROUND_Y, f }); a += d1;
  }
  const fr = f * kp, roll = k => k <= 0 ? 0 : (1 - Math.exp(-kr * k)) / kr;
  let sum = fr * roll(T - a); for (const q of segs) sum += q.d * q.f;
  const D = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]), u0 = sum > 0 ? D / sum : 0;
  return { segs, air: a, fr, kr, u0, D, roll };
}

/* ball position at play time t (0 = contact; t > T keeps rolling the same way, slowing) */
export function gbPath(p0, p1, T, t, dirt, plan) {
  const P = plan || gbPlan(p0, p1, T, dirt), dx = p1[0] - p0[0], dz = p1[2] - p0[2], L = Math.hypot(dx, dz) || 1;
  let s = 0, y = GB_GROUND_Y;
  if (t <= 0) return [p0[0], p0[1], p0[2]];
  for (const q of P.segs) {
    const k = Math.min(t, q.a + q.d) - q.a;
    if (k <= 0) break;
    s += P.u0 * q.f * k;
    if (t < q.a + q.d) { y = q.y + q.vy * k - GB_G * k * k / 2; break }
  }
  if (t > P.air) s += P.u0 * P.fr * P.roll(t - P.air);
  return [p0[0] + dx / L * s, Math.max(GB_GROUND_Y, y), p0[2] + dz / L * s];
}

/* After T (out plays): from the land point into the glove, reached at catchT, never still. The engine puts the fielder at its stand
 * point (CATCH_STAND_OFF from the land point) at the catch; the glove takes the ball GB_GLOVE_IN m from the land point toward him. */
export const GB_GLOVE_IN = .25;
export function gbGlove(p1, stand, T, catchT, t) {
  const dx = stand[0] - p1[0], dz = stand[1] - p1[2], L = Math.hypot(dx, dz), w = L > 1e-6 ? Math.min(GB_GLOVE_IN, L) / L : 0;
  const k = catchT > T ? Math.max(0, Math.min(1, (t - T) / (catchT - T))) : 1;
  return [p1[0] + dx * w * k, GB_GROUND_Y, p1[2] + dz * w * k];
}
