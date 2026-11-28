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
import { farmProblem, farmRecord, findFarm, replayFarm, farmOpening, farmUrl, recordBytes, yearBytes } from '../league/farm.js';
import { serialize } from '../league/tools/farm_record.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bad = [], fail = m => bad.push(m);
const MAX_BYTES = 1024, MAX_BYTES_ROSTERS = 8192, SEASON_GAMES = 100;   /* a record without opts.rosters is small; with the two lineups (#748 part 2) it may be MAX_BYTES_ROSTERS */
const file = readFileSync(path.join(ROOT, 'league/site/farm_games.json'), 'utf8');
let list = [];
try { list = JSON.parse(file); } catch (e) { fail(`farm_games.json does not parse: ${e.message}`); }
if (!Array.isArray(list)) fail('farm_games.json is not an array');   /* empty right after the owner's start (#750 --reset) */
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
  const cap = rec.opts && rec.opts.rosters ? MAX_BYTES_ROSTERS : MAX_BYTES;
  if (recordBytes(rec) > cap) fail(`${rec.id}: ${recordBytes(rec)} bytes > ${cap}`);
  if (rec.engine.version !== engine.ENGINE_VERSION) { older++; continue; }   /* pinned to an older engine: only the CDN can replay it */
  asked.length = 0;
  const r = await replayFarm(list, rec.id, local);
  if (r.status !== 'ok') { fail(`${rec.id}: ${r.status} ${r.reason}`); continue; }
  if (asked.join() !== rec.engine.commit) fail(`${rec.id}: loader asked for ${asked.join()}`);
  const again = await replayFarm(list, rec.id, local);   /* byte for byte: the whole event stream, not only the score */
  if (JSON.stringify(again.game.stream) !== JSON.stringify(r.game.stream)) fail(`${rec.id}: two replays differ`);
  if (JSON.stringify(r.box.score) !== JSON.stringify(rec.result.score)) fail(`${rec.id}: final score differs from the record`);
}

const fx = (() => { const g = engine.simGame(7002, {}, { teams: [0, 1] }), b = engine.boxFromStream(g.stream);   /* fallback when the file is empty */
  return farmRecord({ id: 'f-1', day: 0, seed: 7002, commit: 'abcdef1', version: engine.ENGINE_VERSION, score: b.score, line: b.line }); })();
if (!list.length) list = [fx];
const first = list.find(r => r.engine.version === engine.ENGINE_VERSION) || list[0];
const t = clone(list); findFarm(t, first.id).result.score[1] += 1;
if ((await replayFarm(t, first.id, local)).status !== 'mismatch') fail('tampered score is not mismatch');
if ((await replayFarm(list, 'f-999999', local)).status !== 'unknown') fail('missing id is not unknown');
if ((await replayFarm(list, first.id, async () => { throw new Error('404'); })).status !== 'unavailable') fail('throwing loader is not unavailable');
if (findFarm(list, first.id) !== first || findFarm(null, 'f-1') !== null) fail('findFarm');
{   /* play.html?f=<id> (#600 part 2): ok gives the game the page plays as OPENING, anything else gives none and a reason */
  const o = await farmOpening(list, first.id, local), bad1 = await farmOpening(t, first.id, local), none = await farmOpening(list, 'f-999999', local);
  if (first.engine.version === engine.ENGINE_VERSION && !(o.status === 'ok' && o.opening && o.opening.seed === first.seed && o.opening.farm === first.id && Array.isArray(o.opening.game.ev))) fail(`farmOpening ok: ${o.status}`);
  if (bad1.opening !== null || bad1.status !== 'mismatch' || !bad1.reason) fail('farmOpening on a tampered record gives a picture');
  if (none.opening !== null || none.status !== 'unknown') fail('farmOpening on a missing id');
  const g = engine.simGame(7001, {}, { teams: [0, 1] }), bx = engine.boxFromStream(g.stream);   /* a record of the current engine: the picture path */
  const mine = [farmRecord({ id: 'f-1', day: 0, seed: 7001, commit: 'abcdef1', version: engine.ENGINE_VERSION, score: bx.score, line: bx.line })];
  const m = await farmOpening(mine, 'f-1', local);
  if (m.status !== 'ok' || !m.opening || m.opening.seed !== 7001 || JSON.stringify(m.opening.game.stream) !== JSON.stringify(g.stream)) fail(`farmOpening picture path: ${m.status} ${m.reason}`);
  const pg = readFileSync(path.join(ROOT, 'play.html'), 'utf8');
  if (!/get\('f'\)/.test(pg) || !pg.includes('farmOpening') || !pg.includes('farm_games.json')) fail('play.html does not wire ?f=<id>');
}
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
