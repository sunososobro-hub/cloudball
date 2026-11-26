/* Bench check (#436 part 1, plain Node). Fails when
 *   - a team has no `bench` of BENCH_SIZE, or its lineup `bat` is not LINEUP_SIZE,
 *   - a bench id, name or number repeats inside a team (lineup, pitchers and staff included),
 *   - league/players.js does not hold what league/tools/bench.mjs draws (hand edits or a stale draw),
 *   - a bench player reads outside BENCH_OVR on the 1 to 100 scale, the pinch runner (x3) is not the fastest on the bench or
 *     reads under RUNNER_SPD on speed, or the pinch-hit bat (x4) is not better than the weakest lineup batter,
 *   - with substitutions off (pinchHit, pinchRun and defSub false) the engine game changes when the bench is present:
 *     simGame on SEEDS with and without `bench` must give the same stream, byte for byte.
 * Usage: node tests/bench.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = f => import(pathToFileURL(path.join(ROOT, f)));
const { ROSTERS } = await imp('league/players.js');
const { STAFF } = await imp('league/staff.js');
const { ratingsOf } = await imp('league/ratings.js');
const { draw, BENCH_SIZE } = await imp('league/tools/bench.mjs');
const { simGame } = await imp('engine/index.js');
const NO_SUBS = { pinchHit: false, pinchRun: false, defSub: false };   /* the bench only plays when substitutions are on (#436 parts 5, 8) */
const K = await imp('engine/constants.js');

const BENCH_OVR = [35, 90], RUNNER_SPD = 85, SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const problems = [], bad = s => problems.push(s);

ROSTERS.forEach((t, i) => {
  if (!Array.isArray(t.bench) || t.bench.length !== BENCH_SIZE) bad(`team ${i}: bench of ${t.bench && t.bench.length}, want ${BENCH_SIZE}`);
  if (t.bat.length !== K.LINEUP_SIZE) bad(`team ${i}: lineup of ${t.bat.length}`);
  const team = t.bat[0].id.split('-')[0], all = [...t.bat, ...(t.bench || []), ...t.pit];
  for (const k of ['id', 'name']) if (new Set(all.map(p => p[k])).size !== all.length) bad(`${team}: a repeated ${k}`);
  const nums = [...all, ...STAFF.filter(s => s.team === team)].map(p => p.num);
  if (new Set(nums).size !== nums.length) bad(`${team}: a repeated number`);
  for (const p of t.bench || []) {
    if (!p.pos || p.role) bad(`${p.id}: a bench player is a batter with a position`);
    const o = ratingsOf(p).ovr; if (o < BENCH_OVR[0] || o > BENCH_OVR[1]) bad(`${p.id}: overall ${o} outside ${BENCH_OVR.join('..')}`);
  }
  const by = s => (t.bench || []).find(p => p.id === `${team}-${s}`);
  const x3 = by('x3'), x4 = by('x4');
  if (!x3 || t.bench.some(b => b !== x3 && b.spd >= x3.spd) || ratingsOf(x3).spd < RUNNER_SPD) bad(`${team}: the pinch runner x3 is not the fast one`);
  if (!x4 || ratingsOf(x4).ovr <= Math.min(...t.bat.map(b => ratingsOf(b).ovr))) bad(`${team}: the pinch-hit bat x4 is not better than the weakest lineup batter`);
});

const again = draw(ROSTERS.map(t => ({ bat: t.bat, pit: t.pit })), STAFF);
const canon = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(j => [j, x[j]])) : x));
if (canon(again) !== canon(ROSTERS.map(t => t.bench))) bad('league/players.js bench differs from league/tools/bench.mjs (rerun it with --write)');

const bare = ROSTERS.map(({ bench, ...t }) => t);
for (const seed of SEEDS) {
  const a = JSON.stringify(simGame(seed, {}, { rosters: ROSTERS, ...NO_SUBS })), b = JSON.stringify(simGame(seed, {}, { rosters: bare, ...NO_SUBS }));
  if (a !== b) bad(`seed ${seed}: the game changes with the bench present`);
}

console.log(`bench: ${ROSTERS.length} teams x ${BENCH_SIZE}, ${SEEDS.length} games with and without the bench`);
if (problems.length) { console.error(`FAILED: ${problems.length} bench problem(s)`); for (const p of problems) console.error('  ' + p); process.exit(1); }
console.log('OK: benches complete, drawn by the tool, on the scale, and the engine ignores them.');
