/* Video finish on `max` (#209 item 3): fine grain and a highlight roll-off, so the picture reads like a telecast and not like a raw render.
 * Pure: no three.js, no DOM, no clock. render/game.js builds the same maths in TSL after bloom (setupPost, `max` only, no extra pass) and feeds
 * `finU.f` = grainFrame(curT()), so a seek shows the same grain as playing there. Visual only (rules 10, 12). Tune the numbers here; tests/finish.check.mjs guards them. */
export const GRAIN_AMT = .035;       /* peak of the grain, in linear colour (about 3.5% of full white; dark scenes keep it as is) */
export const GRAIN_FPS = 24;         /* the grain pattern changes this many times a second (film rate), not every render frame */
export const ROLL_KNEE = .8;         /* linear value where highlights start to bend */
export const ROLL_MAX = 1.15;        /* what an infinitely bright highlight settles at (renderOutput's tone map takes it from there) */
export const SOFT_LIFT = .012;       /* black lift (soft toe): blacks sit at this linear value, not at 0, the way a video chain never quite crushes; whites unchanged */
const fin = v => Number.isFinite(v);
/* Soft shoulder: identity up to ROLL_KNEE, then an exponential approach to ROLL_MAX. Continuous, slope 1 at the knee, strictly increasing, never above ROLL_MAX. */
export function roll(x) {
  if (!fin(x)) return 0;
  if (x <= ROLL_KNEE) return x;
  const r = ROLL_MAX - ROLL_KNEE;
  return ROLL_KNEE + r * (1 - Math.exp(-(x - ROLL_KNEE) / r));
}
/* Grain pattern index for a game time in seconds: same time, same pattern. */
export const grainFrame = t => fin(t) && t > 0 ? Math.floor(t * GRAIN_FPS) : 0;
/* Black lift: maps 0 -> SOFT_LIFT and 1 -> 1, a straight line (applied before roll, so the shoulder still sees the lifted value). */
export const lift = x => fin(x) ? SOFT_LIFT + (1 - SOFT_LIFT) * x : 0;
