/* 系統 players (#437 part 2). Fails when
 *   - the site export drops `system: true` for a 系統 filler, writes it on a player who has none, or changes the bytes for factory players;
 *   - a created row with `player.system === true` loses the flag in mergeCreated, or a fan row gains it;
 *   - a roster card shows the 系統 tag for a filler, or shows it for anyone else (and the name stays escaped);
 *   - placeFan does not replace the first 系統 player of the same kind, replaces a fan or a 一軍 player or the other kind, or changes its input.
 * Usage: node tests/system.check.mjs */
import { buildSite } from '../league/tools/site.mjs';
import { makePlayer, placeFan, CREATE } from '../league/freeagents.js';
import { mergeCreated, rosterCards } from '../ui/site/shared.js';

const problems = [], bad = m => problems.push(m);
const mk = (seed, kind, extra = {}) => {
  const keys = CREATE.keys[kind], per = CREATE.budget[kind] / keys.length;
  const c = kind === 'bat' ? { kind, pos: 'LF', bats: 'R', build: 'normal', look: { head: 0, skin: 0, hair: 0 }, points: Object.fromEntries(keys.map(k => [k, per])) }
    : { kind, role: 'SP', throws: 'R', build: 'normal', look: { head: 0, skin: 0, hair: 0 }, points: Object.fromEntries(keys.map(k => [k, per])) };
  const m = makePlayer(seed, c);
  return { id: m.player.id, kind, player: { ...m.player, ...extra }, ratings: m.ratings };
};
const sys = mk(11, 'bat', { system: true }), fan = mk(12, 'bat'), sysP = mk(13, 'pit', { system: true });

/* export */
const plain = buildSite(), withSecond = buildSite({ second: { [plain.teams.teams[0].id]: [sys.player, fan.player] }, free: [sysP.player] });
if (Object.values(plain.players).some(p => 'system' in p)) bad('a factory player must carry no system field');
if (withSecond.players[sys.id].system !== true) bad('the 系統 filler lost system:true in the export');
if ('system' in withSecond.players[fan.id]) bad('a fan player must carry no system field');
if (withSecond.players[sysP.id].system !== true) bad('a free 系統 pitcher lost system:true');

/* ui */
const d = { teams: [], games: [], players: {} };
const merged = mergeCreated(d, [sys, fan, mk(14, 'bat', { system: 'yes' })]).players;
if (merged[sys.id].system !== true) bad('mergeCreated dropped system:true');
if ('system' in merged[fan.id]) bad('mergeCreated gave a fan player the system flag');
if ('system' in merged['fa-' + (14).toString(36)]) bad('only system === true counts as 系統');
const html = id => rosterCards([[id, merged[id]]], { base: '#fa', filter: 'all' });
if (!html(sys.id).includes('>系統<')) bad('the 系統 card shows no 系統 tag');
if (html(fan.id).includes('系統')) bad('a fan card shows the 系統 tag');
const evil = rosterCards([['x', { ...merged[sys.id], name: '<b>x</b>' }]], { base: '#fa', filter: 'all' });
if (evil.includes('<b>x</b>')) bad('the name is not escaped next to the tag');

/* a fan row removes one published 系統 二軍 player of his kind (#437 part 5), nothing else */
{ const site = { teams: [], games: [], players: {
    f1: { name: 'F', role: 'B', pos: 'SS', tier: 1, team: 't' }, s1: { name: 'S1', role: 'B', pos: 'LF', tier: 2, team: 't', system: true },
    s2: { name: 'S2', role: 'B', pos: 'LF', tier: 2, team: 't', system: true }, sp: { name: 'SP', role: 'P', pos: 'SP', tier: 2, team: 't', system: true } } };
  const m1 = mergeCreated(site, [fan]).players;
  if ('s1' in m1 || !('s2' in m1) || !('sp' in m1) || !('f1' in m1)) bad('a batting fan must remove exactly the first 系統 二軍 batter');
  if (!(fan.id in m1)) bad('the fan row must still be listed');
  const m2 = mergeCreated(site, [fan, mk(15, 'bat'), mk(16, 'bat')]).players;
  if (['s1', 's2'].some(k => k in m2) || !('f1' in m2) || !('sp' in m2)) bad('three fans: both 系統 batters go, the factory player and the pitcher stay');
  if (!('sp' in mergeCreated(site, [sys]).players) || !('s1' in mergeCreated(site, [sys]).players)) bad('a 系統 row must not remove a published 系統 player');
  const m3 = mergeCreated(site, [mk(17, 'pit')]).players;
  if ('sp' in m3 || !('s1' in m3)) bad('a pitching fan removes the 系統 pitcher only');
  if (!('s1' in site.players && 's2' in site.players && 'sp' in site.players)) bad('mergeCreated changed its input'); }

/* placeFan */
const pool = [fan, sys, sysP, { id: 'first', kind: 'bat', player: { name: '一軍' } }], frozen = JSON.stringify(pool);
const r1 = placeFan(pool, mk(21, 'bat'));
if (r1.replaced !== sys.id || r1.pool.length !== pool.length || r1.pool.some(x => x.id === sys.id)) bad('a bat fan must replace the 系統 batter');
if (!r1.pool.some(x => x.id === fan.id) || !r1.pool.some(x => x.id === 'first') || !r1.pool.some(x => x.id === sysP.id)) bad('placeFan removed a fan, a 一軍 player or the other kind');
const r2 = placeFan(pool, mk(22, 'pit'));
if (r2.replaced !== sysP.id) bad('a pitcher fan must replace the 系統 pitcher');
const r3 = placeFan(r1.pool, mk(23, 'bat'));
if (r3.replaced !== null || r3.pool.length !== r1.pool.length + 1) bad('no 系統 batter left: the fan is added and nobody is replaced');
if (JSON.stringify(pool) !== frozen) bad('placeFan changed its input');

if (problems.length) { console.error('system check FAILED:\n- ' + problems.join('\n- ')); process.exit(1); }
console.log('system check: ok');
