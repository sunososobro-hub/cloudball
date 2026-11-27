/* Season-end turnover (league/turnover.js, #565 part 1). Fails when
 *   - one seed does not give the same result twice, another seed gives the same rookies, or the input is changed,
 *   - a player at RETIRE_AGE stays, or the culled are not the lowest overall of their position (CULL_PER_POS each) or do not reach 自由市場 (tier 3, team null, still in the data),
 *   - a team's 一軍 + 二軍 count changes, or the 一軍 grows beyond its seats, or a call-up is not a ready 二軍 player of that position,
 *   - a rookie is not code-generated (system, age 18-22, 二軍, unique name, id) or is over his potential,
 *   - league/turnover.js uses Math.random, Date or an import of engine/, DOM or the network.
 * Usage: node tests/turnover.check.mjs */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RETIRE_AGE, slotTemplate, slotPos } from '../league/callup.js';
import { seasonEnd, advanceYear, CULL_PER_POS, FREE_TIER, SECOND_TIER, ROOKIE_AGE, FARM_MAX_AGE } from '../league/turnover.js';

const read = f => readFileSync(new URL(f, import.meta.url), 'utf8');
const players = (await import('../league/tools/site.mjs')).factoryPlayers(), before = JSON.stringify(players);
const aged = advanceYear(players);
assert.equal(JSON.stringify(players), before, 'advanceYear leaves its input alone');
const ids = Object.keys(aged), oldOnes = ids.filter(i => aged[i].tier === 1).slice(0, 3);
for (const i of oldOnes) aged[i].age = RETIRE_AGE;
const input = JSON.stringify(aged);

const r = seasonEnd(aged, { seed: 7 }), again = seasonEnd(aged, { seed: 7 }), other = seasonEnd(aged, { seed: 8 });
assert.equal(JSON.stringify(aged), input, 'seasonEnd leaves its input alone');
assert.equal(JSON.stringify(r), JSON.stringify(again), 'same seed, same turnover');
assert.notDeepEqual(r.rookies.map(i => r.players[i].name), other.rookies.map(i => other.players[i].name), 'another seed, other rookies');

/* retire */
assert.deepEqual([...r.retired].sort(), [...oldOnes].sort());
for (const i of oldOnes) assert.equal(i in r.players, false, 'a retiree is gone');
assert.ok(Object.values(r.players).every(p => p.age < RETIRE_AGE), 'nobody at retirement age stays');

/* cull: lowest overall of each position among those who stay, to the free market, not deleted */
const pos = [...new Set(ids.filter(i => aged[i].tier === 1 && !oldOnes.includes(i)).map(i => slotPos(aged[i])))];
assert.equal(r.culled.length, pos.length * CULL_PER_POS);
for (const p of pos) {
  const pool = ids.filter(i => aged[i].tier === 1 && !oldOnes.includes(i) && slotPos(aged[i]) === p), low = Math.min(...pool.map(i => aged[i].overall));
  const out = r.culled.filter(i => slotPos(aged[i]) === p);
  assert.equal(out.length, CULL_PER_POS);
  for (const i of out) assert.equal(aged[i].overall, low, `${p}: the lowest overall is culled`);
}
for (const i of r.culled) { assert.equal(r.players[i].tier, FREE_TIER); assert.equal(r.players[i].team, null); assert.equal(r.players[i].name, aged[i].name); }

/* roster size per team is constant; 一軍 never above its seats; call-ups are ready 二軍 players of the seat's position */
const count = (pl, team, tier) => Object.values(pl).filter(p => p.team === team && (tier ? p.tier === tier : p.tier <= SECOND_TIER)).length;
const tpl = slotTemplate(players), seats = Object.values(tpl).reduce((a, b) => a + b, 0);
for (const t of new Set(Object.values(players).map(p => p.team))) {
  assert.equal(count(r.players, t), count(aged, t), `${t} keeps its roster size`);
  assert.ok(count(r.players, t, 1) <= seats, `${t} 一軍 within its seats`);
}
for (const c of r.called) {
  assert.equal(aged[c.id].tier, SECOND_TIER); assert.equal(slotPos(aged[c.id]), c.pos);
  assert.equal(r.players[c.id].tier, 1); assert.equal(r.players[c.id].team, c.team);
}
for (const w of r.waiting) assert.ok(r.players[w.id].waited > 0 && r.players[w.id].tier === SECOND_TIER, 'a waiting player gains waited days');

/* rookies */
assert.equal(r.rookies.length, r.retired.length + r.culled.length, 'each leaver is replaced by one rookie');
const names = Object.values(r.players).map(p => p.name);
for (const i of r.rookies) {
  const p = r.players[i];
  assert.ok(!(i in aged), 'new id'); assert.equal(p.tier, SECOND_TIER); assert.equal(p.system, true);
  assert.ok(p.age >= ROOKIE_AGE[0] && p.age <= ROOKIE_AGE[1], 'rookie age');
  assert.ok(p.abilities.pot >= p.overall, 'nobody over potential');
}
assert.equal(new Set(names).size, names.length, 'names stay unique');

/* purity */
const src = read('../league/turnover.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\*.*?\*\//g, '');
assert.ok(!/Math\.random|Date\b|document|window|fetch\(|from '\.\.\/engine/.test(src), 'pure: no clock, RNG, DOM, network or engine');
/* market and farm release (#565 part 3): every seat the call-up left open is signed from the 自由市場 (nobody culled this season), old 二軍 go to the market */
assert.ok(r.signed.every(c => r.players[c.id].tier === 1 && r.players[c.id].team === c.team && !r.culled.includes(c.id)), 'signed players are in the 一軍 and were not culled this season');
for (const i of r.released) assert.ok(aged[i].tier === SECOND_TIER && aged[i].age >= FARM_MAX_AGE && r.players[i].tier === FREE_TIER && r.players[i].team === null, 'a released 二軍 player is on the market');
assert.ok(Object.values(r.players).every(p => p.tier !== SECOND_TIER || p.age < FARM_MAX_AGE), 'nobody old is left in the 二軍');
console.log(`turnover ok: retired ${r.retired.length}, culled ${r.culled.length}, called ${r.called.length}, rookies ${r.rookies.length}`);
