/* #684: an air-ball hit rolls on past its landing point (HIT_ROLL_FACTOR), but never through the outfield wall: the roll target
 * (render rollEnd, the fielder's pickup spot) stays within FENCE_R - WALL_PICKUP of home on every non-HR hit of seeds 1-200. */
import { simGame } from '../engine/index.js';
import { FENCE_R, WALL_PICKUP, HIT_ROLL_FACTOR } from '../engine/constants.js';
const bad = [], lim = FENCE_R - WALL_PICKUP + 1e-9;
let n = 0, atWall = 0, rolled = 0;
for (let seed = 1; seed <= 200; seed++) for (const e of simGame(seed, {}).ev) {
  if (e.r !== 'inplay' || !e.play || e.play.bunt || !e.plan || !e.plan.hit || e.play.res === 'HR') continue;
  const p = e.play, [x, z] = e.plan.target, r = Math.sqrt(x * x + z * z), rl = Math.sqrt(p.lx * p.lx + p.lz * p.lz); n++;
  if (r > lim && bad.length < 10) bad.push(`seed ${seed} t ${e.t}: ${p.res} roll target ${r.toFixed(2)} m from home, wall at ${FENCE_R}`);
  if (r > lim - 1e-6) atWall++;
  if (p.type !== 'GB' && rl * HIT_ROLL_FACTOR <= lim && Math.abs(r - rl * HIT_ROLL_FACTOR) < 1e-6) rolled++;   /* short of the wall: the roll is unchanged */
}
if (!(n > 2000 && atWall > 20 && rolled > 1000)) bad.push(`sample: ${n} hits, ${atWall} at the wall, ${rolled} normal rolls`);
if (bad.length) { console.error('wall_roll FAIL\n' + bad.join('\n')); process.exit(1) }
console.log(`wall_roll ok: ${n} hits, ${atWall} stop at the wall, ${rolled} roll the usual ${HIT_ROLL_FACTOR}x`);
