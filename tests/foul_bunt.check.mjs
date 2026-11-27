/* #655: the ball of a foul bunt (render/foul_bunt.js). Over seeds 1..SEEDS, for every pitch event with e.r 'foul' and e.bunt it fails when
 *   - the ball is ever farther than FB_MAX_DIST from home plate, or moves faster than MAX_V m/s,
 *   - the ball is on the fair side of the 45 degree lines (|x| <= distance toward the pitcher) once it has landed,
 *   - it does not start at the bat's sweet spot (t 0), or is not gone after FB_GONE,
 *   - there is no foul bunt in SEEDS games (the check would test nothing).
 * static.mjs runs this file. Usage: node tests/foul_bunt.check.mjs */
import { simGame } from '../engine/index.js';
import { foulBuntBall, FB_MAX_DIST, FB_GONE, FB_T } from '../render/foul_bunt.js';
const SEEDS = 600, MAX_V = 9, PLATE_Z = .6, GROUND = .042, HIT = [0.3, 1, .3], STEP = .02;
const bad = [], dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
let n = 0;
for (let seed = 1; seed <= SEEDS; seed++) {
  for (const e of simGame(seed).ev) {
    if (e.k !== 'P' || e.r !== 'foul' || !e.bunt) continue;
    n++;
    const tag = `seed ${seed} t ${e.t}`;
    const s0 = foulBuntBall(HIT, e.foulDir, 0, GROUND);
    if (dist(s0, HIT) > 1e-9) bad.push(`${tag}: ball does not start at the sweet spot`);
    let prev = s0;
    for (let t = STEP; t < FB_GONE; t += STEP) {
      const p = foulBuntBall(HIT, e.foulDir, t, GROUND);
      if (!p) { bad.push(`${tag}: ball gone at ${t} before FB_GONE`); break }
      if (Math.hypot(p[0], p[2] - PLATE_Z) > FB_MAX_DIST) bad.push(`${tag}: ball ${p} farther than ${FB_MAX_DIST} m from the plate`);
      if (dist(p, prev) / STEP > MAX_V) bad.push(`${tag}: ball speed ${(dist(p, prev) / STEP).toFixed(1)} m/s at ${t}`);
      if (t >= FB_T && !(p[0] * e.foulDir > 0 && Math.abs(p[0]) > PLATE_Z - p[2])) bad.push(`${tag}: ball ${p} is not in foul ground at ${t}`);
      prev = p;
    }
    if (foulBuntBall(HIT, e.foulDir, FB_GONE + .01, GROUND) !== null) bad.push(`${tag}: ball not gone after FB_GONE`);
  }
}
if (!n) bad.push(`no foul bunt in ${SEEDS} games: nothing was checked`);
if (bad.length) { console.error(bad.slice(0, 20).join('\n')); process.exit(1) }
console.log(`foul_bunt OK: ${n} foul bunts in ${SEEDS} seeds`);
