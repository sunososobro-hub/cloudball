/* Ground-rule double signal (#718 part 3, plain Node). render/umpgrd.js is run over real engine games, seeds 1-200:
 *   - a call exactly for a `play.groundRule` event; nothing else signals; only the one line umpire (U1 right, U3 left) signals
 *   - it starts after the ball has landed (ARRIVE + hang), ends before the event does, reaches w 1, stays in 0..1
 *   - both hands go above the shoulder line; same input = same output
 * static.mjs runs this file. Usage: node tests/umpgrd.check.mjs */
import { simGame, ARRIVE } from '../engine/index.js';
import { grdCall, grdSignal, grdEnd } from '../render/umpgrd.js';

const T = { ARRIVE }, problems = [], bad = m => { if (problems.length < 30) problems.push(m); };
let calls = 0, nots = 0;
for (let seed = 1; seed <= 200; seed++) for (const e of simGame(seed, {}, {}).ev) {
  const p = e.play, c = grdCall(e, T), want = e.k === 'P' && e.r === 'inplay' && !!p && !!p.groundRule;
  if (!!c !== want) { bad(`seed ${seed}: call ${JSON.stringify(c)}, want ${want}`); continue; }
  if (!c) { nots++; for (const b of [1, 2, 3, 4]) if (grdSignal(e, 5, b, T)) bad(`seed ${seed}: a signal for an event with none`); continue; }
  calls++;
  const end = grdEnd(e, T);
  if (c.at < ARRIVE + p.hang) bad(`seed ${seed}: signal starts before the landing`);
  if (Number.isFinite(e.d) && end > e.d + 1e-9) bad(`seed ${seed}: signal ends at ${end.toFixed(2)} s, after the event (${e.d.toFixed(2)} s)`);
  if (c.b !== (p.spray < 0 ? 3 : 1)) bad(`seed ${seed}: wrong umpire ${c.b} for spray ${p.spray}`);
  let max = 0;
  for (let u = 0; u <= end + 1; u += .02) {
    const s = grdSignal(e, u, c.b, T);
    if (JSON.stringify(s) !== JSON.stringify(grdSignal(e, u, c.b, T))) bad(`seed ${seed}: not pure at ${u}`);
    for (const b of [1, 2, 3, 4]) if (b !== c.b && grdSignal(e, u, b, T)) bad(`seed ${seed}: wrong umpire ${b} signals at ${u}`);
    if (!s) continue;
    if (!(s.w > 0 && s.w <= 1 + 1e-9) || s.arms.length !== 6 || !s.arms.every(Number.isFinite)) bad(`seed ${seed}: bad signal at ${u}`);
    if (u < c.at - 1e-9 || u > end + 1e-6) bad(`seed ${seed}: signalling outside ${c.at}..${end} at ${u}`);
    max = Math.max(max, s.w);
    if (s.w > .999 && !(s.arms[1] > 1 && s.arms[4] > 1)) bad(`seed ${seed}: hands not both up`);
  }
  if (max < .999) bad(`seed ${seed}: never reaches full (${max})`);
}
if (calls < 10) bad(`only ${calls} ground-rule doubles in 200 games: the check proves nothing`);
if (problems.length) { console.error('umpgrd check FAILED:\n' + problems.join('\n')); process.exit(1); }
console.log('umpgrd check ok', JSON.stringify({ calls, nots }));
