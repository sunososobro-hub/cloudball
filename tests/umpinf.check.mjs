/* Infield fly (#609 part 3b, plain Node). render/umpinf.js is run, not read, over real engine games:
 *   - a call only for a fair PU / FB caught for the out by an infielder or the catcher, runners on 1st and 2nd (or loaded), < 2 outs; nothing else
 *   - only the one umpire of the call signals; 0 before and after, reaches w 1, stays in 0..1; the right hand goes above the shoulder line
 *   - it ends before the catch (ARRIVE + hang) and before the event does; same input = same output
 * static.mjs runs this file. Usage: node tests/umpinf.check.mjs */
import { simGame, ARRIVE } from '../engine/index.js';
import { infCall, infSignal, infEnd } from '../render/umpinf.js';

const T = { ARRIVE }, problems = [], bad = m => { if (problems.length < 30) problems.push(m); };
const IF = new Set(['P', 'C', '1B', '2B', '3B', 'SS']);
let calls = 0, nots = 0;
for (let seed = 1; seed <= 200; seed++) for (const e of simGame(seed, {}, {}).ev) {
  const p = e.play, c = infCall(e, T);
  const want = e.k === 'P' && e.r === 'inplay' && p && (p.type === 'PU' || p.type === 'FB') && p.res === 'out' && !p.foul && !p.bunt && IF.has(p.fielder)
    && e.s0.outs < 2 && e.s0.b[0] && e.s0.b[1];
  if (!!c !== !!want) { bad(`seed ${seed}: call ${JSON.stringify(c)}, want ${!!want}`); continue; }
  if (!c) { nots++; for (const b of [1, 2, 3, 4]) if (infSignal(e, 1.5, b, T)) bad(`seed ${seed}: a signal for an event with none`); continue; }
  calls++;
  const end = infEnd(e, T);
  if (end > ARRIVE + p.hang + 1e-9) bad(`seed ${seed}: signal ends at ${end.toFixed(2)} s, after the catch at ${(ARRIVE + p.hang).toFixed(2)} s`);
  if (Number.isFinite(e.d) && end > e.d + 1e-9) bad(`seed ${seed}: signal ends after the event`);
  if (![1, 2, 3].includes(c.b)) bad(`seed ${seed}: bad umpire ${c.b}`);
  let max = 0;
  for (let u = 0; u <= end + 1; u += .02) {
    const s = infSignal(e, u, c.b, T), s2 = infSignal(e, u, c.b, T);
    if (JSON.stringify(s) !== JSON.stringify(s2)) bad(`seed ${seed}: not pure at ${u}`);
    for (const b of [1, 2, 3, 4]) if (b !== c.b && infSignal(e, u, b, T)) bad(`seed ${seed}: wrong umpire ${b} signals at ${u}`);
    if (!s) continue;
    if (!(s.w > 0 && s.w <= 1 + 1e-9) || s.arms.length !== 6 || !s.arms.every(Number.isFinite)) bad(`seed ${seed}: bad signal at ${u}`);
    if (u > end + 1e-6) bad(`seed ${seed}: still signalling at ${u} after ${end}`);
    max = Math.max(max, s.w);
    if (s.w > .999 && !(s.arms[1] > 1)) bad(`seed ${seed}: hand not up`);
  }
  if (max < .999) bad(`seed ${seed}: never reaches full (${max})`);
}
if (!calls) bad('no infield fly in 200 games: the check proves nothing');
if (problems.length) { console.error('umpinf check FAILED:\n' + problems.join('\n')); process.exit(1); }
console.log('umpinf check ok', JSON.stringify({ calls, nots }));
