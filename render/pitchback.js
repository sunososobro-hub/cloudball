/* #642 part 1: the pitcher's routine after the catcher's return throw (pure function of time; render only, never alters a result).
   Catch (glove up before CATCH_AT, ball in the glove) -> look at the ball (PB_LOOK s, trunk leans down) -> turn his back to the plate
   (PB_TURN s) -> walk to the rubber at PITCHER_WALK_V (never faster) -> turn back to face the plate (PB_TURN s).
   S = metres he stands in front of the rubber (his stride landing spot). All times are seconds into the pitch frame. */
export const PITCHER_WALK_V = 1.3, PB_LOOK = .7, PB_TURN = .6, PB_GLOVE_UP = .4, PB_LOOK_LEAN = .3, PB_STRIDE = .7, PB_SWING = .35;
const sat = x => Math.max(0, Math.min(1, x)), ease = x => x * x * (3 - 2 * x);
export function pbPlan(catchAt, S) {
  const turn0 = catchAt + PB_LOOK, walk0 = turn0 + PB_TURN, walk1 = walk0 + Math.abs(S) / PITCHER_WALK_V, end = walk1 + PB_TURN;
  return { catchAt, turn0, walk0, walk1, end };
}
/* yaw: radians he is turned away from the plate (0 facing it, PI facing away); z: his z offset from the rubber (S while standing);
   glove: 0..1 reach; look: 0..1 trunk lean; swing: leg swing in radians (the two legs get +swing / -swing); moving: true while walking */
export function pbAt(u, catchAt, S) {
  const p = pbPlan(catchAt, S), t1 = sat((u - p.turn0) / PB_TURN), t2 = sat((u - p.walk1) / PB_TURN), w = sat((u - p.walk0) / (p.walk1 - p.walk0));
  const moving = u > p.walk0 && u < p.walk1, dist = w * Math.abs(S);
  return {
    yaw: Math.PI * (ease(t1) - ease(t2)), z: S * (1 - w),
    glove: ease(sat((u - (catchAt - PB_GLOVE_UP)) / PB_GLOVE_UP)) * (1 - ease(sat((u - p.turn0) / PB_TURN))),
    look: ease(sat((u - catchAt) / .2)) * (1 - ease(sat((u - p.turn0) / PB_TURN))),
    swing: moving ? PB_SWING * Math.sin(2 * Math.PI * dist / PB_STRIDE) : 0, moving, holdsBall: u >= catchAt && u < p.walk1
  };
}
