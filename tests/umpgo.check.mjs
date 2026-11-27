/* Base umpires go out on outfield flies (#612 part 8, plain Node). render/umpgo.js is run, not read, over real engine games:
 *   - a trip only for a fair non-HR fly (FB) caught or landing for LF / CF / RF; U3 for the left side, U1 for the right; nothing else
 *   - null before the trip and after he is back; starts only after the ball is hit (ARRIVE) and ends inside the event
 *   - never moves faster than GO.V * 1.6 (smoothstep peak) between samples; never farther than GO.DIST from his post; same input = same output
 *   - umpGoEnd agrees with the last sample that is not null
 * static.mjs runs this file. Usage: node tests/umpgo.check.mjs */
import { simGame, ARRIVE } from '../engine/index.js';
import { umpGoFor, umpGoAt, umpGoEnd, GO } from '../render/umpgo.js';

const T = { ARRIVE }, problems = [], bad = m => { if (problems.length < 30) problems.push(m); };
const POSTS = [[17.8, -17.8 + 1.2], [-2.5, -47], [-17.8, -17.8 + 1.2]];
const OF = new Set(['LF', 'CF', 'RF']);
let trips = 0, none = 0, left = 0, right = 0;
for (let seed = 1; seed <= 200; seed++) for (const e of simGame(seed, {}, {}).ev) {
  const p = e.play, b = umpGoFor(e);
  const want = e.k === 'P' && e.r === 'inplay' && p && p.type === 'FB' && !p.foul && !p.bunt && p.res !== 'HR' && OF.has(p.fielder);
  if (!!b !== !!want) { bad(`seed ${seed}: umpire ${b}, want ${!!want}`); continue; }
  if (!b) { none++; if (umpGoAt(e, T, 5, POSTS[0]) || umpGoAt(e, T, 5, POSTS[2])) bad(`seed ${seed}: a trip for an event with none`); continue; }
  if (p.fielder === 'LF' && b !== 3) bad(`seed ${seed}: LF fly goes to U${b}`);
  if (p.fielder === 'RF' && b !== 1) bad(`seed ${seed}: RF fly goes to U${b}`);
  if (p.fielder === 'CF' && b !== (p.lx >= 0 ? 1 : 3)) bad(`seed ${seed}: CF fly to the wrong side`);
  const post = POSTS[b - 1], end = umpGoEnd(e, T, POSTS);
  if (!end) { none++; continue; }/* too short to fit: no trip, no jump */
  trips++; if (b === 3) left++; else right++;
  if (end > e.d + 1e-9) bad(`seed ${seed}: back at ${end.toFixed(2)} s, after the event (${e.d.toFixed(2)})`);
  let prev = null, last = -1, far = 0;
  for (let u = 0; u <= e.d + 1; u += .05) {
    const g = umpGoAt(e, T, u, post), g2 = umpGoAt(e, T, u, post);
    if (JSON.stringify(g) !== JSON.stringify(g2)) bad(`seed ${seed}: not pure at ${u}`);
    if (!g) { prev = null; continue; }
    if (![g.x, g.z, g.dx, g.dz].every(Number.isFinite)) bad(`seed ${seed}: bad numbers at ${u}`);
    if (u < ARRIVE) bad(`seed ${seed}: moves at ${u} before the ball is hit`);
    last = u; far = Math.max(far, Math.hypot(g.x - post[0], g.z - post[1]));
    if (prev && Math.hypot(g.x - prev[0], g.z - prev[1]) > GO.V * 1.6 * .05 + 1e-6) bad(`seed ${seed}: jumps at ${u}`);
    prev = [g.x, g.z];
  }
  if (far > GO.DIST + 1e-6) bad(`seed ${seed}: goes ${far.toFixed(1)} m out, limit ${GO.DIST}`);
  if (far < GO.DIST - .1) bad(`seed ${seed}: only ${far.toFixed(1)} m out`);
  if (last < end - .06 || last > end + 1e-9) bad(`seed ${seed}: last sample ${last.toFixed(2)} vs end ${end.toFixed(2)}`);
}
if (!trips || !left || !right) bad(`trips ${trips} (left ${left}, right ${right}) in 200 games: the check proves nothing`);
if (problems.length) { console.error('umpgo check FAILED:\n' + problems.join('\n')); process.exit(1); }
console.log('umpgo check ok', JSON.stringify({ trips, left, right, none }));
