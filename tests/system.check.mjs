/* Guard for 系統 players (league/system.js, #437 part 2). Fails when
 *   - a fan does not take the place of a 系統 player of his own kind (weakest first), or the pool changes size;
 *   - a non-系統 player (factory 一軍, another fan) is ever removed;
 *   - site.mjs drops `system: true` or writes it on a real player, or the data site card shows no 系統 tag / shows one on a real player;
 *   - mergeCreated loses the flag.
 * Usage: node tests/system.check.mjs */
import { placeFans, isSystem } from '../league/system.js';
import { buildSite, validateSite } from '../league/tools/site.mjs';
import { rosterCards, mergeCreated } from '../ui/site/shared.js';

const problems = [], bad = m => problems.push(m);
const e = (id, kind, ovr, system) => ({ kind, ratings: { ovr }, player: { id, ...(system ? { system: true } : {}) } });
const pool = [e('f1', 'bat', 70), e('s1', 'bat', 40, true), e('s2', 'bat', 30, true), e('s3', 'pit', 50, true), e('s4', 'bat', 30, true)];
const before = JSON.stringify(pool);
let r = placeFans(pool, [e('n1', 'bat', 60), e('n2', 'bat', 55)]);
if (JSON.stringify(pool) !== before) bad('placeFans changed its input');
if (r.pool.length !== pool.length) bad('pool size changed when 系統 players were available');
if (r.replaced.join() !== 's2,s4') bad(`weakest 系統 batters should go first (s2 then s4), got ${r.replaced}`);
if (!r.pool.some(x => x.player.id === 'f1') || !r.pool.some(x => x.player.id === 's3')) bad('a non-系統 player or a 系統 player of the other kind was removed');
r = placeFans(pool, [e('p1', 'pit', 60), e('p2', 'pit', 60)]);
if (r.replaced.join() !== 's3' || r.pool.length !== pool.length + 1) bad('the second fan pitcher has no 系統 pitcher left and must be added');
r = placeFans([e('f1', 'bat', 70)], [e('n1', 'bat', 60)]);
if (r.replaced.length || r.pool.length !== 2 || !r.pool.some(x => x.player.id === 'f1')) bad('a factory player must never be replaced');
if (!isSystem({ system: true }) || isSystem({ system: 1 }) || isSystem({})) bad('isSystem must be exactly system === true');

/* data site: the flag survives export and shows as a tag, a real player shows none */
const rate = p => ({ ovr: 50, con: 50, pow: 50, eye: 50, spd: 50, arm: 50 });
const real = { id: 'r1', name: '真人', num: 1, age: 20, pos: 'CF', hand: 'R' }, sys = { id: 's1', name: '系統甲', num: 2, age: 20, pos: 'CF', hand: 'R', system: true };
const site = buildSite({ rate, free: [real, sys] });
if (site.players.s1.system !== true) bad('site.mjs dropped system: true');
if ('system' in site.players.r1) bad('site.mjs wrote system on a real player');
if (validateSite(site).length) bad('validateSite rejects a valid site: ' + validateSite(site).join('; '));
const flagged = buildSite({ rate, free: [real] }); flagged.players.r1.system = false;
if (!validateSite(flagged).some(m => m.includes('system'))) bad('validateSite must reject system: false');
const html = rosterCards(Object.entries(site.players), { base: '#fa', filter: 'all' });
const tags = (html.match(/class="sys"/g) || []).length;
if (tags !== 1 || !/系統甲[^]*?class="sys"/.test(html)) bad(`expected exactly one 系統 tag, on the 系統 player (got ${tags})`);
const merged = mergeCreated({ players: {} }, [{ id: 'c1', kind: 'bat', player: { ...sys, id: 'c1' }, ratings: { ovr: 40, con: 40 } }, { id: 'c2', kind: 'bat', player: { ...real, id: 'c2' }, ratings: { ovr: 40, con: 40 } }]);
if (merged.players.c1.system !== true || 'system' in merged.players.c2) bad('mergeCreated must carry system: true and only that');

if (problems.length) { console.error('system.check FAILED:\n - ' + problems.join('\n - ')); process.exit(1); }
console.log('system.check ok');
