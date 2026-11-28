/* render/cireach.js (#732 part 2): catcher's interference (engine: e.r 'ci', e.swing true, call `catcher_interference`).
 * The catcher's mitt comes forward and toward the batter so the bat meets it at the swing (the ball is dead, no flight).
 * Plain math, no three.js; game.js loads it with import() and does nothing until it is in (`?off=cireach`). A pure function of
 * (event, time), so a seek lands where playing would. It only moves the catcher's glove arm: no outcome changes (rules 10, 12).
 * tests/cireach.check.mjs runs it. */
export const CI_REACH={FWD:.45,SIDE:.3,IN:.25,HOLD:.6,OUT:.3};
const sat01=t=>Math.max(0,Math.min(1,t)),ease=t=>t*t*(3-2*t);

/* {w, dx, dz}: weight 0..1 of the reach at event time u, and the offset to add to the mitt target (world x, z).
 * lefty = left-handed batter (stands on the +x side). T = {ARRIVE}. A non-ci event: weight 0. */
export function ciReach(e, u, T, lefty) {
  if (!e || e.k !== 'P' || e.r !== 'ci' || !(T && T.ARRIVE > 0)) return {w: 0, dx: 0, dz: 0};
  const a = T.ARRIVE, up = ease(sat01((u - (a - CI_REACH.IN)) / CI_REACH.IN)),
    down = ease(sat01((u - (a + CI_REACH.HOLD)) / CI_REACH.OUT)), w = up * (1 - down), s = lefty ? 1 : -1;
  return {w, dx: s * CI_REACH.SIDE * w, dz: -CI_REACH.FWD * w};
}
