/* #655: the ball of a bunt attempt that goes foul (engine e.r 'foul', e.bunt). Pure: game.js feeds it the bat's sweet spot, the foul side
 * and the seconds since the pitch arrived; tests/foul_bunt.check.mjs runs it.
 * A short hop off the bat to a spot on the foul side near the plate, then it rolls out slowing and rests; gone after FB_GONE.
 * World: home plate near z .6, the field is -z, +x = foulDir 1. Every number is named, nothing is random (rule 10, 11). */
export const FB_X = 4.5;          /* m to the foul side where it first lands */
export const FB_Z = -2.2;         /* m toward the pitcher: x past z keeps it outside the 45 degree line, so it is foul */
export const FB_T = 0.8;          /* s of the hop */
export const FB_PEAK = 0.35;      /* m, height of the hop */
export const FB_ROLL_X = 2.5;     /* m it rolls on along x after landing */
export const FB_ROLL_Z = -1.8;    /* m it rolls on along z after landing */
export const FB_ROLL_T = 1.1;     /* s of the roll (ease-out) */
export const FB_GONE = 2.4;       /* s after the pitch arrives the ball is taken out of the picture */
export const FB_MAX_DIST = 25;    /* m: acceptance bound from the plate */

const lerp = (a, b, k) => a + (b - a) * k;
const arc = (p0, p1, peak, t) => [lerp(p0[0], p1[0], t), lerp(p0[1], p1[1], t) + peak * 4 * t * (1 - t), lerp(p0[2], p1[2], t)];

/* ball position at t seconds after ARRIVE, or null once it is gone. hit0 = the sweet spot at contact, dir = e.foulDir (+1 / -1) */
export function foulBuntBall(hit0, dir, t, groundY) {
  const L = [dir * FB_X, groundY, FB_Z], E = [dir * (FB_X + FB_ROLL_X), groundY, FB_Z + FB_ROLL_Z];
  if (t < FB_T) return arc(hit0, L, FB_PEAK, t / FB_T);
  if (t < FB_T + FB_ROLL_T) { const k = (t - FB_T) / FB_ROLL_T; return arc(L, E, 0, 1 - (1 - k) * (1 - k)); }
  return t < FB_GONE ? E : null;
}
