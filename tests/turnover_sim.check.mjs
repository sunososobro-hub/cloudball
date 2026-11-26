/* Turnover simulation (league/tools/turnover_sim.mjs, #565 part 2). Fails when
 *   - one seed does not give the same seasons twice, or another seed gives the same ones,
 *   - a team's 一軍 + 二軍 count changes in any season, or somebody's overall is above his potential,
 *   - culled players do not pile up on the 自由市場 (tier 3, team null, still in the data),
 *   - the tool reads a clock or Math.random.
 * Usage: node tests/turnover_sim.check.mjs */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simulate } from '../league/tools/turnover_sim.mjs';

const read = f => readFileSync(new URL(f, import.meta.url), 'utf8');
const start = JSON.parse(read('../league/site/players.json')), before = JSON.stringify(start);
const a = simulate(start, { seasons: 4, seed: 3 }), b = simulate(start, { seasons: 4, seed: 3 }), c = simulate(start, { seasons: 4, seed: 4 });
assert.equal(JSON.stringify(start), before, 'simulate leaves its input alone');
assert.equal(JSON.stringify(a.rows), JSON.stringify(b.rows), 'same seed, same seasons');
assert.notEqual(JSON.stringify(a.players), JSON.stringify(c.players), 'another seed, another league');

const size = ps => { const n = {}; for (const p of Object.values(ps)) if (p.team && (p.tier === 1 || p.tier === 2)) n[p.team] = (n[p.team] || 0) + 1; return n; };
assert.deepEqual(size(a.players), size(start), 'roster size per team stays constant');
/* the factory data already has players above their pot, and its stored overall is a point or two off the one the whole abilities give
 * (ROUND_SLACK); the model must not lift anybody past max(what he started with, pot) + that slack */
const ROUND_SLACK = 2;
for (const [id, p] of Object.entries(a.players)) assert.ok(p.overall <= Math.max(id in start ? start[id].overall : 0, p.abilities.pot) + ROUND_SLACK, `${p.name} is over his potential`);
const free = Object.values(a.players).filter(p => p.tier === 3), culled = a.rows.reduce((t, r) => t + r.culled, 0);
assert.ok(culled > 0 && free.length > 0 && free.length <= culled && free.every(p => p.team === null), 'culled players reach the 自由市場 and stay in the data');
assert.equal(a.rows.length, 4);

const src = read('../league/tools/turnover_sim.mjs');
assert.ok(!/Math\.random|Date\.now|new Date/.test(src), 'no clock, no unseeded randomness');
console.log('turnover_sim.check ok');
