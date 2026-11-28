/* 練習賽 (#810 part 1, league/practice.js). Fails when
 *   - one practice game (fetch stubbed) makes any call, `/api/` or other,
 *   - the daily limit is not PRACTICE_PER_DAY games, a game past it is played, the next day does not reset, a blocked / broken store breaks a game,
 *   - the share link does not replay the same game byte for byte, or needs the server (the link is only a URL),
 *   - a practice game changes an official file (league/site/*.json, league/preseason/*), rule 24,
 *   - league/practice.js imports the network, or uses Math.random, Date, fetch, the ledger or localStorage by name.
 * Usage: node tests/practice.check.mjs */
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as engine from '../engine/index.js';
import { PRACTICE_PER_DAY, DAY_RE, practiceLeft, practiceUse, practiceLink, practiceOpening } from '../league/practice.js';
import { parseFriendly, friendlyOpening } from '../league/friendly.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bad = [], fail = m => bad.push(m);
const digest = () => {
  const h = createHash('sha256');
  for (const d of ['league/site', 'league/preseason']) for (const f of readdirSync(path.join(ROOT, d)).sort()) { if (/\.(json|js)$/.test(f)) h.update(f).update(readFileSync(path.join(ROOT, d, f))); }
  return h.digest('hex');
};
const before = digest();
const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
const A = { away: 1, home: 3, sp: [2, 0], seed: 810 }, D1 = '2026-11-28', D2 = '2026-11-29';

/* zero calls: fetch (and XHR / beacon) stubbed and counted around one whole practice game and its share link */
const calls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (...x) => { calls.push(String(x[0])); return Promise.reject(new Error('no network in a practice game')); };
globalThis.XMLHttpRequest = function () { calls.push('xhr'); };
const store = mem();
const r = practiceOpening(A, engine, store, D1);
const link = practiceLink(A, 'abcdef1');
if (r.status !== 'ok' || !r.opening) fail(`practice game: ${r.status} ${r.reason}`);
if (calls.length !== 0) fail(`practice made ${calls.length} call(s): ${calls.join(', ')}; /api/ calls: ${calls.filter(c => c.includes('/api/')).length}`);
globalThis.fetch = realFetch;

/* the share link replays byte for byte */
const u = new URL(link, 'https://example.test/'), x = u.searchParams.get('x');
if (!link.startsWith('play.html?x=') || u.searchParams.get('e') !== 'abcdef1') fail(`link ${link}`);
if (JSON.stringify(parseFriendly(x)) !== JSON.stringify(A)) fail('link does not carry the arrangement');
const again = friendlyOpening(x, engine);
if (!r.opening || JSON.stringify(again.opening.game.stream) !== JSON.stringify(r.opening.game.stream)) fail('the link does not replay the same game');
if (practiceLink(A, null) !== 'play.html?x=1-3-2-0-810') fail(`link without pin ${practiceLink(A, null)}`);
try { practiceLink(A, 'zz'); fail('bad pin is accepted'); } catch (e) { /* refused */ }

/* the daily limit */
const s = mem();
if (practiceLeft(s, D1) !== PRACTICE_PER_DAY) fail('fresh day does not have the full limit');
for (let i = 0; i < PRACTICE_PER_DAY; i++) { const p = practiceOpening({ ...A, seed: i }, engine, s, D1); if (p.status !== 'ok' || p.left !== PRACTICE_PER_DAY - 1 - i) fail(`game ${i + 1}: ${p.status} left ${p.left}`); }
const over = practiceOpening(A, engine, s, D1);
if (over.status !== 'limit' || over.opening || over.left !== 0) fail('a game past the limit is played');
if (practiceUse(s, D1).ok) fail('use past the limit is ok');
if (practiceLeft(s, D2) !== PRACTICE_PER_DAY) fail('the next day does not reset');
if (practiceOpening({ ...A, home: A.away }, engine, mem(), D1).status !== 'invalid') fail('same team is playable');
const inv = mem(); practiceOpening({ ...A, home: A.away }, engine, inv, D1);
if (practiceLeft(inv, D1) !== PRACTICE_PER_DAY) fail('an invalid arrangement used a game');
for (const [what, st] of [['broken json', { getItem: () => '{x', setItem() {} }], ['blocked', { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }], ['no store', {}]]) {
  const p = practiceOpening(A, engine, st, D1);
  if (p.status !== 'ok') fail(`${what}: ${p.status} ${p.reason}`);
}
try { practiceLeft(mem(), 'today'); fail('bad day accepted'); } catch (e) { /* refused */ }

if (digest() !== before) fail('a practice game changed an official file (rule 24)');
const src = readFileSync(path.join(ROOT, 'league/practice.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
if (/\bimport\s*\(/.test(src) || /^\s*import\b(?!.*from '\.\/friendly\.js')/m.test(src)) fail('league/practice.js imports something but ./friendly.js');
if (/Math\.random|Date\b|fetch\(|XMLHttpRequest|sendBeacon|ledger|farm_games|localStorage/.test(src)) fail('league/practice.js uses a clock, randomness, the network, the ledger or localStorage by name');

/* part 2: the 友誼賽 page spends the daily limit (ui/practice_limit.js), nothing leaves the browser */
{
  const L = await import('../ui/practice_limit.js');
  if (L.dayKey(new Date(2026, 10, 5)) !== '2026-11-05' || !DAY_RE.test(L.dayKey())) fail(`dayKey ${L.dayKey(new Date(2026, 10, 5))}`);
  const m = mem();
  if (L.gamesLeft(m, D1) !== PRACTICE_PER_DAY) fail('page limit: fresh day is not full');
  for (let i = 0; i < PRACTICE_PER_DAY; i++) if (!L.takeGame(m, D1).ok) fail(`page limit: game ${i + 1} refused`);
  if (L.takeGame(m, D1).ok || L.gamesLeft(m, D1) !== 0) fail('page limit: past the limit is allowed');
  if (L.gamesLeft(m, D2) !== PRACTICE_PER_DAY) fail('page limit: next day does not reset');
  if (!L.takeGame({}, D1).ok) fail('page limit: a blocked store stops the game');
  const lim = readFileSync(path.join(ROOT, 'ui/practice_limit.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  if (/fetch\(|XMLHttpRequest|sendBeacon|method\s*:/.test(lim)) fail('ui/practice_limit.js calls the network');
  const fj = readFileSync(path.join(ROOT, 'ui/friendly.js'), 'utf8'), fh = readFileSync(path.join(ROOT, 'friendly.html'), 'utf8');
  if (!/takeGame\(\)\.ok/.test(fj) || !/gamesLeft\(\)/.test(fj) || !fh.includes('id="left"')) fail('友誼賽 page does not spend / show the daily limit');
  if (digest() !== before) fail('the page limit changed an official file (rule 24)');
}

if (bad.length) { console.log(`practice FAIL (${bad.length})`); for (const m of bad) console.log(' - ' + m); process.exit(1); }
console.log(`practice ok: 0 calls in a game, limit ${PRACTICE_PER_DAY}/day, link replays byte for byte`);
