/* 練習賽 with a guild lineup (#800 part 7, league/practice_guild.js). Fails when
 *   - the members do not survive link -> parse, or a bad link is accepted,
 *   - the same link does not replay the same game byte for byte, or one game makes any network call,
 *   - the guild's members do not actually play (names missing from the box score) or the other team's roster is touched,
 *   - a guild game changes an official file (league/site/*, league/preseason/*), rule 24,
 *   - league/practice_guild.js uses a clock, randomness, the network, storage or the ledger by name.
 * Usage: node tests/practice_guild.check.mjs */
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as engine from '../engine/index.js';
import { ROSTERS } from '../league/players.js';
import { friendlyParam } from '../league/friendly.js';
import { MEMBERS_MAX, memberParam, parseMembers, guildProblem, guildRosters, guildShare, guildOpening, practiceMembers, practiceLink } from '../league/practice_guild.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bad = [], fail = m => bad.push(m);
const digest = () => {
  const h = createHash('sha256');
  for (const d of ['league/site', 'league/preseason']) for (const f of readdirSync(path.join(ROOT, d)).sort()) { if (/\.(json|js)$/.test(f)) h.update(f).update(readFileSync(path.join(ROOT, d, f))); }
  return h.digest('hex');
};
const before = digest();
const A = { away: 2, home: 0, sp: [1, 0], seed: 8007 };
const G = { side: 1, members: [
  { player: { name: '阿傑', kind: 'bat', pos: 'SS', ovr: 99 } },
  { player: { name: '小明', kind: 'bat', pos: 'CF', ovr: 95 } },
  { player: { name: '大雄', kind: 'pit', pos: 'SP', ovr: 99 } },
] };

/* link round trip */
const m = memberParam(G), back = parseMembers(m);
if (JSON.stringify(back) !== JSON.stringify(G)) fail(`members do not round-trip: ${m}`);
const link = guildShare(A, G, 'abcdef1'), u = new URL(link, 'https://example.test/');
if (u.searchParams.get('m') !== m || u.searchParams.get('e') !== 'abcdef1' || u.searchParams.get('x') !== friendlyParam(A)) fail(`link ${link}`);
for (const [what, s] of [['no side', 'b.SS.50.a'], ['side 2', '2~b.SS.50.a'], ['no members', '1'], ['bad kind', '1~x.SS.50.a'], ['bat as SP', '1~b.SP.50.a'], ['pit as SS', '1~p.SS.50.a'], ['ovr 0', '1~b.SS.0.a'], ['ovr 101', '1~b.SS.101.a'], ['empty name', '1~b.SS.50.'], ['long name', '1~b.SS.50.1234567890123'], ['too many', `1~${Array(MEMBERS_MAX + 1).fill('b.SS.50.a').join('~')}`]]) {
  if (parseMembers(s) !== null) fail(`bad members accepted: ${what}`);
}
if (guildProblem({ side: 1, members: [] }) === null) fail('a guild without members is playable');
try { guildShare({ ...A, own: { side: 0 } }, G, null); fail('guild + own player accepted'); } catch (e) { /* refused */ }
try { guildShare(A, { side: 0, members: [{ player: { name: 'a.b', kind: 'bat', pos: 'SS', ovr: 50 } }] }, null); fail('a dot in a name accepted'); } catch (e) { /* refused */ }

/* rosters: the guild's side has the members, the other teams are the same objects, the base is not mutated */
const snap = JSON.stringify(ROSTERS);
const rs = guildRosters(G, A, ROSTERS);
const names = rs[A.home].bat.concat(rs[A.home].pit).map(p => p.name);
for (const n of ['阿傑', '小明', '大雄']) if (!names.includes(n)) fail(`${n} is not on the guild roster`);
if (rs.some((r, i) => i !== A.home && r !== ROSTERS[i])) fail('another team was changed');
if (JSON.stringify(ROSTERS) !== snap) fail('the base rosters were mutated');
if (rs.names.length !== 3) fail(`names that play: ${rs.names.join(',')}`);

/* one game: zero calls, members play, same link = same game */
const calls = [], realFetch = globalThis.fetch;
globalThis.fetch = (...x) => { calls.push(String(x[0])); return Promise.reject(new Error('no network in a practice game')); };
const r1 = guildOpening(friendlyParam(A), m, engine, ROSTERS), r2 = guildOpening(u.searchParams.get('x'), u.searchParams.get('m'), engine, ROSTERS);
globalThis.fetch = realFetch;
if (r1.status !== 'ok' || !r1.opening) fail(`guild game: ${r1.status} ${r1.reason}`);
if (calls.length) fail(`guild game made ${calls.length} call(s): ${calls.join(', ')}`);
if (!r1.opening || !r2.opening || JSON.stringify(r1.opening.game.stream) !== JSON.stringify(r2.opening.game.stream)) fail('the link does not replay the same game');
else {
  const box = engine.boxFromStream(r1.opening.game.stream);
  const seen = new Set(box.players.flatMap(s => Object.keys(s)));
  if (!seen.has('阿傑') || !seen.has('小明')) fail('a guild batter has no line in the box score');
  const plain = guildOpening(friendlyParam(A), memberParam({ side: 1, members: [{ player: { name: '小明', kind: 'bat', pos: 'CF', ovr: 1 } }] }), engine, ROSTERS);
  if (JSON.stringify(plain.opening.game.stream) === JSON.stringify(r1.opening.game.stream)) fail('members make no difference to the game');
}
for (const [what, x, mm] of [['bad x', 'zz', m], ['bad m', friendlyParam(A), '9~b.SS.5.a'], ['same team', '1-1-0-0-5', m]]) {
  const r = guildOpening(x, mm, engine, ROSTERS);
  if (r.status !== 'invalid' || r.opening) fail(`${what}: ${r.status}`);
}

/* the guild page's button (#800 part 7 screen): view members -> link members -> a game that plays */
const view = { members: [{ leader: true, me: true, player: { name: '阿傑', kind: 'bat', pos: 'SS', ovr: 99 } }, { ref: 'x', player: null }, { player: { name: '大雄', kind: 'pit', pos: 'MR', ovr: 80 } }, { player: { name: '壞.名', kind: 'bat', pos: 'C', ovr: 50 } }, { player: { name: '老王', kind: 'pit', pos: 'SP', ovr: 70 } }] };
const pm = practiceMembers(view);
if (pm.map(x => x.player.name).join() !== '阿傑,大雄,老王') fail(`practiceMembers kept ${pm.map(x => x.player.name).join()}`);
if (pm[1].player.pos !== 'RP' || pm[2].player.pos !== 'SP') fail('practiceMembers did not map pitcher positions');
if (practiceMembers({ members: Array(20).fill(view.members[0]) }).length !== MEMBERS_MAX) fail('practiceMembers is not capped');
const pl = practiceLink({ members: pm, base: 0, opp: 2, sp: 1, seed: 77, commit: 'abcdef1' });
if (!pl.link) fail(`practiceLink: ${pl.problem}`);
else {
  const q = new URL(pl.link, 'https://example.test/').searchParams, back2 = parseMembers(q.get('m'));
  if (q.get('x') !== friendlyParam({ away: 2, home: 0, sp: [0, 1], seed: 77 }) || !back2 || back2.side !== 1) fail(`practiceLink link ${pl.link}`);
  const r = guildOpening(q.get('x'), q.get('m'), engine, ROSTERS);
  if (r.status !== 'ok' || !r.names.includes('阿傑')) fail(`practice link does not play: ${r.status} ${r.reason}`);
}
for (const [what, o] of [['same team', { base: 0, opp: 0 }], ['no members', { members: [], base: 0, opp: 1 }], ['bad starter', { base: 0, opp: 1, sp: 5 }]]) {
  if (!practiceLink({ members: pm, seed: 1, commit: 'abcdef1', ...o }).problem) fail(`practiceLink accepted ${what}`);
}

if (digest() !== before) fail('a guild practice game changed an official file (rule 24)');
const src = readFileSync(path.join(ROOT, 'league/practice_guild.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
if (/Math\.random|Date\b|fetch\(|XMLHttpRequest|sendBeacon|ledger|farm_games|localStorage|sessionStorage/.test(src)) fail('league/practice_guild.js uses a clock, randomness, the network, storage or the ledger by name');

if (bad.length) { console.log(`practice_guild FAIL (${bad.length})`); for (const b of bad) console.log(' - ' + b); process.exit(1); }
console.log('practice_guild ok: members in the link, same link = same game, 0 calls, members play');
