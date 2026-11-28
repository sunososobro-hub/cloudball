/* 友誼賽 (#751 part 1, league/friendly.js + friendly.html). Fails when
 *   - an arrangement does not parse / round-trip, or a bad one (same team, starter outside the five SP, seed over uint32) is playable,
 *   - the same arrangement does not give the same game byte for byte, or the starters / teams are not the ones asked for,
 *   - building and playing games changes any official file (league/site/*.json, league/preseason/*), rule 24,
 *   - league/friendly.js imports anything or uses Math.random, Date, fetch or the ledger; friendly.html is not reachable from index.html.
 * Usage: node tests/friendly.check.mjs */
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as engine from '../engine/index.js';
import { ROSTERS } from '../league/players.js';
import { TEAM_COUNT, STARTERS, parseFriendly, friendlyParam, friendlyUrl, friendlyProblem, friendlyOpening, friendlyPin } from '../league/friendly.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bad = [], fail = m => bad.push(m);
const digest = () => {
  const h = createHash('sha256');
  for (const d of ['league/site', 'league/preseason']) for (const f of readdirSync(path.join(ROOT, d)).sort()) { if (/\.(json|js)$/.test(f)) h.update(f).update(readFileSync(path.join(ROOT, d, f))); }
  return h.digest('hex');
};
const before = digest();

const a = { away: 2, home: 0, sp: [4, 1], seed: 4000000000 };
if (friendlyProblem(a)) fail(`good arrangement refused: ${friendlyProblem(a)}`);
if (JSON.stringify(parseFriendly(friendlyParam(a))) !== JSON.stringify(a)) fail('parse(param(a)) != a');
if (friendlyUrl(a) !== 'play.html?x=2-0-4-1-4000000000') fail(`url ${friendlyUrl(a)}`);
if (friendlyUrl(a, engine.ENGINE_VERSION) !== `play.html?x=2-0-4-1-4000000000&v=${engine.ENGINE_VERSION}`) fail('pinned url');
if (friendlyUrl(a, 'x;y') !== friendlyUrl(a)) fail('a bad version is put in the url');
if (friendlyPin(null, '0.4.32') !== null || friendlyPin('0.4.32', '0.4.32') !== null) fail('matching or missing pin gives a note');
if (!friendlyPin('0.4.31', '0.4.32') || !friendlyPin('<b>', '0.4.32')) fail('other or bad pin gives no note');
for (const [what, b] of [['same team', { ...a, home: 2 }], ['team 4', { ...a, away: TEAM_COUNT }], ['starter outside the SP', { ...a, sp: [STARTERS, 0] }], ['seed over uint32', { ...a, seed: 2 ** 32 }], ['negative seed', { ...a, seed: -1 }], ['no sp', { ...a, sp: [1] }]])
  if (!friendlyProblem(b)) fail(`${what} is playable`);
for (const s of ['', 'x', '1-2-3', '1-2-3-4-5-6', '1-1-0-0-1', '0-1-9-0-1', '0-1-0-0-99999999999', null, undefined, '../../x'])
  if (friendlyOpening(s, engine).opening) fail(`"${s}" gives a game`);

for (const [x, seed] of [[friendlyParam(a), a.seed], ['0-1-0-0-1', 1], ['3-1-2-3-77', 77]]) {
  const r1 = friendlyOpening(x, engine), r2 = friendlyOpening(x, engine);
  if (r1.status !== 'ok' || !r1.opening || r1.opening.seed !== seed || r1.opening.friendly !== x || !Array.isArray(r1.opening.game.ev)) { fail(`${x}: ${r1.status} ${r1.reason}`); continue; }
  if (JSON.stringify(r1.opening.game.stream) !== JSON.stringify(r2.opening.game.stream)) fail(`${x}: two plays differ`);
  const p = parseFriendly(x), box = engine.boxFromStream(r1.opening.game.stream);
  if (!Array.isArray(box.score) || box.score.length !== 2) fail(`${x}: no final score`);
  const names = JSON.stringify(r1.opening.game.stream.slice(0, 5));
  for (const k of [0, 1]) if (!names.includes(ROSTERS[[p.away, p.home][k]].pit[p.sp[k]].name)) fail(`${x}: starter ${k} is not in the game_start event`);
}
{   /* the starter choice changes the game; the team choice too */
  const s1 = JSON.stringify(friendlyOpening('0-1-0-0-5', engine).opening.game.stream), s2 = JSON.stringify(friendlyOpening('0-1-3-0-5', engine).opening.game.stream);
  if (s1 === s2) fail('another away starter gives the same game');
}
if (digest() !== before) fail('playing games changed an official file (rule 24)');

const src = readFileSync(path.join(ROOT, 'league/friendly.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
if (/^\s*import\b|\bimport\s*\(/m.test(src)) fail('league/friendly.js imports something');
if (/Math\.random|Date\b|fetch\(|XMLHttpRequest|ledger|farm_games|localStorage/.test(src)) fail('league/friendly.js uses a clock, randomness, the network, storage or the ledger');
const idx = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
if (!idx.includes('href="friendly.html"')) fail('index.html does not link friendly.html');
const page = readFileSync(path.join(ROOT, 'friendly.html'), 'utf8');
if (!page.includes('id="share"')) fail('friendly.html has no share button');
if (!page.includes('友誼賽') || !page.includes('不是正式比賽')) fail('friendly.html does not say it is not official');
const ui = readFileSync(path.join(ROOT, 'ui/friendly.js'), 'utf8');
if (/fetch\(|XMLHttpRequest|localStorage|sendBeacon|method\s*:\s*['"]POST/i.test(ui)) fail('ui/friendly.js writes or calls the network');

if (bad.length) { console.error('friendly check FAILED:\n - ' + bad.join('\n - ')); process.exit(1); }
console.log('friendly check ok');
