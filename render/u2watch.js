/* render/u2watch.js (#42, last item 3 piece): the second-base umpire working inside (game.js ST_U2_IN, a runner on base) turns to
 * watch the play at first base while U1 calls it, instead of staring at home with his back half to the play. Plain math, no three.js:
 * game.js loads it with import() and does nothing until it is in. Pure function of (calls of the event, time), so a seek lands where
 * playing would. tests/u2watch.check.mjs runs it.
 *
 * calls = game.js bcCalls(e): [{b, t, out, at?}], b = bag 1-4, t = call start (s into the event), `at` = a fly catch spot (not a bag play).
 * env = the call envelope of game.js (BC_UP, BC_HOLD, BC_DOWN), so his turn rises and falls with U1's signal. */
export const U2_WATCH={LEAD:.4,TURN:.85};/* starts LEAD s before U1's call (he follows the throw); turns TURN of the way from home to the bag */

const sat01=t=>Math.max(0,Math.min(1,t)),ease=t=>t*t*(3-2*t);

/* weight 0..1 of the watch turn at time u for plays at bag b (bag plays only, fly calls ignored) */
export function watchWeight(calls,b,u,env){const {up,hold,down}=env,L=U2_WATCH.LEAD;let w=0;
  for(const q of calls||[]){if(q.b!==b||q.at)continue;const t=u-(q.t-L);if(t<0)continue;
    const s=ease(sat01(t/(up+L)))*(1-ease(sat01((t-L-hold)/down)));if(s>w)w=s}
  return w}

/* yaw (three.js rotation.y, 0 = facing +z) turned k of the shortest way from y0 toward the point (bx, bz), standing at (px, pz) */
export function turnYaw(y0,px,pz,bx,bz,k){const y1=Math.atan2(bx-px,bz-pz);return y0+Math.atan2(Math.sin(y1-y0),Math.cos(y1-y0))*k}
