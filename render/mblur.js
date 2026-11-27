/* Per-object motion blur on the tight batter shot and the plate camera (#211 item 4, second piece). Pure: no three.js, no DOM, no clock.
 * render/game.js loads it by dynamic import and, on `max` only, feeds three's `motionBlur` (MotionBlur.js, TSL) the scene pass's velocity target
 * (bat, arm, ball, camera) scaled by `scale` every frame. Velocity is the per-frame screen shift, so the exposure is turned into a per-frame
 * factor from the frame time: the streak length is the same at 30 and 144 fps. A frame that is not a step of play (seek, tab wake: dt over
 * MB_MAX_DT) or a shot weight under MB_MIN_W gets scale 0 = pass-through, so a jump equals playing there. Visual only (rules 10 and 12). */
export const MB_EXPOSURE_S = 1 / 120;   /* s: shutter open time (a 180 degree shutter at 60 fps) */
export const MB_MAX_DT = .1;            /* s: a longer frame is a jump, no blur */
export const MB_MIN_DT = 1 / 240;       /* s: dt floor, so a very short frame does not multiply the velocity by more than the exposure allows */
export const MB_MIN_W = .02;            /* shot weight under this: exactly off */
export const MB_MAX_UV = .02;           /* longest streak, as a share of the screen: a pose snap or a camera cut can not smear the picture */
export const MB_SAMPLES = 8;            /* taps along the streak (the node's cost) */
const fin = v => Number.isFinite(v);
/* tw, pw: 0..1 weights of the tight and plate shots; dt: seconds of the frame. scale multiplies the velocity target; cap is MB_MAX_UV. */
export function mbParams(tw, pw, dt) {
  const w = Math.max(fin(tw) ? tw : 0, fin(pw) ? pw : 0);
  if (w < MB_MIN_W || !fin(dt) || dt <= 0 || dt > MB_MAX_DT) return { scale: 0, cap: MB_MAX_UV };
  return { scale: Math.min(1, w) * MB_EXPOSURE_S / Math.max(dt, MB_MIN_DT), cap: MB_MAX_UV };
}
