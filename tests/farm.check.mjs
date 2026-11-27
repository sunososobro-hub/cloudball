/* 二軍 game records (#600 part 1, league/farm.js + league/site/farm_games.json). Fails when
 *   - a record made by the current engine version does not replay byte for byte (same score and line score) with the engine passed in, or the loader
 *     is asked for a commit other than the record's own,
 *   - ids are not unique f-<n>, a record is not tier 2, has fan decisions or a bad field (named reason),
 *   - a tampered score, a missing id or a loader that throws is not mismatch / unknown / unavailable,
 *   - the file is not the bytes farm_record.mjs writes (hand edit), or a record is over MAX_BYTES,
 *   - league/farm.js imports anything or uses Math.random, Date or the network.
 * Prints the size per record and the estimate for a season. Usage: node tests/farm.check.mjs */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as engine from '../engine/index.js';
import { ROSTERS } from '../league/players.js';
import { farmProblem, farmRecord, findFarm, replayFarm, farmUrl, recordBytes, yearBytes } from '../league/farm.js';
import { serialize } from '../league/tools/farm_record.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bad = [], fail = m => bad.push(m);
const MAX_BYTES = 1024, SEASON_GAMES = 100;
const file = readFileSync(path.join(ROOT, 'league/site/farm_games.json'), 'utf8');
let list = [];
try { list = JSON.parse(file); } catch (e) { fail(`farm_games.json does not parse: ${e.message}`); }
if (!Array.isArray(list) || !list.length) fail('farm_games.json is not a non-empty array');
if (file !== serialize(list)) fail('farm_games.json is not the bytes farm_record.mjs writes (hand edit?)');

const asked = [], local = async c => { asked.push(c); return engine; };
const clone = x => JSON.parse(JSON.stringify(x));
const seen = new Set();
let older = 0;
for (const rec of list) {
  const why = farmProblem(rec);
  if (why) { fail(`${rec && rec.id}: ${why}`); continue; }
  if (seen.has(rec.id)) fail(`${rec.id} twice`);
  seen.add(rec.id);
  if (recordBytes(rec) > MAX_BYTES) fail(`${rec.id}: ${recordBytes(rec)} bytes > ${MAX_BYTES}`);
  if (rec.engine.version !== engine.ENGINE_VERSION) { older++; continue; }   /* pinned to an older engine: only the CDN can replay it */
  asked.length = 0;
  const r = await replayFarm(list, rec.id, local);
  if (r.status !== 'ok') { fail(`${rec.id}: ${r.status} ${r.reason}`); continue; }
  if (asked.join() !== rec.engine.commit) fail(`${rec.id}: loader asked for ${asked.join()}`);
  const again = await replayFarm(list, rec.id, local);   /* byte for byte: the whole event stream, not only the score */
  if (JSON.stringify(again.game.stream) !== JSON.stringify(r.game.stream)) fail(`${rec.id}: two replays differ`);
  if (JSON.stringify(r.box.score) !== JSON.stringify(rec.result.score)) fail(`${rec.id}: final score differs from the record`);
}

const first = list.find(r => r.engine.version === engine.ENGINE_VERSION) || list[0];
const t = clone(list); findFarm(t, first.id).result.score[1] += 1;
if ((await replayFarm(t, first.id, local)).status !== 'mismatch') fail('tampered score is not mismatch');
if ((await replayFarm(list, 'f-999999', local)).status !== 'unknown') fail('missing id is not unknown');
if ((await replayFarm(list, first.id, async () => { throw new Error('404'); })).status !== 'unavailable') fail('throwing loader is not unavailable');
if (findFarm(list, first.id) !== first || findFarm(null, 'f-1') !== null) fail('findFarm');
if (farmUrl('f-3') !== 'play.html?f=f-3') fail(`farmUrl ${farmUrl('f-3')}`);

const cases = [
  ['bad id', r => { r.id = '../x'; }, /id/], ['tier 1', r => { r.tier = 1; }, /tier/], ['no day', r => { delete r.day; }, /day/],
  ['fan votes', r => { r.decisions = { v1: 'A' }; }, /decisions/], ['no seed', r => { delete r.seed; }, /seed/],
  ['bad commit', r => { r.engine.commit = 'zz'; }, /engine\.commit/],
];
for (const [name, edit, re] of cases) {
  const r = clone(first); edit(r);
  const why = farmProblem(r);
  if (!why || !re.test(why)) fail(`${name}: reason "${why}"`);
}
let threw = false; try { farmRecord({ id: 'f-1', day: 0, seed: -1, commit: first.engine.commit, version: '0', score: [1, 0], line: [[1], [0]] }); } catch { threw = true; }
if (!threw) fail('farmRecord accepted a bad seed');

const src = readFileSync(path.join(ROOT, 'league/farm.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
if (/^\s*import\s[^;]*from\s+['"](?!\.\/replay\.js)/m.test(src)) fail('league/farm.js imports something other than ./replay.js');
if (/Math\.random|\bDate\b|\bfetch\s*\(|XMLHttpRequest|WebSocket/.test(src)) fail('league/farm.js uses randomness, the clock or the network');

if (bad.length) { console.error('farm FAIL\n- ' + bad.join('\n- ')); process.exit(1); }
const per = Math.max(...list.map(recordBytes)), lineups = JSON.stringify([ROSTERS[0], ROSTERS[1]]).length;
console.log(`farm ok: ${list.length - older} of ${list.length} records replay byte for byte (${older} pinned to an older engine); ${per} B each, ${SEASON_GAMES} games ~ ${(yearBytes(per, SEASON_GAMES) / 1024).toFixed(1)} KB (with both lineups in opts.rosters, worst case ~ ${((per + lineups) * SEASON_GAMES / 1024).toFixed(0)} KB)`);
