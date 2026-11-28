/* Plate umpire signals (#609 part 1, plain Node). render/umpsig.js is run, not read, over real engine games:
 *   - signalKind: foul / hbp / ci (catcher's interference, #732) / ibb / bk events get their signal, every other event none; both counts are seen
 *   - the signal is 0 before it starts and after it ends, reaches w 1, and never leaves 0..1
 *   - it ends before the event does (e.d), so the umpire is crouched again when the next frame starts
 *   - same input = same output (pure in time: a seek shows what playing there shows)
 *   - hand targets are finite; foul puts both hands above the shoulder line, the point to first goes out to his right (+x)
 * static.mjs runs this file. Usage: node tests/umpsig.check.mjs */
import { simGame, ARRIVE, BK_CALL_AT } from '../engine/index.js';
import { plateSignal, signalKind, signalEnd } from '../render/umpsig.js';

const T = { ARRIVE, BK_CALL_AT }, problems = [], bad = m => { if (problems.length < 30) problems.push(m); };
const seen = { foul: 0, hbp: 0, ibb: 0, bk: 0, fair: 0, ci: 0 };
for (let seed = 1; seed <= 300; seed++) for (const e of simGame(seed, {}, {}).ev) {
  const k = signalKind(e);
  const want = e.k !== 'P' ? null : e.bk ? 'bk' : e.r === 'foul' ? 'foul' : e.r === 'hbp' ? 'hbp' : e.r === 'ci' ? 'ci' : e.r === 'ibb' ? 'ibb' : (e.r === 'inplay' && e.play && !e.play.foul && e.play.res !== 'HR' && e.play.dist < 27.43 && Math.abs(e.play.spray) >= 37 && Math.abs(e.play.spray) <= 45) ? 'fair' : null;
  if (k !== want) { bad(`seed ${seed}: kind ${k}, want ${want}`); continue; }
  if (!k) { if (plateSignal(e, 1, T)) bad(`seed ${seed}: a signal for an event with none`); continue; }
  seen[k]++;
  const end = signalEnd(e, T);
  if (e.d !== undefined && end > e.d) bad(`seed ${seed}: ${k} signal ends at ${end.toFixed(2)} s, after the event (${e.d} s)`);
  let max = 0;
  for (let u = 0; u <= end + 1; u += .02) {
    const s = plateSignal(e, u, T), s2 = plateSignal(e, u, T);
    if (JSON.stringify(s) !== JSON.stringify(s2)) bad(`seed ${seed}: ${k} not pure at ${u}`);
    if (!s) continue;
    if (!(s.w > 0 && s.w <= 1 + 1e-9)) bad(`seed ${seed}: ${k} w ${s.w} at ${u}`);
    if (!s.arms.every(Number.isFinite) || s.arms.length !== 6) bad(`seed ${seed}: ${k} bad arms at ${u}`);
    max = Math.max(max, s.w);
    if (k === 'foul' && !(s.arms[1] > .6 && s.arms[4] > .6)) bad(`seed ${seed}: foul hands not up`);
    if (u > end + 1e-6 && s) bad(`seed ${seed}: ${k} still signalling at ${u} after its end ${end}`);
  }
  if (max < .999) bad(`seed ${seed}: ${k} never reaches full (${max})`);
  if (k === 'fair') { const s = plateSignal(e, ARRIVE + .35 + .25 + .5, T); const i = e.play.spray >= 0 ? 0 : 3; if (!s || !(Math.abs(s.arms[i]) > .7)) bad(`seed ${seed}: fair call does not point to the fair side`); }
  if (k === 'ibb' || k === 'hbp' || k === 'ci') { const s = plateSignal(e, k === 'ibb' ? .4 + .25 + .5 : ARRIVE + .3 + 1.1 + .25 + .5, T); if (!s || !(s.arms[0] > .7)) bad(`seed ${seed}: ${k} does not point out to his right`); }
}
for (const [k, n] of Object.entries(seen)) if (!n) bad(`no ${k} event in 300 games: the check proves nothing for it`);
if (problems.length) { console.error('umpsig check FAILED:\n' + problems.join('\n')); process.exit(1); }
console.log('umpsig check ok', JSON.stringify(seen));
