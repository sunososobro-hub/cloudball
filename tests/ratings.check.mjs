/* 1 to 100 display ratings (league/ratings.js, #169 item 8). Fails when
 *   - a player's overall or an ability is not a whole number from 1 to 100, or a key is missing,
 *   - the league overall mean is outside LEAGUE_MEAN,
 *   - engine/ imports league/ratings.js (display only, rule 10), or the file uses Math.random or Date.
 * static.mjs runs this file.
 * Usage: node tests/ratings.check.mjs */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEAGUE_MEAN = [60, 66];
const { ROSTERS } = await import(pathToFileURL(path.join(ROOT, 'league/players.js')));
const { ratingsOf, BAT_WEIGHTS, PIT_WEIGHTS } = await import(pathToFileURL(path.join(ROOT, 'league/ratings.js')));
const problems = [], all = [];
for (const t of ROSTERS) for (const p of [...t.bat, ...t.pit]) {
  const r = ratingsOf(p), keys = ['ovr', ...Object.keys(p.role ? PIT_WEIGHTS : BAT_WEIGHTS), 'pot'];
  for (const k of keys) if (!Number.isInteger(r[k]) || r[k] < 1 || r[k] > 100) problems.push(`${p.id}: ${k} is ${r[k]}`);
  all.push(r.ovr);
}
const m = all.reduce((a, b) => a + b, 0) / all.length;
if (m < LEAGUE_MEAN[0] || m > LEAGUE_MEAN[1]) problems.push(`league overall mean ${m.toFixed(1)} outside ${LEAGUE_MEAN.join('..')}`);
if (/Math\.random|\bDate\b/.test(readFileSync(path.join(ROOT, 'league/ratings.js'), 'utf8'))) problems.push('league/ratings.js uses Math.random or Date');
const walk = dir => readdirSync(dir).flatMap(f => { const p = path.join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
for (const f of walk(path.join(ROOT, 'engine')).filter(f => /\.m?js$/.test(f)))
  if (/ratings\.js['"]/.test(readFileSync(f, 'utf8'))) problems.push(`${path.relative(ROOT, f)} imports league/ratings.js`);
console.log(`ratings: ${all.length} players, overall ${Math.min(...all)}..${Math.max(...all)}, mean ${m.toFixed(1)}`);
if (problems.length) { console.error(`ratings.check FAILED: ${problems.length} problem(s)`); for (const p of problems) console.error('  ' + p); process.exit(1); }
console.log('ratings.check OK');
