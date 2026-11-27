/* render/umpcov.js (#612 part 9): the plate umpire covers third while U3 is out on a deep fly (4-man mechanics, runner on base).
 * U3 leaves his post for the outfield (render/umpout.js plan); with a runner on, the plate umpire walks half way up the third-base line
 * (COV_FRAC of home -> U3's post) and stays until U3 starts back, then returns to his usual spot inside U3's trip. Plain math, no three.js;
 * game.js loads it with import() and does nothing until it is in. Pure function of (U3's plan, post, time), so a seek lands where playing
 * would. It returns a weight 0..1 and a spot; game.js blends the plate umpire's own position toward the spot by the weight, so he never
 * jumps (weight 0 = exactly where placeUmp put him). Nothing here touches an outcome (rules 10, 12).
 * tests/umpcov.check.mjs runs it. */
export const UMP_COV={FRAC:.5,V:5};
const sat01=t=>Math.max(0,Math.min(1,t)),ease=t=>t*t*(3-2*t),hyp=Math.hypot;

/* plan = {go, t, back, end, to:[x,z], from:[0,0]} or null. out = outPlan() of U3, post = U3's post, hasRunner = a runner on base at the event start.
 * Needs one leg (t s) to fit between U3's start and his turn back, and another between his turn back and his return. */
export function covPlan(out, post, hasRunner) {
  if (!out || !hasRunner || !Array.isArray(post)) return null;
  const to = [post[0] * UMP_COV.FRAC, post[1] * UMP_COV.FRAC], t = hyp(to[0], to[1]) / UMP_COV.V;
  if (!(t > 0) || !(out.back - out.go >= t) || !(out.end - out.back >= t)) return null;
  return {go: out.go, t, back: out.back, end: out.back + t, to};
}

/* {w, x, z, fx, fz}: weight of the cover spot at event time u, and the unit direction he faces while it is on (toward third; walking = along the leg) */
export function covAt(plan, u) {
  if (!plan || !(u > plan.go) || !(u < plan.end)) return {w: 0, x: 0, z: 0, fx: 0, fz: 0};
  const k = u < plan.back ? ease(sat01((u - plan.go) / plan.t)) : 1 - ease(sat01((u - plan.back) / plan.t)),
    n = hyp(plan.to[0], plan.to[1]) || 1, s = u < plan.back ? 1 : -1;
  return {w: k, x: plan.to[0], z: plan.to[1], fx: s * plan.to[0] / n, fz: s * plan.to[1] / n};
}
