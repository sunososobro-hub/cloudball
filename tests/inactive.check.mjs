/* Inactive fans (league/inactive.js, #628). Fails when
 *   - a fan seen 29 days ago loses his player, or one seen 30 days ago keeps him,
 *   - a released player loses his ratings or age, is not tier 3 / team null / ownerless, or opens no seat for league/callup.js,
 *   - reclaim is wrong: old owner at day 59 yes and a stranger no; anyone at day 61,
 *   - a fan with no lastSeen is not counted from his created day,
 *   - the function changes its input, is not a no-op on an all-系統 league, or uses Math.random / Date / network.
 * Usage: node tests/inactive.check.mjs */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INACTIVE_DAYS, RECLAIM_DAYS, releaseInactive, canClaim } from '../league/inactive.js';
import { openSlots } from '../league/callup.js';

const mk = (id, o) => ({ id, team: 'A', tier: 1, pos: 'SS', age: 25, overall: 70, ratings: { bat: 70 }, created: 0, ...o });
const league = () => ({
  f29: mk('f29', { owner: 'u29' }), f30: mk('f30', { owner: 'u30' }), f59: mk('f59', { owner: 'u59', tier: 2 }),
  none: mk('none', { owner: 'unseen', created: 0 }), sys: mk('sys', { system: true }), base: mk('base'),
});
const lastSeen = { u29: 31, u30: 30, u59: 0 };   /* today = 60 */
assert.equal(INACTIVE_DAYS, 30); assert.equal(RECLAIM_DAYS, 30);

const input = league(), snap = JSON.stringify(input);
const r = releaseInactive(input, { today: 60, lastSeen });
assert.equal(JSON.stringify(input), snap, 'input is never mutated');
assert.deepEqual(r.released, ['f30', 'f59', 'none'].sort(), 'day 29 untouched; day 30, 60 and no-lastSeen (created 0) released');
assert.equal(r.players.f29.owner, 'u29', 'seen 29 days ago: untouched');
assert.deepEqual(r.players.sys, input.sys); assert.deepEqual(r.players.base, input.base);

const f = r.players.f30;
assert.equal(f.owner, undefined); assert.equal(f.tier, 3); assert.equal(f.team, null);
assert.equal(f.age, 25); assert.equal(f.overall, 70); assert.deepEqual(f.ratings, { bat: 70 }, 'ratings and age stay');
assert.equal(f.former, 'u30'); assert.equal(f.releasedOn, 60);
assert.equal(r.players.f59.tier, 3, 'a 二軍 player is released too');

/* the 一軍 seat goes back through the call-up rules */
const full = { a1: mk('a1'), a2: mk('a2', { owner: 'x', pos: '1B' }), b1: mk('b1', { team: 'B' }), b2: mk('b2', { team: 'B', pos: '1B' }) };
const freed = releaseInactive(full, { today: 40, lastSeen: { x: 0 } }).players;
assert.deepEqual(openSlots(freed), [{ team: 'A', pos: '1B' }], 'his seat is open for league/callup.js');

/* reclaim: released on day 30 */
const rel = releaseInactive({ p: mk('p', { owner: 'old' }) }, { today: 30, lastSeen: { old: 0 } }).players.p;
assert.equal(canClaim(rel, 'old', 59), true, 'day 59: the old owner can');
assert.equal(canClaim(rel, 'other', 59), false, 'day 59: a stranger cannot');
assert.equal(canClaim(rel, 'other', 60), true); assert.equal(canClaim(rel, 'other', 61), true, 'day 61: anyone');
assert.equal(canClaim(mk('q', { owner: 'z' }), 'z', 99), false, 'an owned player is not claimable');

/* an array in gives an array out; all-系統 league: no-op; same input = same output */
assert.ok(Array.isArray(releaseInactive(Object.values(league()), { today: 60, lastSeen }).players));
const sysOnly = { s1: mk('s1', { system: true }), s2: mk('s2', { system: true, tier: 2 }) };
const n = releaseInactive(sysOnly, { today: 9999 });
assert.deepEqual(n.players, sysOnly); assert.deepEqual(n.released, []);
assert.deepEqual(releaseInactive(league(), { today: 60, lastSeen }), r, 'same input = same output');

const src = readFileSync(new URL('../league/inactive.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
assert.ok(!/Math\.random|Date|fetch\(|import\s.*engine/.test(src), 'pure: no random, clock, network or engine import');
console.log('inactive.check ok');
