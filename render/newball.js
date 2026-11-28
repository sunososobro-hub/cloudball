/* #612 part 5: a new ball after a foul that leaves the field (pure, no DOM, no three.js, no Date / Math.random).
 * Read from the event only (rule 12); renderer only, never alters a result (rule 10).
 * A foul ball (e.r 'foul', not a foul bunt: that one dribbles and stays on the field) flies out of play. Once the plate umpire's foul
 * signal (umpsig.js) is down, he rises a little, takes a new ball from the bag on his right hip and hands it forward to the crouched
 * catcher, who reaches back over his right shoulder for it with his bare hand; the catcher then lobs it to the pitcher.
 * The ball is never seen to appear from nothing in the open: it shows first in the umpire's hand at the bag.
 *   newBallPlan(e, T) -> null | {t0, pull, given, free, lob, end} (s into the pitch frame); T = {ARRIVE} from the engine.
 *   newBallAt(plan, u) -> null | {stand, reach, give, drop, cat, ball, k}:
 *     stand 0..1 how far the umpire rises out of his crouch (times NB_STAND);
 *     reach / give / drop 0..1 the umpire's right hand: rest -> bag (NB_BAG, his upper-body frame), bag -> hand-over spot, back to rest;
 *     cat 0..1 the catcher's right hand from its rest to the hand-over spot and back;
 *     ball: null (in the bag) | 'ump' (in the umpire's right hand) | 'catcher' (catcher's right hand) | 'lob' (k 0..1 of the lob to the pitcher).
 * The hand-over spot is handSpot(catcher x, catcher z): NB_SPOT metres from the catcher, world frame (x first-base side, z toward the backstop). */
import { signalEnd } from './umpsig.js';

export const NB_GAP = .2;          /* s after the foul signal is down before he reaches for the bag */
export const NB_REACH = .4;        /* s: right hand to the ball bag on his hip */
export const NB_GIVE = .7;         /* s: bag to the hand-over spot */
export const NB_CAT_LEAD = .5;     /* s before the hand-over the catcher starts reaching back */
export const NB_HAND = .15;        /* s both hands on the ball at the hand-over */
export const NB_DOWN = .4;         /* s: umpire's hand back to rest, the catcher's hand back to its rest */
export const NB_LOB_WAIT = .15;    /* s the catcher holds the ball at rest before the lob */
export const NB_LOB = .9;          /* s of the lob to the pitcher (the same as the plain return throw, game.js BALL_BACK_DUR) */
export const NB_STAND = .5;        /* share of the way out of his crouch the umpire rises to hand the ball over */
export const NB_BAG = [.3, -.05, 0];   /* ball bag, his upper-body frame (+x his right, y shoulder .57 above it, +z forward): right hip */
export const NB_SPOT = [.3, .95, .6];  /* hand-over spot from the catcher: x toward first (his right), y above the ground, z behind him */

const sat = x => x < 0 ? 0 : x > 1 ? 1 : x;
const ease = x => x * x * (3 - 2 * x);

export function newBallKind(e) {
  return !!(e && e.k === 'P' && e.r === 'foul' && !e.bunt);
}
export function newBallPlan(e, T) {
  if (!newBallKind(e)) return null;
  const t0 = signalEnd(e, T) + NB_GAP, pull = t0 + NB_REACH, given = pull + NB_GIVE, free = given + NB_HAND;
  const lob = free + NB_DOWN + NB_LOB_WAIT;
  return { t0, pull, given, free, lob, end: lob + NB_LOB };
}
export function handSpot(cx, cz) {
  return [cx + NB_SPOT[0], NB_SPOT[1], cz + NB_SPOT[2]];
}
export function newBallAt(plan, u) {
  if (!plan || !(u >= plan.t0) || u >= plan.end) return null;
  const reach = ease(sat((u - plan.t0) / NB_REACH)), give = ease(sat((u - plan.pull) / NB_GIVE)), drop = ease(sat((u - plan.free) / NB_DOWN));
  const stand = ease(sat((u - plan.t0) / NB_REACH)) * (1 - drop);
  const cat = ease(sat((u - (plan.given - NB_CAT_LEAD)) / NB_CAT_LEAD)) * (1 - drop);
  let ball = null, k = 0;
  if (u >= plan.lob) { ball = 'lob'; k = sat((u - plan.lob) / NB_LOB); }
  else if (u >= plan.given) ball = 'catcher';
  else if (u >= plan.pull) ball = 'ump';
  return { stand, reach, give, drop, cat, ball, k };
}
