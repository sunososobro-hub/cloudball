/* render/umpout.js (#612 part 8): the line umpires work the outfield. On a fly ball caught deep (RF / LF side), the umpire of that
 * line (U1 right, U3 left) leaves his post, runs out along the ray from his post toward the catch spot, stands there for the out call,
 * and walks back to his post inside the same event. Plain math, no three.js; game.js loads it with import() and does nothing until
 * it is in. Pure function of (call, post, event length, time), so a seek lands where playing would (rule 12: the catch is the engine's;
 * nothing here touches an outcome, rule 10). tests/umpout.check.mjs runs it.
 *
 * call = game.js bcCalls(e) entry with `at` ([x, z] catch spot, home at 0,0, pitcher at -z) and t = call start (s into the event).
 * Nobody appears or vanishes: no room to be back at his post before the event ends -> no trip (never a jump to the next event). */
export const UMP_OUT={MIN_DEPTH:60,FRAC:.35,MAX:22,MIN:3,V_OUT:6,V_BACK:3.5,ARRIVE_BEFORE:.25,BACK_WAIT:.3,CF_K:.35};

const hyp=Math.hypot;
/* plan = {go, t1, t2, hold, from:[x,z], to:[x,z], at, D}; null = he stays at his post. holdLen = call length (BC_HOLD + BC_DOWN) */
/* centre = the second-base umpire (#612 part 9): his ground is the middle, |x| <= CF_K of the catch distance, instead of one side */
export function outPlan(call, post, holdLen, evLen, centre = false) {
  if (!call || !call.at || !Array.isArray(call.at) || !(call.t >= 0)) return null;
  const [ax, az] = call.at, [px, pz] = post;
  if (!(hyp(ax, az) >= UMP_OUT.MIN_DEPTH)) return null;/* deep, and on his own ground */
  if (centre ? !(Math.abs(ax) <= UMP_OUT.CF_K * hyp(ax, az)) : Math.sign(ax) !== Math.sign(px)) return null;
  const dx = ax - px, dz = az - pz, L = hyp(dx, dz);
  if (!(L > 0)) return null;
  const D = Math.min(L * UMP_OUT.FRAC, UMP_OUT.MAX, UMP_OUT.V_OUT * Math.max(0, call.t - UMP_OUT.ARRIVE_BEFORE));
  if (!(D >= UMP_OUT.MIN)) return null;
  const t1 = D / UMP_OUT.V_OUT, t2 = D / UMP_OUT.V_BACK, go = Math.max(0, call.t - UMP_OUT.ARRIVE_BEFORE - t1);
  const back = call.t + holdLen + UMP_OUT.BACK_WAIT, end = back + t2;
  if (Number.isFinite(evLen) && end > evLen) return null;
  return {go, t1, t2, back, end, D, from: [px, pz], to: [px + dx / L * D, pz + dz / L * D], at: [ax, az]};
}

/* where he is at event time u: {x, z, fx, fz, active}; fx, fz = unit facing; active false = at his post (caller keeps his usual pose) */
export function outAt(plan, u) {
  if (!plan || !(u > plan.go) || !(u < plan.end)) return {x: plan ? plan.from[0] : 0, z: plan ? plan.from[1] : 0, fx: 0, fz: 0, active: false};
  const [x0, z0] = plan.from, [x1, z1] = plan.to, dx = (x1 - x0) / plan.D, dz = (z1 - z0) / plan.D;
  let k, fx, fz;
  if (u < plan.go + plan.t1) { k = (u - plan.go) / plan.t1; fx = dx; fz = dz; }
  else if (u < plan.back) { k = 1; fx = plan.at[0] - x1; fz = plan.at[1] - z1; const n = hyp(fx, fz) || 1; fx /= n; fz /= n; }
  else { k = 1 - (u - plan.back) / plan.t2; fx = -dx; fz = -dz; }
  return {x: x0 + (x1 - x0) * k, z: z0 + (z1 - z0) * k, fx, fz, active: true};
}
