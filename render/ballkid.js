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
const R2 = Math.SQRT1_2;
export function kidPost(side) { return [side * (KID_S + KID_D) * R2, (KID_D - KID_S) * R2]; }
export function kidFace(side) {
  const [x, z] = kidPost(side), L = Math.hypot(x, z);
  return [-x / L, -z / L];
}
