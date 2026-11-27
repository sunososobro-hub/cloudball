/* #646: the ground roll of a base hit, from the landing spot to the engine's pickup spot (PL.target). Pure: no three.js, no DOM, no clock.
 * The engine keeps its result (rule 10, 12): the ball still ends at the same spot, and is still there before the fielder's pickup (catchT).
 * What changes is the way it gets there: constant friction deceleration (grass or dirt constant) instead of a fixed .8 s at constant
 * speed, so the speed only ever falls and is ~0 when it stops. If the engine's fielder needs the ball sooner than friction alone would
 * bring it, the deceleration is raised just enough to stop at catchT. A small hop at the landing only when the roll starts fast. */
export const ROLL_DECEL_GRASS = 3.2, ROLL_DECEL_DIRT = 2.2; /* m/s^2; a hard-hit baseball loses ~25-35% of its speed per s on grass */
export const ROLL_HOP_V = 4, ROLL_HOP_PER_V = .04, ROLL_HOP_MAX = .3, ROLL_G = 9.81; /* hop m = (v0-ROLL_HOP_V)*ROLL_HOP_PER_V, capped */
export const ROLL_Y = .15; /* ball centre height on the ground (game.js land / rollEnd y) */

/* land / end: [x, y, z]; avail: seconds from the landing to catchT; dirt: the landing spot is on the infield skin (dust.js onDirt). */
export function rollPlan(land, end, avail, dirt) {
  const d = Math.hypot(end[0] - land[0], end[2] - land[2]);
  if (!(d > 1e-6)) return { d: 0, a: 0, v0: 0, dur: 0, hop: 0, th: 0 };
  let a = dirt ? ROLL_DECEL_DIRT : ROLL_DECEL_GRASS, dur = Math.sqrt(2 * d / a);
  if (dur > avail) { dur = Math.max(avail, 1e-3); a = 2 * d / (dur * dur) }
  const v0 = a * dur, hop = Math.min(ROLL_HOP_MAX, Math.max(0, (v0 - ROLL_HOP_V) * ROLL_HOP_PER_V));
  return { d, a, v0, dur, hop, th: hop > 0 ? Math.sqrt(8 * hop / ROLL_G) : 0 };
}
/* Ball position t seconds after the landing. */
export function rollAt(r, land, end, t) {
  if (!(r.dur > 0) || t >= r.dur) return [end[0], end[1], end[2]];
  const s = (r.v0 * t - r.a * t * t / 2) / r.d, q = t < r.th ? t / r.th : 1;
  return [land[0] + (end[0] - land[0]) * s, land[1] + (end[1] - land[1]) * s + 4 * r.hop * q * (1 - q) * (t < r.th ? 1 : 0), land[2] + (end[2] - land[2]) * s];
}
/* Ground speed t seconds after the landing (m/s). */
export const rollSpeed = (r, t) => !(r.dur > 0) || t >= r.dur ? 0 : Math.max(0, r.v0 - r.a * t);
