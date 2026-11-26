/* Runner's lead off the bag (#268). Pure: no three.js, no DOM, no clock. render/game.js loads it by dynamic import.
 * Where the runner stands is the engine's (leadAt(u): on the bag in the set, out to LEAD_PITCH m over the delivery, back after the
 * pitch). This module only says how he looks while he does it: a side shuffle (crab steps, facing the pitcher, feet apart, knees bent)
 * instead of a forward jog sideways. Picture only (rules 10 and 12): no event timing, no position, no engine input.
 * Every value is a pure function of (time into the pitch frame, lead metres), so a bar jump lands on the same pose. */
import { RELEASE, ARRIVE, LEAD_OPEN, LEAD_BACK_AT, LEAD_BACK_DUR } from '../engine/constants.js';

export const LEAD_POSE_IN = .5;     /* s: he settles into the crouch this long before the shuffle starts (the pitcher is in the set) */
export const LEAD_POSE_OUT = .4;    /* s: he stands up this long after he is back on the bag */
export const LEAD_STEP = .9;        /* m covered by one shuffle step (push with the lead foot, close with the trail foot) */
export const LEAD_SPLAY = .2;       /* rad each leg is out from the hip in the ready stance (feet apart) */
export const LEAD_STEP_SPLAY = .2;  /* rad of extra spread at the middle of a step (feet widest), back to LEAD_SPLAY as they close */
export const LEAD_CROUCH = .3;      /* crouch weight at full pose (knees, lean), on game.js crouch() */
export const LEAD_TURN = .3;        /* s: on the break he turns from the pitcher to the base path and comes out of the crouch */

const sat = x => Math.max(0, Math.min(1, x)), ease = x => x * x * (3 - 2 * x);
export const LEAD_FROM = RELEASE - LEAD_OPEN;                          /* engine: the lead starts to grow */
export const LEAD_HOME = ARRIVE + LEAD_BACK_AT + LEAD_BACK_DUR;        /* engine: back on the bag */

/* weight of the lead pose at u s into a pitch frame: 0 standing on the bag, 1 in the shuffle stance */
export function leadW(u) {
  return ease(sat((u - (LEAD_FROM - LEAD_POSE_IN)) / LEAD_POSE_IN)) * (1 - ease(sat((u - LEAD_HOME) / LEAD_POSE_OUT)));
}
/* spread of each leg (rad from the hip) for lead ld m at pose weight w: wide mid-step, closed to the stance at each step's end */
export function leadSplay(ld, w) {
  const s = Math.sin(Math.PI * Math.max(0, ld) / LEAD_STEP);
  return w * (LEAD_SPLAY + LEAD_STEP_SPLAY * s * s);
}
/* yaw (three.js rotation.y, atan2(dx, dz)) of a runner at (x, z) facing the pitcher at (px, pz) */
export function leadYaw(x, z, px, pz) { return Math.atan2(px - x, pz - z); }
/* weight of the lead stance left on a runner u s into the frame who breaks at st0 (1 before the break, 0 after LEAD_TURN) */
export function breakW(u, st0) { return 1 - ease(sat((u - st0) / LEAD_TURN)); }
/* shortest-way blend between two yaws, k = weight of b */
export function yawMix(a, b, k) { let d = b - a; d -= 2 * Math.PI * Math.round(d / (2 * Math.PI)); return a + d * k; }
