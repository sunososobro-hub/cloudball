/* Obstruction lane (#841 part 2, plain Node). render/obslane.js is run over real engine games:
 *   - nothing for a play without play.obstruction (stand 0, lag 0); same input = same output
 *   - stand stays in 0..1, is 1 when the batter reaches first, and 0 again well after he has second
 *   - lag stays in 0..OBS_LAG, is 0 until first base and from arriveT on (the batter is on time), peaks at OBS_LAG
 *   - the batter's clock u - lag never runs backwards (he slows, he does not step back)
 * static.mjs runs this file. Usage: node tests/obslane.check.mjs */
import { simGame, runTime, BASE_PATH } from '../engine/index.js';
import { obsCall } from '../render/umpobs.js';
import { obsStand, obsLag, OBS_LAG, OBS_BACK } from '../render/obslane.js';

const T = { runTime, BASE_PATH }, problems = [], bad = m => { if (problems.length < 30) problems.push(m); };
let plays = 0, others = 0;
for (let seed = 1; seed <= 700; seed++) for (const e of simGame(seed, {}, { teams: [seed % 4, (seed + 1) % 4] }).ev) {
  const c = obsCall(e, T);
  if (!c) { others++; if (e.k === 'P' && (obsStand(e, 3, T) !== 0 || obsLag(e, 3, T) !== 0)) bad(`seed ${seed}: lane for a play with none`); continue; }
  plays++;
  const end = e.moves.find(m => m[0] === 0 && m[1] === 2)[3].arriveT;
  let max = 0, prev = -Infinity;
  for (let u = 0; u <= end + OBS_BACK + 1; u += .01) {
    const k = obsStand(e, u, T), l = obsLag(e, u, T);
    if (k !== obsStand(e, u, T) || l !== obsLag(e, u, T)) bad(`seed ${seed}: not pure at ${u}`);
    if (!(k >= 0 && k <= 1) || !(l >= 0 && l <= OBS_LAG + 1e-9)) bad(`seed ${seed}: out of range at ${u}: ${k} ${l}`);
    if (u <= c.at && l !== 0) bad(`seed ${seed}: lag ${l} before first base`);
    if (u >= end && l !== 0) bad(`seed ${seed}: lag ${l} at second (${end})`);
    if (u >= c.at && u <= end && k < 1 - 1e-9 && u >= c.at) bad(`seed ${seed}: first baseman not in the lane at ${u}`);
    if (u > end + OBS_BACK + 1e-6 && k !== 0) bad(`seed ${seed}: still in the lane at ${u}`);
    const clock = u - l;
    if (clock < prev - 1e-9) bad(`seed ${seed}: batter's clock runs back at ${u}`);
    prev = clock; max = Math.max(max, l);
  }
  if (max < OBS_LAG - 1e-3) bad(`seed ${seed}: never slows (${max})`);
}
if (!plays) bad('no obstruction play in 700 games: the check proves nothing');
if (problems.length) { console.error('obslane check FAILED:\n' + problems.join('\n')); process.exit(1); }
console.log('obslane check ok', JSON.stringify({ plays, others }));
