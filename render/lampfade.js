/* #255, lamp sprites fade out near the camera (plain data + pure maths, no three.js, no DOM).
 * Each light tower carries two additive sprites: the lamp glow (30 m) and the aureole (HALO_SCALE 95 m) at 46 m height. A low camera behind
 * the first-base line passes within a few tens of metres of the home-side towers, so one sprite can cover 40 percent of the frame and the
 * additive sum plus bloom reads as flat white. The beams already fade by distance (45..130 m); the sprites now do too: 0 at or below
 * LAMP_FADE_NEAR m, 1 at or above LAMP_FADE_FAR m, smoothstep between. game.js reads these two numbers into shader uniforms (it is a plain
 * script, so it imports this file once and falls back to the same values until then). Check: tests/lampfade.check.mjs. */
export const LAMP_FADE_NEAR = 45, LAMP_FADE_FAR = 140;
export function lampFade(dist, near = LAMP_FADE_NEAR, far = LAMP_FADE_FAR) {
  const t = Math.max(0, Math.min(1, (dist - near) / (far - near)));
  return t * t * (3 - 2 * t);
}
