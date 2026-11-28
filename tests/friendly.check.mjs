/* 友誼賽 (#751 part 1 + share link part 2, league/friendly.js + friendly.html). Fails when
 *   - an arrangement does not parse / round-trip, or a bad one (same team, starter outside the five SP, seed over uint32) is playable,
 *   - the same arrangement does not give the same game byte for byte, or the starters / teams are not the ones asked for,
 *   - building and playing games changes any official file (league/site/*.json, league/preseason/*), rule 24,
 *   - a share link does not carry the arrangement and the engine pin, a bad pin is ignored instead of refused, the pinned engine is not the one asked for,
 *     or a link with a pin and the same link played twice (or with the page's own engine of the same commit) give different games,
 *   - league/friendly.js imports anything or uses Math.random, Date, fetch or the ledger; friendly.html is not reachable from index.html.
   - (part 3) the own player in a link is refused when malformed, is frozen in the link (o=), changes the game, replaces only his slot, and never touches the factory rosters or an official file.
 * Usage: node tests/friendly.check.mjs */
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as engine from '../engine/index.js';
import { ROSTERS } from '../league/players.js';
import { TEAM_COUNT, STARTERS, ownParam, parseOwn, ownProblem, parseFriendly, friendlyParam, friendlyUrl, friendlyProblem, friendlyOpening, friendlyPin, friendlyCommitPin, friendlyShare, friendlyOpeningAt } from '../league/friendly.js';
import { ENGINE_PIN } from '../league/engine_pin.js';
import { ownRosters, ownBatter } from '../league/friendly_own.js';
import { myBatter, ownOf } from '../ui/friendly_me.js';

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

/* part 2: the share link */
if (!/^[0-9a-f]{40}$/.test(ENGINE_PIN.commit) || ENGINE_PIN.version !== engine.ENGINE_VERSION && !/^\d+\.\d+\.\d+$/.test(ENGINE_PIN.version)) fail(`engine_pin.js: ${JSON.stringify(ENGINE_PIN)}`);
const link = friendlyShare(a, ENGINE_PIN.commit);
if (link !== `play.html?x=2-0-4-1-4000000000&e=${ENGINE_PIN.commit}`) fail(`share link ${link}`);
if (friendlyShare(a, null) !== friendlyUrl(a)) fail('a link without a pin is not the part 1 link');
const q = new URLSearchParams(link.split('?')[1]);
if (q.get('x') !== friendlyParam(a) || friendlyCommitPin(q.get('e')).commit !== ENGINE_PIN.commit) fail('share link does not carry arrangement + pin');
for (const e of ['zz', 'ABCDEF1', 'abc12', 'a'.repeat(41), '../x', '1e8dc6fb1a0a7a120d4dff8d8187985b6d9a1916;x']) { if (friendlyCommitPin(e).ok) fail(`bad pin "${e}" accepted`); let t = false; try { friendlyShare(a, e); } catch { t = true; } if (!t) fail(`share link built with bad pin "${e}"`); }
if (!friendlyCommitPin(null).ok || friendlyCommitPin('').commit !== null) fail('no pin is not allowed');
{
  const asked = [], load = async c => { asked.push(c); return engine; };
  const x = friendlyParam(a), plain = friendlyOpening(x, engine);
  const p1 = await friendlyOpeningAt(x, ENGINE_PIN.commit, load), p2 = await friendlyOpeningAt(x, ENGINE_PIN.commit, load), p0 = await friendlyOpeningAt(x, null, load);
  if (p1.status !== 'ok' || p1.opening.engine !== ENGINE_PIN.commit) fail(`pinned play: ${p1.status} ${p1.reason}`);
  if (asked.join() !== `${ENGINE_PIN.commit},${ENGINE_PIN.commit},`) fail(`loader asked for ${asked.join('|')}`);
  if (JSON.stringify(p1.opening.game.stream) !== JSON.stringify(p2.opening.game.stream) || JSON.stringify(p1.opening.game.stream) !== JSON.stringify(plain.opening.game.stream) || JSON.stringify(p0.opening.game.stream) !== JSON.stringify(plain.opening.game.stream)) fail('same link, different game');
  const nope = await friendlyOpeningAt(x, 'zz', load), bad = await friendlyOpeningAt('1-1-0-0-1', ENGINE_PIN.commit, load), gone = await friendlyOpeningAt(x, ENGINE_PIN.commit, async () => { throw new Error('404'); });
  if (nope.opening || nope.status !== 'invalid' || asked.length !== 3) fail('a bad pin was ignored or loaded');
  if (bad.opening || bad.status !== 'invalid') fail('bad arrangement played with a pin');
  if (gone.opening || gone.status !== 'unavailable') fail('an engine that cannot be loaded still gives a game');
  if (digest() !== before) fail('a pinned play changed an official file (rule 24)');
}
const play = readFileSync(path.join(ROOT, 'play.html'), 'utf8');
if (!/friendlyOpeningAt\(xp,q\.get\('e'\)/.test(play) || !/engineUrl/.test(play)) fail('play.html does not play ?x= with the pinned ?e= engine');
if (!/friendlyShare/.test(ui) || !/ENGINE_PIN/.test(ui)) fail('ui/friendly.js does not build the pinned share link');
if (!/id="share"/.test(page) || !/id="copy"/.test(page)) fail('friendly.html has no share link field');
if (/Math\.random|Date\b|fetch\(/.test(readFileSync(path.join(ROOT, 'league/engine_pin.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''))) fail('league/engine_pin.js is not pure data');

/* part 3: own player in the lineup */
{
  const own = { side: 0, slot: 3, con: 80, pow: 70, eye: 60, spd: 50, arm: 55, hand: 'L', age: 25, num: 7, name: '小明' };
  const b = { away: 0, home: 1, sp: [0, 0], seed: 5, own }, plain = { away: 0, home: 1, sp: [0, 0], seed: 5 };
  if (friendlyProblem(b)) fail(`own arrangement refused: ${friendlyProblem(b)}`);
  if (JSON.stringify(parseOwn(ownParam(own))) !== JSON.stringify(own)) fail('parseOwn(ownParam(o)) != o');
  const bads = [['side 2', { ...own, side: 2 }], ['slot 9', { ...own, slot: 9 }], ['rating 0', { ...own, con: 0 }], ['rating 101', { ...own, pow: 101 }], ['rating 1.5', { ...own, eye: 1.5 }], ['hand S', { ...own, hand: 'S' }], ['age 3', { ...own, age: 3 }], ['num -1', { ...own, num: -1 }],
    ['dot in name', { ...own, name: 'a.b' }], ['tag in name', { ...own, name: '<b>' }], ['empty name', { ...own, name: '' }], ['long name', { ...own, name: '一二三四五六七八九十一二三' }]];
  for (const [what, o] of bads) { if (!ownProblem(o)) fail(`own ${what} accepted`); if (!friendlyProblem({ ...b, own: o })) fail(`arrangement with own ${what} playable`); }
  for (const s of ['', '0.3.80', '0.3.80.70.60.50.55.L.25.7', '0.3.80.70.60.50.55.L.25.7.a.b', '0.3.x.70.60.50.55.L.25.7.n', null, undefined]) if (parseOwn(s)) fail(`parseOwn("${s}") gives a player`);
  const link = friendlyShare(b, ENGINE_PIN.commit), qq = new URLSearchParams(link.split('?')[1]);
  if (!/&o=0\.3\.80\./.test(link) || JSON.stringify(parseOwn(qq.get('o'))) !== JSON.stringify(own)) fail(`share link does not carry the own player: ${link}`);
  if (friendlyShare(plain, ENGINE_PIN.commit).includes('&o=')) fail('a link without an own player carries o');
  const frozen = JSON.stringify(ROSTERS), ros = ownRosters(own, b, ROSTERS);
  if (JSON.stringify(ROSTERS) !== frozen) fail('ownRosters changed the factory rosters');
  if (ros[1] !== ROSTERS[1] || ros[2] !== ROSTERS[2] || ros[0].pit !== ROSTERS[0].pit || ros[0].bat[2] !== ROSTERS[0].bat[2]) fail('ownRosters copied more than the one lineup slot');
  const him = ros[0].bat[3];
  if (him.name !== '小明' || him.pos !== ROSTERS[0].bat[3].pos || him.hand !== 'L' || him.num !== 7) fail(`own batter ${JSON.stringify(him)}`);
  const d = ownBatter(own, 'CF'), raw = [d.con, d.pow, d.eye, d.spd, d.arm];
  if (raw.some(v => !(v > 0.3 && v < 2.2))) fail(`own raw ratings out of range ${raw}`);
  const x = friendlyParam(b), g1 = friendlyOpening(x, engine, ros), g2 = friendlyOpening(x, engine, ownRosters(own, b, ROSTERS)), g0 = friendlyOpening(x, engine);
  if (g1.status !== 'ok' || JSON.stringify(g1.opening.game.stream) !== JSON.stringify(g2.opening.game.stream)) fail('same own link, different game');
  if (JSON.stringify(g1.opening.game.stream) === JSON.stringify(g0.opening.game.stream)) fail('the own player changed nothing');
  if (!g1.opening.game.stream.some(e => JSON.stringify(e).includes('小明'))) fail('the own player never appears in the game');
  if (JSON.stringify(g1.opening.game.stream).includes(ROSTERS[0].bat[3].name)) fail('the replaced batter still plays');
  const asked = [], load = async c => { asked.push(c); return engine; };
  const p1 = await friendlyOpeningAt(x, ENGINE_PIN.commit, load, ros);
  if (p1.status !== 'ok' || JSON.stringify(p1.opening.game.stream) !== JSON.stringify(g1.opening.game.stream)) fail('pinned own play differs');
  const visitor = await myBatter(() => 'pheasants-b1', async () => ({ 'pheasants-b1': { name: '劉立偉', num: 58, age: 30, role: 'B', pos: '2B', hand: 'R', overall: 75, abilities: { con: 56, pow: 70, eye: 90, spd: 46, arm: 82, pot: 76 }, team: 'macaques', tier: 1 } }));
  if (!visitor || visitor.team !== 2 || ownProblem(ownOf(visitor.row, 0, 0))) fail('myBatter / ownOf did not give a playable own player');
  const rowOf = (o) => async () => ({ p: { name: 'n', num: 1, age: 20, role: 'B', pos: 'C', hand: 'R', overall: 50, abilities: { con: 5, pow: 5, eye: 5, spd: 5, arm: 5, pot: 5 }, team: 'owls', tier: 1, ...o } });
  for (const [what, o] of [['pitcher', { role: 'P' }], ['tier 3', { tier: 3 }], ['no team', { team: null }]]) if (await myBatter(() => 'p', rowOf(o))) fail(`myBatter takes a ${what}`);
  if (await myBatter(() => '', rowOf({}))) fail('myBatter without an id');
  if (await myBatter(() => { throw new Error('blocked'); }, rowOf({}))) fail('myBatter with blocked storage');
  if (digest() !== before) fail('own player games changed an official file (rule 24)');
  const own3 = readFileSync(path.join(ROOT, 'league/friendly_own.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''), me3 = readFileSync(path.join(ROOT, 'ui/friendly_me.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  if (/Math\.random|Date\b|fetch\(|localStorage|document\./.test(own3)) fail('league/friendly_own.js uses a clock, randomness, the network, storage or the DOM');
  if (/setItem|removeItem|sendBeacon|method\s*:|ledger|farm_games/.test(me3)) fail('ui/friendly_me.js writes or touches the ledger');
  if (!/friendlyOpeningAt\(xp,q\.get\('e'\),[^;]*,ros\)/.test(play) || !/parseOwn\(op\)/.test(play)) fail('play.html does not play ?o= with the own player');
  if (!/id="ownBox"/.test(page) || !/myBatter/.test(ui) || !/ownOf/.test(ui)) fail('friendly.html / ui/friendly.js has no own player choice');
}

if (bad.length) { console.error('friendly check FAILED:\n - ' + bad.join('\n - ')); process.exit(1); }
console.log('friendly check ok');
