/* Depth of field on the tight batter shot and the plate camera (#211 item 4, first piece). Pure: no three.js, no DOM, no clock. render/game.js loads
 * it by dynamic import and, on `max` only, feeds three's DepthOfFieldNode (focus distance, focal length, bokeh scale) every frame from the camera
 * weight of the shot (tightW / plateW, both pure in (event, time)). Outside those shots the scale is 0: the node passes the picture through.
 * Visual only: no event timing, no pose, no engine input (rules 10 and 12). */
export const DOF_TIGHT_LEN = 3.5;        /* m: how far from the focal plane a thing is fully out of focus, tight batter shot (a few metres: catcher and ump soften) */
export const DOF_PLATE_LEN = 2.2;        /* m: same on the plate camera (long lens from 2B side, 9 deg: the park behind the plate goes soft) */
export const DOF_TIGHT_SCALE = 2.5;      /* unitless bokeh size at full weight (three's `bokehScale`) */
export const DOF_PLATE_SCALE = 3;
export const DOF_MIN_W = .02;            /* below this weight the effect is exactly off (scale 0) */
const fin = v => Number.isFinite(v);
/* tw, pw: 0..1 weights of the two shots; dist: metres from the camera to the thing in focus (batter for tight, the plate aim for the plate camera). */
export function dofParams(tw, pw, dist) {
  const w = fin(pw) && pw >= DOF_MIN_W ? pw : fin(tw) && tw >= DOF_MIN_W ? tw : 0, plate = fin(pw) && pw >= DOF_MIN_W;
  if (!w || !fin(dist) || dist <= 0) return { focus: 1, length: 1, scale: 0 };
  return { focus: dist, length: plate ? DOF_PLATE_LEN : DOF_TIGHT_LEN, scale: (plate ? DOF_PLATE_SCALE : DOF_TIGHT_SCALE) * Math.min(1, w) };
}
