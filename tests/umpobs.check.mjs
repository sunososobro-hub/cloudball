/* Obstruction signal (#841 part 1, plain Node). render/umpobs.js is run, not read, over real engine games:
 *   - a call exactly on an obstruction play (play.obstruction), by umpire 1 only; nothing for any other play
 *   - 0 before the batter reaches first, reaches w 1, stays in 0..1, the right hand points out level, ends before the event does
 *   - it starts at the batter's first-base arrival and the arm is still out when he is at second less the lowering; same input = same output
 * static.mjs runs this file. Usage: node tests/umpobs.check.mjs */
import { simGame, ARRIVE, runTime, BASE_PATH } from '../engine/index.js';
import { obsCall, obsSignal, obsEnd } from '../render/umpobs.js';

const T = { ARRIVE, runTime, BASE_PATH }, problems = [], bad = m => { if (problems.length < 30) problems.push(m); };
let calls = 0, nots = 0;
for (let seed = 1; seed <= 700; seed++) for (const e of simGame(seed, {}, { teams: [seed % 4, (seed + 1) % 4] }).ev) {
  const c = obsCall(e, T), want = e.k === 'P' && !!e.play && e.play.obstruction === true;
  if (!!c !== want) { bad(`seed ${seed}: call ${JSON.stringify(c)}, want ${want}`); continue; }
  if (!c) { nots++; for (const b of [1, 2, 3, 4]) if (obsSignal(e, 5, b, T)) bad(`seed ${seed}: a signal for a play with none`); continue; }
  calls++;
  const end = obsEnd(e, T), tl = e.moves.find(m => m[0] === 0 && m[1] === 2)[3];
  if (c.b !== 1) bad(`seed ${seed}: umpire ${c.b}, want 1`);
  if (!(c.at > tl.st0 && c.at < tl.arriveT)) bad(`seed ${seed}: first base at ${c.at} outside his run ${tl.st0}..${tl.arriveT}`);
  if (Number.isFinite(e.d) && end > e.d + 1e-9) bad(`seed ${seed}: signal ends at ${end} after the event ${e.d}`);
  let max = 0;
  for (let u = 0; u <= end + 1; u += .02) {
    const s = obsSignal(e, u, 1, T);
    if (JSON.stringify(s) !== JSON.stringify(obsSignal(e, u, 1, T))) bad(`seed ${seed}: not pure at ${u}`);
    for (const b of [2, 3, 4]) if (obsSignal(e, u, b, T)) bad(`seed ${seed}: wrong umpire ${b} signals at ${u}`);
    if (u < c.at - 1e-9 && s) bad(`seed ${seed}: signal at ${u} before first base ${c.at}`);
    if (!s) continue;
    if (!(s.w > 0 && s.w <= 1 + 1e-9) || s.arms.length !== 6 || !s.arms.every(Number.isFinite)) bad(`seed ${seed}: bad signal at ${u}`);
    if (u > end + 1e-6) bad(`seed ${seed}: still signalling at ${u} after ${end}`);
    max = Math.max(max, s.w);
  }
  if (max < .999) bad(`seed ${seed}: never reaches full (${max})`);
}
if (!calls) bad('no obstruction play in 700 games: the check proves nothing');
if (problems.length) { console.error('umpobs check FAILED:\n' + problems.join('\n')); process.exit(1); }
console.log('umpobs check ok', JSON.stringify({ calls, nots }));
