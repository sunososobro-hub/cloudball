/* Plate umpire time / play (#609 part 3a, plain Node). render/umptime.js is run, not read, over real engine games:
 *   - time on every VOTE / CHG / VIS / SUB frame, play only on a non-balk, non-ibb pitch frame right after one; nothing else
 *   - the signal is 0 before it starts and after it ends, reaches w 1, never leaves 0..1, and ends before the frame does
 *   - same input = same output; hands are finite; time puts both hands above the shoulder line, play points straight ahead
 * static.mjs runs this file. Usage: node tests/umptime.check.mjs */
import { simGame } from '../engine/index.js';
import { timeCall, timeSignal, timeEnd, TIME_KINDS } from '../render/umptime.js';

const problems = [], bad = m => { if (problems.length < 30) problems.push(m); }, seen = { time: 0, play: 0 };
for (let seed = 1; seed <= 60; seed++) {
  const ev = simGame(seed, {}, {}).ev;
  ev.forEach((e, i) => {
    const prev = i ? ev[i - 1] : null, c = timeCall(e, prev);
    const want = TIME_KINDS.has(e.k) ? 'time' : e.k === 'P' && !e.bk && e.r !== 'ibb' && prev && TIME_KINDS.has(prev.k) ? 'play' : null;
    if ((c ? c.kind : null) !== want) return bad(`seed ${seed} #${i}: kind ${c && c.kind}, want ${want}`);
    if (!c) { if (timeSignal(e, prev, 1)) bad(`seed ${seed} #${i}: a signal for a frame with none`); return; }
    seen[c.kind]++;
    const end = timeEnd(e, prev);
    if (Number.isFinite(e.d) && end > e.d + 1e-9) bad(`seed ${seed} #${i}: ${c.kind} ends at ${end.toFixed(2)} s, after the frame (${e.d} s)`);
    let max = 0;
    for (let u = 0; u <= end + 1; u += .02) {
      const s = timeSignal(e, prev, u), s2 = timeSignal(e, prev, u);
      if (JSON.stringify(s) !== JSON.stringify(s2)) bad(`seed ${seed} #${i}: not pure at ${u}`);
      if (!s) continue;
      if (!(s.w > 0 && s.w <= 1 + 1e-9) || s.arms.length !== 6 || !s.arms.every(Number.isFinite)) bad(`seed ${seed} #${i}: bad signal at ${u}`);
      if (u > end + 1e-6) bad(`seed ${seed} #${i}: still signalling at ${u} after its end ${end}`);
      if (c.kind === 'time' && !(s.arms[1] > .6 && s.arms[4] > .6)) bad(`seed ${seed} #${i}: time hands not up`);
      if (c.kind === 'play' && !(s.arms[2] > .8)) bad(`seed ${seed} #${i}: play does not point ahead`);
      max = Math.max(max, s.w);
    }
    if (max < .999) bad(`seed ${seed} #${i}: ${c.kind} never reaches full (${max})`);
  });
}
for (const [k, n] of Object.entries(seen)) if (!n) bad(`no ${k} frame in 60 games: the check proves nothing for it`);
if (problems.length) { console.error('umptime check FAILED:\n' + problems.join('\n')); process.exit(1); }
console.log('umptime check ok', JSON.stringify(seen));
