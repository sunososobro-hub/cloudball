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
/* Operator follow (#209 item 1): the lens does not sit on a fixed point. It starts on PLATE_AIM and drifts, with a lag, onto the tag spot of the
 * play (S.CV.spot = [x, z] on the ground), as a camera operator who finds the runner and the catcher late. Pure function of (event, time),
 * so a jump lands on the same framing. PLATE_FOLLOW_LAG s after the lead-in starts the drift begins, it takes PLATE_FOLLOW_TIME s. */
export const PLATE_FOLLOW_LAG = .5, PLATE_FOLLOW_TIME = 1;
export function plateAim(e, u, contact) {
  const S = e && e.plan, sp = S && S.CV && S.CV.spot;
  if (!sp || typeof S.arrive !== 'number') return PLATE_AIM.slice();
  const t = u - contact - (S.arrive - PLATE_IN_BEFORE) - PLATE_FOLLOW_LAG, w = ease(sat(t / PLATE_FOLLOW_TIME));
  return [PLATE_AIM[0] + (sp[0] - PLATE_AIM[0]) * w, PLATE_AIM[1], PLATE_AIM[2] + (sp[1] - PLATE_AIM[2]) * w];
}
