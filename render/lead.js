/* Runner's lead off the bag (#268). Pure: no three.js, no DOM, no clock. render/game.js loads it by dynamic import.
 * Where the runner stands is the engine's (leadAt(u): at the primary lead in the set, out to LEAD_PITCH m over the delivery, back to
 * the primary lead after the pitch, #23; tagLeadAt: back to the bag for a tag-up). This module only says how he looks while he does it: a side shuffle (crab steps, facing the pitcher, feet apart, knees bent)
 * instead of a forward jog sideways. Picture only (rules 10 and 12): no event timing, no position, no engine input.
 * Every value is a pure function of (time into the pitch frame, lead metres), so a bar jump lands on the same pose. */

export const LEAD_POSE_D = 1;      /* m off the bag where the stance is full; nearer the bag he stands up (a tag-up walking back) */
export const LEAD_STEP = .9;        /* m covered by one shuffle step (push with the lead foot, close with the trail foot) */
export const LEAD_SPLAY = .2;       /* rad each leg is out from the hip in the ready stance (feet apart) */
export const LEAD_STEP_SPLAY = .2;  /* rad of extra spread at the middle of a step (feet widest), back to LEAD_SPLAY as they close */
export const LEAD_CROUCH = .3;      /* crouch weight at full pose (knees, lean), on game.js crouch() */
export const LEAD_TURN = .3;        /* s: on the break he turns from the pitcher to the base path and comes out of the crouch */

const sat = x => Math.max(0, Math.min(1, x)), ease = x => x * x * (3 - 2 * x);

/* weight of the lead pose for a runner ld m off his bag: 0 standing on the bag, 1 in the shuffle stance from LEAD_POSE_D out.
 * Distance, not time: since #23 part 1 a held runner stays at the primary lead between pitches, so the stance stays on. */
export function leadW(ld) { return ease(sat(ld / LEAD_POSE_D)); }
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
