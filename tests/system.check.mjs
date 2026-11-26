/* 系統 players (#437 part 2). Fails when
 *   - the site export drops `system: true` for a 系統 filler, writes it on a player who has none, or changes the bytes for factory players;
 *   - a created row with `player.system === true` loses the flag in mergeCreated, or a fan row gains it;
 *   - a roster card shows the 系統 tag for a filler, or shows it for anyone else (and the name stays escaped);
 *   - placeFan does not replace the first 系統 player of the same kind, replaces a fan or a 一軍 player or the other kind, or changes its input.
 * Usage: node tests/system.check.mjs */
import { buildSite, placeFans, systemSecond } from '../league/tools/site.mjs';
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

/* placeFans (#437 part 5) */
const sec = systemSecond(), t0 = Object.keys(sec)[0], frozen2 = JSON.stringify(sec);
const batFan = mk(31, 'bat').player, pitFan = mk(32, 'pit').player;
if (JSON.stringify(placeFans(sec)) !== frozen2) bad('placeFans with no fans must change nothing');
const placed = placeFans(sec, [{ team: t0, player: batFan }, { team: t0, player: pitFan }]);
const firstBat = sec[t0].find(p => !p.role), firstPit = sec[t0].find(p => p.role);
if (placed[t0].length !== sec[t0].length) bad('a fan must replace a 系統 player, not grow the 二軍');
if (placed[t0].some(p => p.id === firstBat.id) || placed[t0].some(p => p.id === firstPit.id)) bad('the first 系統 player of each kind must be gone');
if (!placed[t0].some(p => p.id === batFan.id) || !placed[t0].some(p => p.id === pitFan.id)) bad('the fans are not on the 二軍');
if (placed[t0].filter(p => p.system === true).length !== sec[t0].length - 2) bad('exactly two 系統 players must be replaced');
const site = buildSite({ second: placed });
if ('system' in site.players[batFan.id] || site.players[batFan.id].tier !== 2) bad('a fan on the site is tier 2 and carries no system flag');
if (JSON.stringify(sec) !== frozen2) bad('placeFans changed its input');
let threw = false; try { placeFans(sec, [{ team: 'nope', player: batFan }]); } catch { threw = true; }
if (!threw) bad('a fan with an unknown team must be an error');
const full = placeFans(sec, Array.from({ length: 5 }, (_, i) => ({ team: t0, player: mk(40 + i, 'bat').player })));
if (full[t0].filter(p => !p.role && p.system === true).length !== 0 || full[t0].length !== sec[t0].length + 2) bad('after the 系統 batters are gone more fans are added');

if (problems.length) { console.error('system check FAILED:\n- ' + problems.join('\n- ')); process.exit(1); }
console.log('system check: ok');
