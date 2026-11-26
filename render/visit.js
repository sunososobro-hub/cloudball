/* render/visit.js: the manager's walk to the mound on a pitching change (#81, after #42's posts). Pure, no three.js, no DOM.
 * A CHG frame (engine CHANGE_DUR s) has the fielding team's manager come out of his dugout at VISIT_GO, walk (a brisk jog: the frame is
 * short) to a spot VISIT_R m short of the rubber on his dugout's side, stand there facing the pitcher, and walk back so that he is
 * inside the dugout VISIT_END_GAP s before the frame ends. Whatever time is left after the two legs is spent at the mound; a frame too
 * short for VISIT_TALK s there gets no visit (he stays in the dugout: nobody appears and vanishes half way).
 * Content only (rule 10): the engine never reads this file; the frame length and every outcome stay as they are.
 * game.js poses one figure from visitAt() and cpEvents keeps [go, end) of the frame on screen in the compact showing. */
export const VISIT_GO = .8;        /* s into the frame when he leaves the dugout */
export const VISIT_V = 5.5;        /* m/s on both legs (ST_JOG_V 4 would not fit a 14 s frame with a stop at the mound) */
export const VISIT_R = 1.6;        /* m from the rubber where he stops, toward his dugout */
export const VISIT_TALK = 1.5;     /* s: the least time at the mound worth a visit */
export const VISIT_END_GAP = 1;    /* s before the frame end when he is back in the dugout */

/* from = his dugout [x, z], mound = the rubber [x, z], d = frame length in s -> plan, or null when it does not fit */
export function visitPlan(from, mound, d) {
  const dx = from[0] - mound[0], dz = from[1] - mound[1], D = Math.hypot(dx, dz);
  if (!(D > VISIT_R) || !Number.isFinite(d)) return null;
  const stand = [mound[0] + dx / D * VISIT_R, mound[1] + dz / D * VISIT_R], L = D - VISIT_R, leg = L / VISIT_V;
  const talk = d - VISIT_END_GAP - VISIT_GO - 2 * leg;
  if (talk < VISIT_TALK) return null;
  const arrive = VISIT_GO + leg, leave = arrive + talk;
  return { from: [from[0], from[1]], stand, mound: [mound[0], mound[1]], L, go: VISIT_GO, arrive, leave, end: leave + leg };
}

/* -> {visible, x, z, fx, fz, moving}: where he is at u s into the frame and which way he faces (fx, fz = a direction) */
export function visitAt(pl, u) {
  if (!pl || !(u >= pl.go) || u >= pl.end) return { visible: false, x: pl ? pl.from[0] : 0, z: pl ? pl.from[1] : 0, fx: 0, fz: 1, moving: false };
  const [ax, az] = pl.from, [bx, bz] = pl.stand, ox = bx - ax, oz = bz - az;
  if (u < pl.arrive) { const k = (u - pl.go) / (pl.arrive - pl.go); return { visible: true, x: ax + ox * k, z: az + oz * k, fx: ox, fz: oz, moving: true }; }
  if (u < pl.leave) return { visible: true, x: bx, z: bz, fx: pl.mound[0] - bx, fz: pl.mound[1] - bz, moving: false };
  const k = (u - pl.leave) / (pl.end - pl.leave);
  return { visible: true, x: bx - ox * k, z: bz - oz * k, fx: -ox, fz: -oz, moving: true };
}
