/* Play-at-the-plate camera weight (#209 item 1). Pure: no three.js, no DOM, no clock. render/game.js loads it by dynamic import and blends
 * the auto broadcast seat toward a high home camera (behind the backstop net, narrow lens aimed at the plate) while a runner is tagged or
 * tags up at home. The weight is a pure function of (event, time since the event start), so a bar jump lands on the same framing.
 * Camera only: no event timing, no pose, no engine input (rules 10 and 12). Plan times count from contact, so `arrive` is the second
 * the throw reaches the catcher, `contact` is the event's own contact time (game.js ARRIVE). */
export const PLATE_CAM_Y = 6.6, PLATE_CAM_Z = 31, PLATE_AIM = [0, 1, .6], PLATE_FOV = 9;
export const PLATE_IN_BEFORE = 1.4, PLATE_OUT_AFTER = 2.2, PLATE_EASE = .5;   /* s before / after the arrival, s of each ease */
const sat = x => Math.max(0, Math.min(1, x)), ease = x => x * x * (3 - 2 * x);
export function plateW(e, u, contact) {
  const S = e && e.k === 'P' && e.r === 'inplay' && e.plan;
  if (!S || !S.CV || S.CV.base !== 4 || !S.tagPlay || typeof S.arrive !== 'number') return 0;
  const t = u - contact;
  return ease(sat((t - (S.arrive - PLATE_IN_BEFORE)) / PLATE_EASE)) * (1 - ease(sat((t - (S.arrive + PLATE_OUT_AFTER - PLATE_EASE)) / PLATE_EASE)));
}
