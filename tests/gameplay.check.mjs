/* play.html?g=<season>-<id> (#592, league/gameplay.js). Fails when
 *   - a fixture ledger record (made by the current engine, loader injected, no network) does not open as `ok` with a game
 *     whose final score equals the record's score, or the ledger is asked for another season / id than the param names,
 *   - a tampered record, a 404, a throwing ledger or a bad param gives a picture instead of a named status,
 *   - the page does not wire ?g=, or game.js does not keep the booth silent for a ledger game (no script, no browser voice),
 *   - league/gameplay.js imports more than ./replay.js or uses Math.random, Date or the network.
 * static.mjs runs this file (every tests/*.check.mjs). Usage: node tests/gameplay.check.mjs */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as engine from '../engine/index.js';
import { gameParam, gameUrl, gameOpening } from '../league/gameplay.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bad = [], fail = m => bad.push(m);
const COMMIT = 'c902ed5794ffd8bbb069e08c439fd19922e06918';
const g0 = engine.simGame(4242, {}, { teams: [1, 0] }), b0 = engine.boxFromStream(g0.stream);
const rec = { id: 3, seed: 4242, engine: { commit: COMMIT, version: g0.engine }, teams: [1, 0], decisions: {}, result: { score: b0.score, line_score: b0.line } };
const clone = x => JSON.parse(JSON.stringify(x));
const asked = [], asked2 = [];
const fetchRec = async (s, i) => { asked.push(`${s}-${i}`); return s === '0' && i === 3 ? clone(rec) : null; };
const local = async c => { asked2.push(c); return engine; };

const o = await gameOpening('0-3', fetchRec, local);
if (o.status !== 'ok' || !o.opening) fail(`fixture: ${o.status} ${o.reason}`);
else {
  if (o.opening.seed !== 4242 || o.opening.ledger !== '0-3') fail('opening seed / ledger tag');
  if (JSON.stringify(o.opening.game.stream) !== JSON.stringify(g0.stream)) fail('replayed stream differs from the engine stream');
  if (JSON.stringify(engine.boxFromStream(o.opening.game.stream).score) !== JSON.stringify(rec.result.score)) fail('final score differs from the record');
}
if (asked.join() !== '0-3') fail(`ledger asked for ${asked.join()}`);
if (asked2.join() !== COMMIT) fail(`engine loader asked for ${asked2.join()}`);

const t = clone(rec); t.result.score[0] += 1;
const tam = await gameOpening('0-3', async () => clone(t), local);
if (tam.opening !== null || tam.status !== 'mismatch') fail(`tampered record: ${tam.status}`);
const none = await gameOpening('0-9', fetchRec, local);
if (none.opening !== null || none.status !== 'unknown') fail(`404: ${none.status}`);
const down = await gameOpening('0-3', async () => { throw new Error('HTTP 503'); }, local);
if (down.opening !== null || down.status !== 'unavailable') fail(`ledger down: ${down.status}`);
for (const p of ['', 'x', '0-', '-3', '0-3/../x', '0-3x', '1234-1', null, undefined]) {
  const r = await gameOpening(p, fetchRec, local);
  if (r.opening !== null || r.status !== 'invalid') fail(`param ${JSON.stringify(p)}: ${r.status}`);
}
if (JSON.stringify(gameParam('2-17')) !== '{"season":"2","id":17}' || gameParam('a-1') !== null) fail('gameParam');
if (gameUrl('0', 3) !== 'play.html?g=0-3') fail(`gameUrl ${gameUrl('0', 3)}`);

const pg = readFileSync(path.join(ROOT, 'play.html'), 'utf8'), gm = readFileSync(path.join(ROOT, 'render/game.js'), 'utf8');
if (!/get\('g'\)/.test(pg) || !pg.includes('gameOpening') || !pg.includes('ledgerUrl') || !pg.includes('LEDGER_GAME')) fail('play.html does not wire ?g=<id>');
if (!/loadScript=seed=>\{if\(window\.FARM\|\|window\.LEDGER_GAME\)return Promise\.reject/.test(gm)) fail('game.js: a ledger game may load a commentary script (booth must stay silent)');

const src = readFileSync(path.join(ROOT, 'league/gameplay.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
if (/^\s*import\s[^;]*from\s+['"](?!\.\/replay\.js)/m.test(src)) fail('league/gameplay.js imports something other than ./replay.js');
if (/Math\.random|Date\b|fetch\(|XMLHttpRequest|speechSynthesis/.test(src)) fail('league/gameplay.js uses randomness, a clock, the network or browser voice');

if (bad.length) { console.error(bad.map(m => 'FAIL ' + m).join('\n')); process.exit(1); }
console.log('gameplay.check ok: ledger game opens by ?g=<season>-<id>, silent, tampered / missing / bad param never a picture');
