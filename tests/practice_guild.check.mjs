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
import { MEMBERS_MAX, memberParam, parseMembers, guildProblem, guildRosters, guildShare, guildOpening, guildPlay } from '../league/practice_guild.js';

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

/* play.html path (guildPlay): no m = none; a good link = the guild's team swapped, the other team the same object; bad ones are named */
{
  const x = friendlyParam(A), g0 = guildPlay(x, null, ROSTERS), g1 = guildPlay(x, m, ROSTERS);
  if (g0.status !== 'none' || g0.rosters) fail(`no m: ${g0.status}`);
  if (g1.status !== 'ok' || g1.team !== A.home) fail(`good link: ${g1.status} ${g1.reason} team ${g1.team}`);
  else {
    const names = g1.rosters[g1.team].bat.map(p => p.name);
    if (!names.includes('阿傑') || !names.includes('小明')) fail('guildPlay: members are not on the guild side');
    if (g1.rosters[A.away] !== ROSTERS[A.away]) fail('guildPlay touched the other team');
    if (ROSTERS[A.home].bat.some(p => p.name === '阿傑')) fail('guildPlay changed the shared ROSTERS');
  }
  for (const [what, xx, mm] of [['bad x', 'zz', m], ['bad m', x, '9~b.SS.5.a'], ['same team', '1-1-0-0-5', m]]) {
    const r = guildPlay(xx, mm, ROSTERS);
    if (r.status !== 'invalid' || !r.reason || r.rosters) fail(`guildPlay ${what}: ${r.status}`);
  }
}
if (digest() !== before) fail('a guild practice game changed an official file (rule 24)');
const src = readFileSync(path.join(ROOT, 'league/practice_guild.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
if (/Math\.random|Date\b|fetch\(|XMLHttpRequest|sendBeacon|ledger|farm_games|localStorage|sessionStorage/.test(src)) fail('league/practice_guild.js uses a clock, randomness, the network, storage or the ledger by name');

if (bad.length) { console.log(`practice_guild FAIL (${bad.length})`); for (const b of bad) console.log(' - ' + b); process.exit(1); }
console.log('practice_guild ok: members in the link, same link = same game, 0 calls, members play');
