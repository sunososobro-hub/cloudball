/* Video finish on `max` (#209 item 3, plain data + pure maths: no three.js, no DOM, no clock, no Math.random).
 * render/game.js loads it by dynamic import and, on `max` only, runs the picture through three small steps before tone mapping:
 *   1. highlight roll-off: `rolloff` bends linear light above KNEE toward 1 instead of clipping (a telecast shoulder);
 *   2. one grade per park: a tint and a saturation per sky (same names as render/grade.js MOODS);
 *   3. fine grain: noise that changes FILM_FPS times a second, its seed `grainSeed(T)` a pure function of game time (a seek = playing there).
 * Softness is left to bloom + TRAA (no extra full-screen pass). Visual only: nothing here reaches the engine (rules 10, 12). Tune on the owner's GPU. */
export const FILM_FPS = 24;               /* grain frames per second of game time (film cadence) */
export const FILM_SEEDS = 997;            /* grain seed ring (prime) */
export const KNEE = .8;                   /* linear light above this starts to roll off */
export const FILM_GRAIN_MAX = .06, FILM_SAT_MIN = .8, FILM_SAT_MAX = 1.2, FILM_TINT_MIN = .85, FILM_TINT_MAX = 1.15;
export const FILM_NEUTRAL = { grain: .02, tint: [1, 1, 1], sat: 1 };
export const FILMS = {
  night: { grain: .032, tint: [.97, 1, 1.05], sat: 1.04 },     /* lamp night: more grain, cool */
  dusk: { grain: .024, tint: [1.05, .99, .94], sat: 1.08 },    /* warm, a little richer */
  afternoon: { grain: .018, tint: [1.02, 1.01, .97], sat: 1.02 },
  morning: { grain: .02, tint: [.98, 1, 1.04], sat: 1 },
};
export const filmOf = name => FILMS[name] || FILM_NEUTRAL;
/* Soft shoulder: identity up to `knee`, then knee + (1-knee)(1-e^-(x-knee)/(1-knee)): continuous, increasing, slope 1 at the knee, never above 1. x < 0 -> 0. */
export function rolloff(x, knee = KNEE) {
  if (!Number.isFinite(x) || x <= 0) return 0;
  if (x <= knee) return x;
  const r = 1 - knee;
  return knee + r * (1 - Math.exp(-(x - knee) / r));
}
/* Game time (seconds) -> grain seed; same T, same seed; NaN / negative -> 0. */
export function grainSeed(T) {
  if (!Number.isFinite(T) || T <= 0) return 0;
  return Math.floor(T * FILM_FPS) % FILM_SEEDS;
}
