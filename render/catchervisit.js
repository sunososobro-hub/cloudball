/* render/catchervisit.js: the catcher's mound visit (#758, engine 0.4.31 CVIS frame, CATCHER_VISIT_DUR s). Pure, no three.js, no DOM.
 * The plate umpire signals time first (umptime.js). Then the catcher takes his mask off, jogs from behind the plate to a spot CV_STAND m
 * short of the rubber on his own side, stands facing the pitcher for the talk, jogs back, puts the mask on and settles into his crouch
 * for the next pitch. Whatever time is left after the two legs is the talk. A frame too short for CV_TALK s there gets no visit
 * (he stays behind the plate). Content only (rule 10): the engine never reads this file; frame length and outcomes stay as they are.
 * game.js poses the catcher from catcherVisitAt(); cpEvents keeps [go, end) of the frame on screen in the compact showing. */
export const CV_GO = 1.2;        /* s into the frame when he sets off: after the plate umpire's hands are up (umptime TIME_AT + TM_UP = .55 s) */
export const CV_V = 4;           /* m/s on both legs: a jog (ST_JOG_V) */
export const CV_STAND = 2;       /* m from the rubber where he stops, toward the plate */
export const CV_TALK = 3;        /* s: the least time at the mound worth a visit */
export const CV_SET = 1.2;       /* s before the frame end: back at the plate and sinking into the crouch (the next pitch frame starts crouched) */

/* c0 = his spot behind the plate [x, z], mound = the rubber [x, z], d = frame length in s -> plan, or null when it does not fit */
export function catcherVisitPlan(c0, mound, d) {
  const dx = mound[0] - c0[0], dz = mound[1] - c0[1], D = Math.hypot(dx, dz);
  if (!(D > CV_STAND) || !Number.isFinite(d)) return null;
  const stand = [mound[0] - dx / D * CV_STAND, mound[1] - dz / D * CV_STAND], L = D - CV_STAND, leg = L / CV_V;
  const talk = d - CV_SET - CV_GO - 2 * leg;
  if (talk < CV_TALK) return null;
  const arrive = CV_GO + leg, leave = arrive + talk, back = leave + leg;
  return { c0: [c0[0], c0[1]], stand, mound: [mound[0], mound[1]], L, go: CV_GO, arrive, leave, back, end: d };
}

/* -> {x, z, fx, fz, moving, crouch, maskOn}: where he is at u s into the frame, which way he faces (a direction), how far he is into
   his crouch (0 standing .. 1 set) and whether the mask is on his head */
export function catcherVisitAt(pl, u) {
  const sat = v => v < 0 ? 0 : v > 1 ? 1 : v, [ax, az] = pl.c0, [bx, bz] = pl.stand, ox = bx - ax, oz = bz - az;
  const crouch = u >= pl.back ? sat((u - pl.back) / (pl.end - pl.back)) : 0;
  if (u < pl.go) return { x: ax, z: az, fx: ox, fz: oz, moving: false, crouch: 0, maskOn: true };
  if (u < pl.arrive) { const k = (u - pl.go) / (pl.arrive - pl.go); return { x: ax + ox * k, z: az + oz * k, fx: ox, fz: oz, moving: true, crouch: 0, maskOn: false }; }
  if (u < pl.leave) return { x: bx, z: bz, fx: pl.mound[0] - bx, fz: pl.mound[1] - bz, moving: false, crouch: 0, maskOn: false };
  if (u < pl.back) { const k = (u - pl.leave) / (pl.back - pl.leave); return { x: bx - ox * k, z: bz - oz * k, fx: -ox, fz: -oz, moving: true, crouch: 0, maskOn: false }; }
  return { x: ax, z: az, fx: pl.mound[0] - ax, fz: pl.mound[1] - az, moving: false, crouch, maskOn: true };
}
