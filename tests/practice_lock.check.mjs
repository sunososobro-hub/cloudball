/* Practice against the newest lock snapshot (#809 part 5, league/practice_lock.js). Fails when
 *   - lockPaths is not newest first, skips a day, or does not cross a month / year / leap day; a bad day is not refused,
 *   - newestLock does not take the newest valid file, trips on a missing / throwing / broken / invalid file, or returns something with no lock in range,
 *   - practiceOpponent returns my own guild, differs for one seed, or is not null with no other guild,
 *   - a practice game made from a lock makes any network call, differs between two runs, edits the lock or the site players,
 *     or does not put the members into the roster (league/guild_roster.js rule), or an unknown guild is not named,
 *   - league/practice_lock.js uses Math.random, Date.now, fetch, localStorage, or imports the ledger / network.
 * Usage: node tests/practice_lock.check.mjs */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as engine from '../engine/index.js';
import { lockPaths, newestLock, practiceOpponent, practiceGame, LOCK_LOOKBACK } from '../league/practice_lock.js';
import { practiceOpening } from '../league/practice.js';
import { freeze } from '../league/guild_night.js';

const bad = [], fail = m => bad.push(m);
const rd = p => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const players = JSON.parse(rd('../league/site/players.json')), playersJson = JSON.stringify(players);
const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

/* paths */
const P = lockPaths('2026-03-02', 3), tail = d => `league/site/guilds/lock-${d}.json`;
if (JSON.stringify(P) !== JSON.stringify(['2026-03-02', '2026-03-01', '2026-02-28', '2026-02-27'].map(tail))) fail(`lockPaths: ${P}`);
if (lockPaths('2028-03-01', 1)[1] !== tail('2028-02-29')) fail('lockPaths: leap day');
if (lockPaths('2027-01-01', 1)[1] !== tail('2026-12-31')) fail('lockPaths: year border');
if (lockPaths('2026-11-28').length !== LOCK_LOOKBACK + 1) fail('lockPaths: default range');
for (const d of ['2026-1-1', '', 'x']) { try { lockPaths(d); fail(`lockPaths accepted "${d}"`); } catch (e) { /* named refusal */ } }

/* three hand-made guilds, frozen the way the nightly run freezes them */
const m = (name, kind, ovr, pos) => ({ leader: false, coach: false, player: { name, kind, ovr, pos } });
const exp = { guilds: [
  { id: 'cccccccccccc', name: '丙', base: 'owls', settings: null, members: [m('阿丙', 'bat', 70, 'C')] },
  { id: 'aaaaaaaaaaaa', name: '甲', base: 'owls', settings: null, members: [m('阿甲', 'bat', 90, 'SS'), m('阿投', 'pit', 80, 'SP')] },
  { id: 'bbbbbbbbbbbb', name: '乙', base: 'owls', settings: null, members: [] }] };
const lock = freeze(exp, '2026-11-27', 'abcdef1'), lockJson = JSON.stringify(lock);

/* newestLock */
const files = { [tail('2026-11-27')]: lockJson, [tail('2026-11-26')]: '{"guilds":[]}', [tail('2026-11-25')]: 'not json' };
const asked = [], load = p => { asked.push(p); return p in files ? files[p] : null; };
const got = await newestLock('2026-11-28', load);
if (!got || got.date !== '2026-11-27') fail('newestLock did not take the newest valid file');
if (asked.length !== 2 || asked[0] !== tail('2026-11-28')) fail(`newestLock asked ${asked.length} files, first ${asked[0]}`);
const g2 = await newestLock('2026-11-28', p => (p === tail('2026-11-28') ? (() => { throw new Error('offline'); })() : p === tail('2026-11-27') ? '{"guilds":[{"id":1}]}' : p === tail('2026-11-26') ? files[p] : null));
if (!g2 || g2.guilds.length !== 0) fail('newestLock did not skip a throwing and an invalid file');
if (await newestLock('2026-11-28', () => null) !== null) fail('newestLock found a lock where there is none');
if (await newestLock('2026-12-30', load) !== null) fail('newestLock looked past LOCK_LOOKBACK');

/* opponent */
const oppA = practiceOpponent(lock, 'aaaaaaaaaaaa', 5);
if (oppA === 'aaaaaaaaaaaa' || !['bbbbbbbbbbbb', 'cccccccccccc'].includes(oppA)) fail(`practiceOpponent: ${oppA}`);
if (practiceOpponent(lock, 'aaaaaaaaaaaa', 5) !== oppA || practiceOpponent(lock, 'aaaaaaaaaaaa', 6) === oppA) fail('practiceOpponent: not the seed, or not stable');
if (practiceOpponent({ guilds: [lock.guilds[0]] }, lock.guilds[0].id, 1) !== null || practiceOpponent(null, 'x', 1) !== null) fail('practiceOpponent: no other guild must be null');

/* a game */
const calls = [], realFetch = globalThis.fetch;
globalThis.fetch = (...x) => { calls.push(String(x[0])); return Promise.reject(new Error('no network')); };
const play = () => { const g = practiceGame(lock, 'aaaaaaaaaaaa', 'bbbbbbbbbbbb', players, 811); return { g, r: practiceOpening(g.a, engine, mem(), '2026-11-28', g.rosters) }; };
const x1 = play(), x2 = play();
globalThis.fetch = realFetch;
if (calls.length) fail(`practice game made ${calls.length} call(s)`);
if (x1.r.status !== 'ok' || !x1.r.opening) fail(`practice game: ${x1.r.status} ${x1.r.reason}`);
if (JSON.stringify(x1.r.opening.game) !== JSON.stringify(x2.r.opening.game)) fail('same lock + seed gave two games');
if (!x1.g.rosters[0].bat.some(p => p.name === '阿甲') || !x1.g.rosters[0].pit.some(p => p.name === '阿投')) fail('members did not take their seats');
if (JSON.stringify(x1.g.names[0]) !== JSON.stringify(['阿甲', '阿投']) || x1.g.names[1].length) fail(`names: ${JSON.stringify(x1.g.names)}`);
if (JSON.stringify(lock) !== lockJson || JSON.stringify(players) !== playersJson) fail('a practice game edited the lock or the players');
try { practiceGame(lock, 'aaaaaaaaaaaa', 'nope', players, 1); fail('unknown guild not refused'); } catch (e) { if (!/nope/.test(e.message)) fail(`unknown guild reason: ${e.message}`); }
try { practiceGame({ guilds: [{ ...lock.guilds[0], base: 'zzz' }, lock.guilds[1]] }, lock.guilds[0].id, lock.guilds[1].id, players, 1); fail('unknown base not refused'); } catch (e) { if (!/zzz/.test(e.message)) fail(`unknown base reason: ${e.message}`); }

/* source rules */
const src = rd('../league/practice_lock.js').replace(/\/\*[\s\S]*?\*\//g, '');
for (const re of [/Math\.random/, /Date\.now/, /new Date\(\)/, /\bfetch\b/, /localStorage/, /ledger/i, /https?:/]) if (re.test(src)) fail(`practice_lock.js uses ${re}`);

if (bad.length) { console.error('FAIL\n' + bad.map(b => ' - ' + b).join('\n')); process.exit(1); }
console.log('ok: practice_lock');
