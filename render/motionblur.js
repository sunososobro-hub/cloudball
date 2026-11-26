/* Per-object motion blur on max (#211 item 4, second piece). Pure: no three.js, no DOM, no clock. render/game.js loads it by dynamic import and, on
 * `max` only, blurs the scene colour along the velocity target (bat, arm, ball: the same MRT channel TRAA reads) inside the tight batter shot and the
 * plate camera, where the camera holds still and the motion on screen is the players'. Elsewhere the scale is 0 and the pass is an exact
 * pass-through (every sample at offset 0). Which shot is on is a pure function of (event, time), so a jump equals playing there; the blur itself
 * is a picture effect: no event timing, no pose, no engine input (rules 10 and 12). mbVec is the plain-number twin of the vector maths in game.js. */
export const MB_SHUTTER = .5;      /* fraction of a frame the virtual shutter stays open (180 degree shutter) */
export const MB_MAX_UV = .03;      /* longest blur, as a fraction of the screen: a fast bat smears, nothing streaks across the frame */
export const MB_SAMPLES = 8;       /* taps along the velocity (three's default is 16; 8 keeps the cost small on top of SSGI + DoF) */
export const MB_MIN_W = .02;       /* below this shot weight the effect is exactly off */
const fin = v => Number.isFinite(v);
/* tw, pw: 0..1 weights of the tight batter shot and the plate camera (tightW / plateW). Returns the uniform: shutter fraction x weight x 0.5 (NDC -> uv). */
export function mbScale(tw, pw) {
  const w = Math.max(fin(tw) && tw >= MB_MIN_W ? tw : 0, fin(pw) && pw >= MB_MIN_W ? pw : 0);
  return w ? .5 * MB_SHUTTER * Math.min(1, w) : 0;
}
/* The blur vector for one pixel: its velocity (NDC per frame) times the scale, length clamped to MB_MAX_UV. */
export function mbVec(vx, vy, k) {
  if (!fin(vx) || !fin(vy) || !fin(k)) return [0, 0];
  const x = vx * k, y = vy * k, len = Math.hypot(x, y);
  if (len <= MB_MAX_UV) return [x, y];
  const s = MB_MAX_UV / len;
  return [x * s, y * s];
}
