/* #612 part 1: the dugout rail (plain Node, render/rail.js is run). Checks: both dugouts' slots stand inside the dugout footprint (14 x 1.7 m)
 * facing the field; over real engine games a clap starts at the first scoring arrival and ends RAIL_CLAP_HOLD after the last, with weight 0..1
 * and no jump; no scorer, no clap; pure in time; game.js builds the rail. static.mjs runs this file. Usage: node tests/rail.check.mjs */
import { readFileSync } from 'node:fs';
import { simGame } from '../engine/index.js';
import { RAIL_N, RAIL_X, RAIL_Z, RAIL_CLAP_HOLD, RAIL_RAMP, railSlot, scoreTimes, clapAt, handsAt } from '../render/rail.js';
const bad = [], B = m => { if (bad.length < 30) bad.push(m); };
const dugout = t => [(t === 0 ? 1 : -1) * 26, -6];
for (const t of [0, 1]) for (let i = 0; i < RAIL_N; i++) {
  const d = dugout(t), s = railSlot(d, i), th = Math.sign(d[0]) * Math.PI / 4;
  const lx = (s.x - d[0]) * Math.cos(th) - (s.z - d[1]) * Math.sin(th), lz = (s.x - d[0]) * Math.sin(th) + (s.z - d[1]) * Math.cos(th);
  if (Math.abs(lx - RAIL_X[i]) > 1e-9 || Math.abs(lz - RAIL_Z) > 1e-9) B(`team ${t} slot ${i}: not at the rail (${lx}, ${lz})`);
  if (Math.abs(lx) > 6.5 || lz < 0 || lz > 1.7) B(`team ${t} slot ${i}: outside the dugout`);
  if (Math.abs(Math.hypot(s.fx, s.fz) - 1) > 1e-9) B('facing not a unit vector');

}
let scorers = 0, claps = 0, quiet = 0;
for (let seed = 1; seed <= 20; seed++) for (const e of simGame(seed, {}, {}).ev) {
  const arr = scoreTimes(e);
  if (!arr.length) { quiet++; if (clapAt(arr, 1).w !== 0) B('clap without a scorer'); continue; }
  scorers++; const a = Math.min(...arr), b = Math.max(...arr) + RAIL_CLAP_HOLD;
  if (clapAt(arr, a - .01).w !== 0 && a - .01 >= a - RAIL_RAMP) B('claps before the first arrival: ' + clapAt(arr, a - .01).w);
  if (clapAt(arr, a - 1).w !== 0 || clapAt(arr, b + 1).w !== 0) B('clap outside its window');
  const mid = clapAt(arr, (a + b) / 2); if (mid.w !== 1) B('no full clap mid-window'); else claps++;
  let prev = 0; for (let u = a - .5; u <= b + .5; u += .02) { const w = clapAt(arr, u).w; if (w < 0 || w > 1) B('weight outside 0..1'); if (Math.abs(w - prev) > .02 / RAIL_RAMP + 1e-9) B('weight jumps'); prev = w }
  if (JSON.stringify(clapAt(arr, a + .7)) !== JSON.stringify(clapAt(arr, a + .7))) B('not pure');
}
if (!scorers) B('no scoring event in 20 games: the check saw nothing');
for (const lean of [true, false]) { const s = { lean }, c = handsAt(s, 1, 0), r = handsAt(s, 0, 0);
  if (!c || c.some(v => !Number.isFinite(v))) B('bad clap hands');
  if (lean && !r) B('a leaning player has no rail pose'); if (!lean && r) B('a standing player should keep the default arms') }
if (!/from '\.\.\/render\/rail\.js'|rail\.js/.test(readFileSync(new URL('../render/game.js', import.meta.url), 'utf8'))) B('game.js does not load rail.js');
if (bad.length) { console.error('rail.check FAILED\n' + bad.join('\n')); process.exit(1) }
console.log(`rail.check ok (2 dugouts x ${RAIL_N} slots, ${scorers} scoring events clap, ${quiet} quiet)`);
