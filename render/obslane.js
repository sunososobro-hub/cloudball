/* #841 part 2: the obstruction play drawn on the field (pure, no DOM, no three.js). Cosmetic: the engine recorded the award (play.obstruction, rule 13);
 * the picture only moves the first baseman into the batter's lane and the batter's stride, from the engine event (rule 12), and never changes a time the
 * engine gave: the batter still reaches second at his move's arriveT and the ball still comes in to the relay after that (resolveHit holds it).
 *   obsStand(e, u, T) -> 0..1  how far the first baseman has stepped from his spot into the lane (0 = his spot). Steps in by OBS_STEP s before the batter
 *                              reaches first, stays until the batter has second, then walks back over OBS_BACK s.
 *   obsLag(e, u, T)   -> s     the batter runs on the clock u - lag: 0 before the contact, rises to OBS_LAG over OBS_BUMP s (he slows), then falls
 *                              linearly to 0 at arriveT (he jogs on and is on time). OBS_LAG / OBS_BUMP < 1, so he never runs backwards.
 *   OBS_LANE_BEFORE            metres before first base, on the home-first line, where the first baseman stands (no ball, in the lane).
 * T = {runTime(d, v), BASE_PATH} from the engine, as in umpobs.js. */
import { obsCall, isObstruction } from './umpobs.js';
export const OBS_STEP = .8, OBS_BACK = 1.2, OBS_LAG = .2, OBS_BUMP = .4, OBS_LANE_BEFORE = .5;
const sat = x => x < 0 ? 0 : x > 1 ? 1 : x;
const ease = x => x * x * (3 - 2 * x);
const arriveOf = e => e.moves.find(m => m[0] === 0 && m[1] === 2)[3].arriveT;
export function obsStand(e, u, T) {
  const c = obsCall(e, T);
  if (!c) return 0;
  const end = arriveOf(e);
  return ease(sat((u - (c.at - OBS_STEP)) / OBS_STEP)) * (1 - ease(sat((u - end) / OBS_BACK)));
}
export function obsLag(e, u, T) {
  const c = obsCall(e, T);
  if (!c || u <= c.at) return 0;
  const end = arriveOf(e);
  if (u >= end) return 0;
  const up = ease(sat((u - c.at) / OBS_BUMP)), down = sat((end - u) / Math.max(1e-6, end - c.at - OBS_BUMP));
  return OBS_LAG * (u < c.at + OBS_BUMP ? up : down);
}
export { isObstruction };
