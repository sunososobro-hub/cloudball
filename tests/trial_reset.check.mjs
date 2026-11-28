/* 試跑 reset check (#750, plain Node). Fails when
 *   - league/site/season.json or a record of league/site/farm_games.json does not carry `trial: true`,
 *   - the official record writer (league/tools/record.mjs) accepts a trial input (function or command line) or names no reason,
 *   - after `resetFiles` (= `season_run.mjs --reset --start D`) a trial 二軍 id is left, the season file has a night before
 *     the start or a played game in its first-night standings, a fan player of a hand-made league changes a byte,
 *     or two resets of the same inputs differ by a byte.
 * Usage: node tests/trial_reset.check.mjs */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = p => import(pathToFileURL(path.join(ROOT, p)));
const T = await imp('league/trial.js'), { buildRecording } = await imp('league/tools/record.mjs');
const { resetFiles, PLAYERS_IN } = await imp('league/tools/season_run.mjs'), { seasonAt } = await imp('league/season_site.js');
const problems = [], bad = s => problems.push(s);
const read = p => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));

/* every trial file is marked */
const season = read('league/site/season.json'), farm = read('league/site/farm_games.json');
if (season.trial !== true) bad('season.json has no trial: true');
for (const r of farm) if (r.trial !== true) bad(`farm_games.json ${r.id}: no trial: true`);

/* the official writer refuses trial data with a named reason */
for (const [what, x] of [['season.json', season], ['a farm record', { id: 'f-1', trial: true }], ['a list with one trial record', [{ id: 'f-2' }, { id: 'f-3', trial: true }]]]) {
  let msg = '';
  try { buildRecording(1, { from: x }); } catch (e) { msg = e.message; }
  if (!msg.includes(T.TRIAL_REFUSED)) bad(`record.mjs accepted ${what} (got "${msg}")`);
}
if (T.officialProblem({ trial: false }) !== null || T.officialProblem(null) !== null) bad('non-trial input refused');
let cli = { status: 0, err: '' };
try { execFileSync('node', [path.join(ROOT, 'league/tools/record.mjs'), '1', '--from', path.join(ROOT, 'league/site/season.json')], { stdio: 'pipe' }); }
catch (e) { cli = { status: e.status, err: String(e.stderr) }; }
if (cli.status !== 1 || !cli.err.includes(T.TRIAL_REFUSED)) bad(`record.mjs --from season.json: exit ${cli.status}, stderr "${cli.err.trim()}"`);

/* the reset: hand-made league with one fan player, a trial 二軍 file plus one non-trial record */
const players = JSON.parse(readFileSync(PLAYERS_IN, 'utf8')), fanId = Object.keys(players)[0];
players[fanId] = { ...players[fanId], fan: true, name: '測試球迷' };
const fanBytes = JSON.stringify(players[fanId]), allBytes = JSON.stringify(players);
const keep = { ...farm[0], id: 'f-99' }; delete keep.trial;
const input = { seed: 7, start: '2027-01-05', commit: 'abcdef1', version: 'v', seasons: 1, players, farm: [...farm, keep] };
const a = resetFiles(input), b = resetFiles(input);
if (a.season !== b.season || a.farm !== b.farm) bad('two resets of the same inputs differ');
if (JSON.stringify(players[fanId]) !== fanBytes || JSON.stringify(players) !== allBytes) bad('the reset changed a player');
const s2 = JSON.parse(a.season), f2 = JSON.parse(a.farm);
const trialIds = new Set(farm.map(r => r.id));
for (const r of f2) if (r.trial === true || (trialIds.has(r.id) && r.id !== 'f-99')) bad(`trial 二軍 record ${r.id} left after the reset`);
if (f2.length !== 1 || f2[0].id !== 'f-99') bad(`reset kept ${f2.map(r => r.id).join(',')}, want only the non-trial f-99`);
if (s2.start !== input.start || s2.nights.some(n => n.day < 0) || Math.min(...s2.nights.map(n => n.day)) !== 0) bad('season file has a night before the start');
const d0 = seasonAt(s2, input.start), dBefore = seasonAt(s2, '2027-01-04');
if (!d0 || d0.state !== 'on' || d0.day !== 0 || d0.last.length || d0.standings.some(t => t.w + t.l)) bad('day 1 of the reset is not a clean table');
if (!dBefore || dBefore.state !== 'before') bad('the day before the start is not "before"');

console.log(`trial_reset: ${farm.length} trial 二軍 records + season.json marked, record.mjs refuses them, reset of seed 7 from ${input.start}`);
if (problems.length) { console.error(`FAILED: ${problems.length} trial reset problem(s)`); for (const p of problems) console.error('  ' + p); process.exit(1); }
console.log('OK: trial files marked, official writer refuses them, reset clean and byte-stable, fan player untouched.');
