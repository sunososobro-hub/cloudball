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

/* steady state (#565 part 3): a long run keeps the 一軍 (nearly) full and inside the bands read from the sim (seeds 1-4, 30 seasons:
 * avgAge 27.6..29.7, medOvr 65.5..77, over30 0.33..0.57, career 8.9..9.4); the limits below are those bands with a margin */
const long = simulate(start, { seasons: 30, seed: 565 }), seats = Math.max(...long.rows.map(r => r.starters));
assert.ok(long.rows.filter(r => r.season >= 3).every(r => r.starters >= seats - 4), 'the 一軍 stays within 4 of full from season 3 on (sim: 69..72 of 72)');
assert.ok(long.band.avgAge[0] >= 26 && long.band.avgAge[1] <= 31, `一軍 average age band ${long.band.avgAge}`);
assert.ok(long.band.medOvr[0] >= 62 && long.band.medOvr[1] <= 80, `一軍 median overall band ${long.band.medOvr}`);
assert.ok(long.band.over30[0] >= 0.25 && long.band.over30[1] <= 0.65, `share aged 30+ band ${long.band.over30}`);
assert.ok(long.career.mean >= 6 && long.career.mean <= 10, `mean 一軍 career ${long.career.mean} seasons`);
assert.ok(long.rows.some(r => r.signed > 0), 'the 自由市場 is the way back into the 一軍');

const src = read('../league/tools/turnover_sim.mjs');
assert.ok(!/Math\.random|Date\.now|new Date/.test(src), 'no clock, no unseeded randomness');
console.log('turnover_sim.check ok');
