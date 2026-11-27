/* Replay of a ledger record with the engine of its own commit (league/replay.js, #590). Fails when
 *   - a record made by the current engine (path injected, no network) does not replay to `ok` with the same
 *     score and line score, or the loader is not asked for the record's commit,
 *   - a tampered score or line score is not `mismatch` (the caller then shows the box score only),
 *   - a record without seed / engine.commit / result is not `invalid` with a named reason,
 *   - a loader that throws is not `unavailable`, or engineUrl does not point at engine/index.js of that commit,
 *   - league/replay.js imports anything or uses Math.random or Date.
 * static.mjs runs this file (every tests/*.check.mjs). Usage: node tests/ledger_replay.check.mjs */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as engine from '../engine/index.js';
import { replayRecord, recordProblem, engineUrl } from '../league/replay.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bad = [], fail = m => bad.push(m);
const COMMIT = 'c902ed5794ffd8bbb069e08c439fd19922e06918';
const asked = [];
const local = async c => { asked.push(c); return engine; };

/* Fixture: games written by the current dev engine, as the record writer would. */
const fixtures = [[704, [0, 1]], [12345, [2, 3]], [99, [1, 0]]].map(([seed, teams]) => {
  const g = engine.simGame(seed, {}, { teams });
  const b = engine.boxFromStream(g.stream);
  return { id: seed, seed, engine: { commit: COMMIT, version: g.engine }, teams, decisions: {}, result: { score: b.score, line_score: b.line } };
});
const clone = x => JSON.parse(JSON.stringify(x));

for (const rec of fixtures) {
  const r = await replayRecord(clone(rec), local);
  if (r.status !== 'ok') fail(`seed ${rec.seed}: ${r.status} ${r.reason}`);
  else if (JSON.stringify(r.box.score) !== JSON.stringify(rec.result.score)) fail(`seed ${rec.seed}: score changed`);
}
if (!asked.length || asked.some(c => c !== COMMIT)) fail(`loader asked for ${asked.join(',')} not ${COMMIT}`);

const t1 = clone(fixtures[0]); t1.result.score[1] += 1;
if ((await replayRecord(t1, local)).status !== 'mismatch') fail('tampered score is not mismatch');
const t2 = clone(fixtures[1]); t2.result.line_score[1].push(0);   /* same score, one inning too many */
if ((await replayRecord(t2, local)).status !== 'mismatch') fail('tampered line score is not mismatch');
const t3 = clone(fixtures[2]); t3.seed += 1;
if ((await replayRecord(t3, local)).status !== 'mismatch') fail('other seed is not mismatch');

const cases = [
  ['no seed', r => { delete r.seed; }, /seed/],
  ['no engine.commit', r => { delete r.engine.commit; }, /engine\.commit/],
  ['commit not hex', r => { r.engine.commit = '../../evil'; }, /engine\.commit/],
  ['no result.score', r => { delete r.result.score; }, /result\.score/],
  ['no line_score', r => { delete r.result.line_score; }, /line_score/],
];
for (const [name, edit, re] of cases) {
  const r = clone(fixtures[0]); edit(r);
  const why = recordProblem(r), out = await replayRecord(r, local);
  if (!why || !re.test(why)) fail(`${name}: reason "${why}"`);
  if (out.status !== 'invalid') fail(`${name}: status ${out.status}`);
}
const down = await replayRecord(clone(fixtures[0]), async () => { throw new Error('404'); });
if (down.status !== 'unavailable') fail(`throwing loader: ${down.status}`);
if (engineUrl(COMMIT) !== `https://cdn.jsdelivr.net/gh/sunososobro-hub/cloudball@${COMMIT}/engine/index.js`) fail(`engineUrl ${engineUrl(COMMIT)}`);

const src = readFileSync(path.join(ROOT, 'league/replay.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
if (/^\s*import\s/m.test(src)) fail('league/replay.js has a static import');
if (/Math\.random|\bDate\b/.test(src)) fail('league/replay.js uses Math.random or Date');

if (bad.length) { console.error('ledger_replay FAIL\n- ' + bad.join('\n- ')); process.exit(1); }
console.log(`ledger_replay ok: ${fixtures.length} records replay, tampered score / line / seed -> mismatch, ${cases.length} bad records named`);
