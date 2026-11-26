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
