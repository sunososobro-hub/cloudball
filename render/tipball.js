/* #631: a foul tip's ball path from the plate into the mitt (plain maths, no three.js, no DOM). The ball grazes the bat, so its path bends
 * once at the bat: plate -> tick point (a little to the batter's side and up) -> mitt, ending in the mitt at the usual catch time. */
export const TIP_AT = .35;      /* share of the plate-to-mitt time at which the ball ticks the bat (the bend) */
export const TIP_SIDE = .28;    /* m the tick point sits off the plate point toward the batter */
export const TIP_UP = .14;      /* m the tick point sits above the plate point */
const lerp = (a, b, t) => a + (b - a) * t;
/* p0 plate point [x,y,z], p1 mitt point, side = +1 / -1 (sign of x toward the batter), t 0..1 over the plate-to-mitt time */
export function tipPath(p0, p1, side, t) {
  const k = [p0[0] + side * TIP_SIDE, p0[1] + TIP_UP, p0[2]], s = Math.max(0, Math.min(1, t));
  const [a, b, u] = s < TIP_AT ? [p0, k, s / TIP_AT] : [k, p1, (s - TIP_AT) / (1 - TIP_AT)];
  return [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
}
