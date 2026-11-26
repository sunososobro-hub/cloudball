/* Season simulation with created players (league/tools/season_sim.mjs, #437). Fails when
 *   - a 二軍 slot is not filled, a 系統 player lacks `system: true` or a fan player carries it, names repeat in a team,
 *   - a fan takes a 系統 slot of another kind, or a promotion changes league/players.js (ROSTERS) or the roster size,
 *   - a promoted batter does not keep the fielding position of the man he replaces,
 *   - a season is not 12 games plus a final of 2 or 3, or one run of two seeded seasons differs byte for byte.
 * Usage: node tests/season_sim.check.mjs */
import assert from 'node:assert/strict';
import { ROSTERS } from '../league/players.js';
import { farmOf, fansFor, promote, playSeason, SLOTS_BAT, SLOTS_PIT, FAN_COUNTS } from '../league/tools/season_sim.mjs';

const before = JSON.stringify(ROSTERS);
for (const fc of [0, ...FAN_COUNTS]) {
  const fans = fansFor(0, fc, []);
  for (let t = 0; t < 4; t++) {
    const farm = farmOf(0, t, fans[t]);
    assert.equal(farm.filter(f => f.kind === 'bat').length, SLOTS_BAT);
    assert.equal(farm.filter(f => f.kind === 'pit').length, SLOTS_PIT);
    assert.equal(new Set(farm.map(f => f.player.name)).size, farm.length, 'names unique in the team');
    for (const f of farm) assert.equal(f.player.system === true, !f.fan, 'system flag is exactly the non-fan');
    assert.equal(farm.filter(f => f.fan && f.kind === 'bat').length, fans[t].bat.length);
  }
}
const farm = [0, 1, 2, 3].flatMap(t => farmOf(0, t, fansFor(0, 20, [])[t]));
const { rosters, went } = promote(farm);
assert.equal(JSON.stringify(ROSTERS), before, 'ROSTERS untouched');
rosters.forEach((r, t) => { assert.equal(r.bat.length, ROSTERS[t].bat.length); assert.equal(r.pit.length, ROSTERS[t].pit.length); });
assert.ok(went.size > 0, 'someone is promoted');
rosters.forEach((r, t) => r.bat.forEach((p, i) => { if (p.promoted) assert.equal(p.pos, ROSTERS[t].bat[i].pos); }));
const run = () => { const b = new Map(), p = new Map(); const boxes = playSeason(0, rosters, b, p); return JSON.stringify([boxes.map(x => x.score), [...b], [...p]]); };
const a = run(), n = playSeason(0, rosters, new Map(), new Map()).length;
assert.ok(n === 14 || n === 15, `season has 12 games and a final of 2 or 3, got ${n}`);
assert.equal(run(), a, 'same seed, same season');
console.log('season_sim.check ok');
