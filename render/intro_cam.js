/* render/intro_cam.js: the camera while the entry card (#intro) is up (#73). Pure data, no three.js, no DOM (plain Node check: tests/intro_cam.check.mjs).
 * A slow wide drift over the whole park, high and behind the plate, aimed at the outfield stands. game.js also hides every figure while the card
 * is up (nobody can stand behind it), and the first real shot takes over when the card closes. A pure function of the clock, never of the game. */
export const INTRO_X = 14;          /* sideways drift, metres each side of the centre line */
export const INTRO_PERIOD_S = 40;   /* one full drift there and back */
export const INTRO_Y = 26;          /* camera height, m: over the roof line of the home stand, looking down at the park */
export const INTRO_Z = 24;          /* behind the plate, still inside the park */
export const INTRO_AIM = [0, 6, -70];  /* centre of the outfield stands */
export const INTRO_FOV = 62;
export function introShot(tSec) {
  const a = 2 * Math.PI * (tSec / INTRO_PERIOD_S), s = Math.sin(a);
  return { x: INTRO_X * s, y: INTRO_Y, z: INTRO_Z, tx: INTRO_AIM[0] - INTRO_X * s * .5, ty: INTRO_AIM[1], tz: INTRO_AIM[2], fov: INTRO_FOV };
}
