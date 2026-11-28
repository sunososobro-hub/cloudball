/* #612 part 6: the ball kids (plain data, no three.js, no DOM, no Date / Math.random).
 * One kid sits out in foul ground on each foul line, beyond the base umpire's post and in front of the bullpen, facing the plate, for the whole game
 * (nobody appears or vanishes, #42). He wears the home team's colours (game.js matBn[1]). Idle only: the foul ball of the renderer flies into the stands,
 * so there is nothing for him to fetch yet; the retrieval of a foul grounder (a foul bunt that dribbles, #655) comes with that ball.
 * Frame as coachsig.js / pen.js: s = m from home along the foul line, d = m off the line into foul ground; side +1 = first-base line, -1 = third.
 *   kidPost(side) -> [x, z] world (x toward first base, z toward the backstop); kidFace(side) -> [dx, dz] unit facing the plate.
 *   KID_LEAN: how far he leans forward over his knees (rad, game.js R.up.rotation.x). */
export const KID_S = 44, KID_D = 4.5;     /* post along the line / off it: past U1 / U3 (s 32), well in front of the pens (s 58+, d 14) */
export const KID_SCALE = .88;             /* a teenager next to the players (as the bat boy) */
export const KID_LEAN = .18;              /* rad forward, watching the plate */
import { FB_T, FB_X, FB_Z, FB_ROLL_X, FB_ROLL_Z, FB_ROLL_T } from './foul_bunt.js';
const R2 = Math.SQRT1_2;
export function kidPost(side) { return [side * (KID_S + KID_D) * R2, (KID_D - KID_S) * R2]; }
export function kidFace(side) {
  const [x, z] = kidPost(side), L = Math.hypot(x, z);
  return [-x / L, -z / L];
}

/* #612 part 7: the kid on the foul-bunt side fetches the dribbled ball (a foul bunt, e.r 'foul' + e.bunt, ball rests at restSpot), runs out,
 * picks it up, jogs back to his post and is idle again. Pure function of tt = seconds since the pitch arrived (ARRIVE) of that foul bunt, so a
 * seek or the next frame (the trip outlasts the 12 s frame) reads the same place. Showing only: the compact cut keeps him idle and the
 * ball is gone at FB_GONE as before (cpEvents untouched). Outcomes never read (rules 10, 12).
 *   kidTrip(side) -> {D, tGo, tPick, tBack, tEnd}: path length m, start / pick-up done / back-at-post times (s since ARRIVE)
 *   kidAt(side, tt) -> {x, z, fx, fz, k: 'idle'|'run'|'pick'|'back', lean, ball: null | [x, y, z]}  (ball = in his hand, from the pick-up on)
 * side +1 = first-base line = e.foulDir 1; the caller asks only the foul side's kid for a trip (the other gets tt = null: idle). */
export const KID_RUN_V = 6;               /* m/s sprint out (a teenager, not a sprinter) */
export const KID_JOG_V = 4.5;             /* m/s jog back with the ball */
export const KID_REACT = .6;              /* s after the ball lands before he starts */
export const KID_PICK = .5;               /* s bent over the ball */
export const KID_PICK_LEAN = .9;          /* rad forward at the pick-up */
export const KID_HAND_Y = .75;            /* m: the ball in his hand while he jogs back */
export function restSpot(side) { return [side * (FB_X + FB_ROLL_X), FB_Z + FB_ROLL_Z]; }
export function kidTrip(side) {
  const P = kidPost(side), E = restSpot(side), D = Math.hypot(P[0] - E[0], P[1] - E[1]);
  const tGo = FB_T + KID_REACT, tPick = tGo + D / KID_RUN_V + KID_PICK;
  return { D, tGo, tPick, tBack: tPick + D / KID_JOG_V, tEnd: tPick + D / KID_JOG_V };
}
export function kidAt(side, tt) {
  const P = kidPost(side), [fx0, fz0] = kidFace(side), idle = { x: P[0], z: P[1], fx: fx0, fz: fz0, k: 'idle', lean: KID_LEAN, ball: null };
  if (tt == null || !(tt > 0)) return idle;
  const E = restSpot(side), T = kidTrip(side), dx = (E[0] - P[0]) / T.D, dz = (E[1] - P[1]) / T.D;
  if (tt < T.tGo || tt >= T.tEnd) return idle;
  const tArr = T.tPick - KID_PICK;
  if (tt < tArr) { const k = (tt - T.tGo) / (tArr - T.tGo); return { x: P[0] + (E[0] - P[0]) * k, z: P[1] + (E[1] - P[1]) * k, fx: dx, fz: dz, k: 'run', lean: KID_LEAN + .15, ball: null }; }
  if (tt < T.tPick) { const k = (tt - tArr) / KID_PICK; return { x: E[0], z: E[1], fx: dx, fz: dz, k: 'pick', lean: KID_LEAN + (KID_PICK_LEAN - KID_LEAN) * Math.sin(Math.PI * k), ball: k < .5 ? null : [E[0], KID_HAND_Y, E[1]] }; }
  const k = (tt - T.tPick) / (T.tBack - T.tPick), x = E[0] + (P[0] - E[0]) * k, z = E[1] + (P[1] - E[1]) * k;
  return { x, z, fx: -dx, fz: -dz, k: 'back', lean: KID_LEAN + .1, ball: [x - dx * 0.0, KID_HAND_Y, z] };
}
