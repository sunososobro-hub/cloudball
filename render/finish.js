/* Video finish on `max` (#209 item 3, plain Node: no three.js, no DOM, no clock, no Math.random). render/game.js loads it by dynamic import and, on `max`
 * only, runs the picture (after bloom, before the vignette) through a highlight roll-off and a fine film grain. Both are uniforms of the one post
 * node: no extra full-screen pass, no download, tiers 0-3 untouched. The grain seed is a function of the event time `curU` (quantized to FINISH_FPS),
 * so a seek shows the same picture as playing there. Visual only: no event timing, no pose, no engine input (rules 10 and 12).
 * `rollOff` is the same curve the shader writes: below the knee the value is unchanged, above it climbs smoothly toward the ceiling and never clips. */
export const FINISH_KNEE = 1.2;          /* linear radiance where the roll-off starts (bloom threshold is 1.6; lamps and white chalk sit above) */
export const FINISH_CEIL = 3.4;          /* the value highlights approach but never reach */
export const FINISH_FPS = 24;            /* grain changes this many times per second of game time (film rate) */
export const FINISH_GRAIN_MAX = .06;     /* hard cap on the grain amplitude (fraction of the pixel's own value) */
export const FINISH_SEED_MOD = 4093;     /* seeds wrap here so the shader's hash input stays small (float precision) */
export const FINISH_GRAIN = {            /* per park sky, same keys as SKIES / MOODS in grade.js; lamp night shows the most grain, clean day the least */
  night: .034, dusk: .03, afternoon: .02, morning: .024,
};
export const FINISH_GRAIN_NEUTRAL = .025;
const fin = v => Number.isFinite(v);
/* The highlight curve: x <= knee unchanged; above it knee + (ceil - knee) * (1 - exp(-(x - knee) / (ceil - knee))): slope 1 at the knee, always < ceil. */
export function rollOff(x, knee = FINISH_KNEE, ceil = FINISH_CEIL) {
  if (!fin(x) || x <= knee) return fin(x) ? x : 0;
  const span = ceil - knee;
  return knee + span * (1 - Math.exp(-(x - knee) / span));
}
export const grainOf = sky => Math.min(FINISH_GRAIN_MAX, FINISH_GRAIN[sky] ?? FINISH_GRAIN_NEUTRAL);
/* Uniform values for one frame: max off or a bad time -> grain 0 and an out-of-reach knee make the node a pass-through. */
export function finishParams(sky, u, on = true) {
  if (!on) return { grain: 0, knee: FINISH_CEIL, ceil: FINISH_CEIL + 1, seed: 0 };
  const f = fin(u) && u > 0 ? Math.floor(u * FINISH_FPS) : 0;
  return { grain: grainOf(sky), knee: FINISH_KNEE, ceil: FINISH_CEIL, seed: f % FINISH_SEED_MOD };
}
