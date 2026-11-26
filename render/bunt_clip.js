/* #303: time warp and weight of the bunt mocap clip (assets/mocap/bunt_124_08.json) on the batter. Pure: game.js feeds it the
 * play time u and the pitch's ARRIVE time; tests/bunt_clip.check.mjs runs it.
 *   Clip frames (30 fps): 52-64 he squares around, 64-80 he holds the bat out over the plate (owner pick-up, assets/HANDOFF.md).
 *   Square: the clip's frames 52-64 play over the batter's own square-around window [ARRIVE-lead, ARRIVE-lead+dur]
 *   (BUNT_SQUARE_LEAD / BUNT_SQUARE_DUR in game.js), then the hold 64-80 is stretched to end on ARRIVE (contact), and it stays on
 *   frame 80 after that. Weight: blends in over the square window, full at contact, blends out over OUT after ARRIVE so the run
 *   to first starts from the batter's own pose. */
export const BUNT_CLIP_URL = 'assets/mocap/bunt_124_08.json';
export const BUNT_CLIP_FPS = 30;
export const BUNT_SQ_FRAMES = [52, 64];
export const BUNT_HOLD_FRAMES = [64, 80];
export const BUNT_CLIP_OUT = [0.2, 0.35];   /* seconds after ARRIVE: same hand-off to the run as a swung-at ball in play (SW_OUT_HIT) */
export const BUNT_CLIP_T0 = BUNT_SQ_FRAMES[0] / BUNT_CLIP_FPS;   /* clip time the root travel is measured from */

const sat = x => Math.max(0, Math.min(1, x));
const ease = x => x * x * (3 - 2 * x);
const lerp = (a, b, k) => a + (b - a) * k;

/* clip time (s) at play time u */
export function buntClipTime(u, arrive, lead, dur) {
  const a = arrive - lead, b = a + dur, f = BUNT_CLIP_FPS;
  if (u <= b) return lerp(BUNT_SQ_FRAMES[0], BUNT_SQ_FRAMES[1], sat((u - a) / dur)) / f;
  const hold = arrive - b;
  return lerp(BUNT_HOLD_FRAMES[0], BUNT_HOLD_FRAMES[1], hold > 0 ? sat((u - b) / hold) : 1) / f;
}

/* clip weight 0..1 at play time u (0 when the play is not a bunt) */
export function buntClipW(bunt, u, arrive, lead, dur) {
  if (!bunt) return 0;
  const w = ease(sat((u - (arrive - lead)) / dur)), o0 = arrive + BUNT_CLIP_OUT[0], o1 = arrive + BUNT_CLIP_OUT[1];
  return Math.min(w, 1 - ease(sat((u - o0) / (o1 - o0))));
}

/* #43 item 5 (owner 2026-11-21: "the ball looks like it floats"): path of a bunted ball from the bat (p0) to where the engine says it
 * stops being a roll (p1, reached at T = play.hang, engine BUNT_DIST / BUNT_ROLL_SPEED). The engine's timing is kept exactly (rule 12):
 * the ball is at p1 at T. Inside that: it leaves the bat going down and hits the dirt within BUNT_FIRST_HOP m, takes the low hops in
 * BUNT_HOP_LEN / BUNT_HOP_H, then rolls on the ground (height g) while slowing down at a constant rate (friction) to BUNT_END_V of its
 * starting speed at T. Before: a straight line with a 0.6 m (GB_PEAK) arch at constant speed, i.e. gliding at bat height. */
export const BUNT_FIRST_HOP = 1.2;          /* m along the ground from the bat to the first touch of the dirt */
export const BUNT_FIRST_SHARE = .25;        /* on a short bunt the first touch comes within this share of the distance */
export const BUNT_HOP_LEN = [1.6, 1.0];     /* m: the low hops after the first touch */
export const BUNT_HOP_H = [.12, .04];       /* m: their heights; after them it rolls */
export const BUNT_HOP_SHARE = .6;           /* the hops use at most this share of what is left after the first touch */
export const BUNT_END_V = .25;              /* speed at T over speed off the bat: constant friction in between */
export const BUNT_DOWN = .6;                /* share of the first drop that is the ball's downward angle off the bat (rest: gravity) */

/* share of the ground distance covered at time share k (0..1) under constant deceleration ending at BUNT_END_V */
export function buntRollShare(k) {
  const x = sat(k), r = BUNT_END_V;
  return (2 * x - (1 - r) * x * x) / (1 + r);
}

/* height above the ground plane g at s metres along a roll of total length D, starting at height y0 */
export function buntRollY(s, D, y0, g) {
  const s1 = Math.min(BUNT_FIRST_HOP, BUNT_FIRST_SHARE * D);
  if (s <= s1) { const q = s1 > 0 ? sat(s / s1) : 1; return g + (y0 - g) * (1 - (BUNT_DOWN * q + (1 - BUNT_DOWN) * q * q)) }
  const tot = BUNT_HOP_LEN.reduce((a, b) => a + b, 0), k = Math.min(1, Math.max(0, D - s1) * BUNT_HOP_SHARE / tot);
  let a = s1;
  for (let i = 0; i < BUNT_HOP_LEN.length; i++) {
    const L = BUNT_HOP_LEN[i] * k;
    if (L > 0 && s < a + L) { const q = (s - a) / L; return g + BUNT_HOP_H[i] * k * 4 * q * (1 - q) }
    a += L;
  }
  return g;
}

/* ball position [x, y, z] at t seconds after contact (0..T); p0 = bat sweet spot, p1 = roll end (its y is the ground height) */
export function buntRoll(p0, p1, T, t) {
  const k = T > 0 ? buntRollShare(t / T) : 1, D = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
  return [lerp(p0[0], p1[0], k), buntRollY(k * D, D, p0[1], p1[1]), lerp(p0[2], p1[2], k)];
}
