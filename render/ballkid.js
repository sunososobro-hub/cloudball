/* #612 part 6: the ball kids (plain data, no three.js, no DOM, no Date / Math.random).
 * One kid sits out in foul ground on each foul line, beyond the base umpire's post and in front of the bullpen, facing the plate, for the whole game
 * (nobody appears or vanishes, #42). He wears the home team's colours (game.js matBn[1]). Idle only: the foul ball of the renderer flies into the stands,
 * so only a foul bunt (#655, a ball that dribbles on the ground) is fetched (part 7): the kid on that side runs out to where it rests, picks it up and walks it back to his post,
 * the walk back running on into the next events (kidAt looks back KID_LOOK events). One kid, one trip at a time: a second foul bunt while he is still away is left as before (the ball is taken out of the picture).
 * Frame as coachsig.js / pen.js: s = m from home along the foul line, d = m off the line into foul ground; side +1 = first-base line, -1 = third.
 *   kidPost(side) -> [x, z] world (x toward first base, z toward the backstop); kidFace(side) -> [dx, dz] unit facing the plate.
 *   KID_LEAN: how far he leans forward over his knees (rad, game.js R.up.rotation.x). */
import { FB_X, FB_Z, FB_ROLL_X, FB_ROLL_Z } from './foul_bunt.js';
export const KID_S = 44, KID_D = 4.5;     /* post along the line / off it: past U1 / U3 (s 32), well in front of the pens (s 58+, d 14) */
export const KID_SCALE = .88;             /* a teenager next to the players (as the bat boy) */
export const KID_LEAN = .18;              /* rad forward, watching the plate */
const R2 = Math.SQRT1_2;
export function kidPost(side) { return [side * (KID_S + KID_D) * R2, (KID_D - KID_S) * R2]; }
export function kidFace(side) {
  const [x, z] = kidPost(side), L = Math.hypot(x, z);
  return [-x / L, -z / L];
}

/* part 7: the fetch. All times in seconds of game time (ev[i].t + u), no state: the trips are recomputed from the events. */
export const KID_REACT = .7;       /* s after the ball is hit (ARRIVE) before he starts */
export const KID_RUN_V = 6.5;      /* m/s out to the ball (a teenager running, below the sprint of a player) */
export const KID_PICK = .7;        /* s bent over the ball */
export const KID_BACK_V = 3;       /* m/s walking back with the ball in his hand */
export const KID_LOOK = 4;         /* events looked back: a trip is about 20 s, events are >= 12 s apart */
export function kidBall(side) { return [side * (FB_X + FB_ROLL_X), FB_Z + FB_ROLL_Z]; }   /* where a foul bunt rests (world x, z) */
/* trips of the kid on `side` that reach event ei: [{ei, t0 start, tp reaches the ball, tb leaves with it, te is home}] */
export function kidTrips(ev, ei, side, arrive) {
  const post = kidPost(side), ball = kidBall(side), D = Math.hypot(ball[0] - post[0], ball[1] - post[1]), trips = [];
  let free = -Infinity;
  for (let i = Math.max(0, ei - KID_LOOK); i <= ei; i++) {
    const e = ev[i];
    if (!e || e.k !== 'P' || e.r !== 'foul' || !e.bunt || e.foulDir !== side) continue;
    const t0 = e.t + arrive + KID_REACT;
    if (t0 < free) continue;           /* still away with the last ball */
    const tp = t0 + D / KID_RUN_V, tb = tp + KID_PICK, te = tb + D / KID_BACK_V;
    trips.push({ ei: i, t0, tp, tb, te }); free = te;
  }
  return trips;
}
/* the kid on `side` at u seconds into event ei, or null (he sits at his post). x, z world; fx, fz unit facing; bend 0..1 over the ball; carry: ball in hand */
export function kidAt(side, ev, ei, u, arrive) {
  const T = ev[ei].t + u, post = kidPost(side), ball = kidBall(side), tr = kidTrips(ev, ei, side, arrive).find(q => T >= q.t0 && T < q.te);
  if (!tr) return null;
  const dx = ball[0] - post[0], dz = ball[1] - post[1], D = Math.hypot(dx, dz), ux = dx / D, uz = dz / D;
  if (T < tr.tp) { const k = (T - tr.t0) / (tr.tp - tr.t0); return { x: post[0] + dx * k, z: post[1] + dz * k, fx: ux, fz: uz, moving: true, bend: 0, carry: false }; }
  if (T < tr.tb) { const k = (T - tr.tp) / KID_PICK; return { x: ball[0], z: ball[1], fx: ux, fz: uz, moving: false, bend: Math.sin(Math.PI * k), carry: k > .5 }; }
  const k = (T - tr.tb) / (tr.te - tr.tb);
  return { x: ball[0] - dx * k, z: ball[1] - dz * k, fx: -ux, fz: -uz, moving: true, bend: 0, carry: true };
}
/* seconds after the hit (ARRIVE) of foul-bunt event ei when the kid takes the ball off the ground (the ball is drawn until then), or undefined: nobody comes for it */
export function kidHold(ev, ei, arrive) {
  const e = ev[ei], tr = e && e.foulDir ? kidTrips(ev, ei, e.foulDir, arrive).find(q => q.ei === ei) : null;
  return tr ? tr.tp + KID_PICK / 2 - e.t - arrive : undefined;
}
