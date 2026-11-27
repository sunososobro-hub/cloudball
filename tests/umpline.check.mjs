/* Line umpire signals (#609 part 2, plain Node). render/umpline.js is run, not read, over real engine games:
 *   - lineCall: foul events by foulDir side, caught foul flies by 1B / RF (U1) and 3B / LF (U3) an out call after the catch (#620 part 2), home runs by spray side, fair balls only within LS_NEAR_DEG of a line; every other event none
 *   - only the umpire of the call's side signals (the other line umpire and a bag number get null)
 *   - 0 before the signal and after its end, reaches w 1, stays in 0..1; ends before the event does (e.d)
 *   - same input = same output (pure in time); hand targets finite; foul both hands up; the pointing arm of a fair call goes out to the fair side
 * static.mjs runs this file. Usage: node tests/umpline.check.mjs */
import { simGame, ARRIVE } from '../engine/index.js';
import { lineCall, lineSignal, lineEnd, LS_LINE_DEG, LS_NEAR_DEG, LS_OUT_AT, LS_BAG_M } from '../render/umpline.js';

const T = { ARRIVE }, problems = [], bad = m => { if (problems.length < 30) problems.push(m); };
const seen = { foul: 0, fair: 0, hr: 0, out: 0 }, OUT_B = { '1B': 1, RF: 1, '3B': 3, LF: 3 }, farFair = { n: 0 };
for (let seed = 1; seed <= 80; seed++) for (const e of simGame(seed, {}, {}).ev) {
  const c = lineCall(e, T), p = e.play;
  let want = null;
  if (e.k === 'P' && e.r === 'foul') want = { kind: 'foul', b: e.foulDir > 0 ? 1 : 3 };
  else if (e.k === 'P' && e.r === 'inplay' && p) {
    if (p.foul) { if (OUT_B[p.fielder]) want = { kind: 'out', b: OUT_B[p.fielder] }; }
    else if (p.res === 'HR') want = { kind: 'hr', b: p.spray >= 0 ? 1 : 3 };
    else if (!p.bunt && !(p.dist < LS_BAG_M) && Math.abs(p.spray) >= LS_LINE_DEG - LS_NEAR_DEG && Math.abs(p.spray) <= LS_LINE_DEG) want = { kind: 'fair', b: p.spray >= 0 ? 1 : 3 };
    else farFair.n++;
  }
  if ((c && c.kind) !== (want && want.kind) || (c && c.b) !== (want && want.b)) { bad(`seed ${seed}: call ${JSON.stringify(c)}, want ${JSON.stringify(want)}`); continue; }
  if (!c) { for (const b of [1, 2, 3, 4]) if (lineSignal(e, 1, b, T)) bad(`seed ${seed}: a signal for an event with none`); continue; }
  seen[c.kind]++;
  if (c.kind === 'out' && c.at < ARRIVE + p.hang + LS_OUT_AT - 1e-9 && !(Number.isFinite(e.d) && lineEnd(e, T) >= e.d - 1e-9)) bad(`seed ${seed}: out called at ${c.at} s, before the catch at ${ARRIVE + p.hang} s`);
  const end = lineEnd(e, T);
  if (Number.isFinite(e.d) && end > e.d + 1e-9) bad(`seed ${seed}: ${c.kind} signal ends at ${end.toFixed(2)} s, after the event (${e.d} s)`);
  const other = c.b === 1 ? 3 : 1;
  let max = 0;
  for (let u = 0; u <= end + 1; u += .02) {
    const s = lineSignal(e, u, c.b, T), s2 = lineSignal(e, u, c.b, T);
    if (JSON.stringify(s) !== JSON.stringify(s2)) bad(`seed ${seed}: ${c.kind} not pure at ${u}`);
    if (lineSignal(e, u, other, T) || lineSignal(e, u, 2, T) || lineSignal(e, u, 4, T)) bad(`seed ${seed}: ${c.kind} signalled by the wrong umpire at ${u}`);
    if (!s) continue;
    if (!(s.w > 0 && s.w <= 1 + 1e-9)) bad(`seed ${seed}: ${c.kind} w ${s.w} at ${u}`);
    if (!s.arms.every(Number.isFinite) || s.arms.length !== 6) bad(`seed ${seed}: ${c.kind} bad arms at ${u}`);
    if (u > end + 1e-6) bad(`seed ${seed}: ${c.kind} still signalling at ${u} after its end ${end}`);
    max = Math.max(max, s.w);
    if (s.w > .999) {
      if (c.kind === 'foul' && !(s.arms[1] > 1 && s.arms[4] > 1)) bad(`seed ${seed}: foul hands not up`);
      if (c.kind === 'fair' && !(c.b === 1 ? s.arms[0] > .7 : s.arms[3] < -.7)) bad(`seed ${seed}: fair call does not point to the fair side`);
      if (c.kind === 'out' && !(s.arms[1] > 1.1 && s.arms[4] < .5)) bad(`seed ${seed}: out call is not the right fist up`);
      if (c.kind === 'hr' && !(c.b === 1 ? s.arms[1] > 1.1 : s.arms[4] > 1.1)) bad(`seed ${seed}: home run finger not up`);
    }
  }
  if (max < .999) bad(`seed ${seed}: ${c.kind} never reaches full (${max})`);
}
for (const [k, n] of Object.entries(seen)) if (!n) bad(`no ${k} event in 80 games: the check proves nothing for it`);
if (!farFair.n) bad('no fair ball far from a line: the "no signal" side is not proven');
if (problems.length) { console.error('umpline check FAILED:\n' + problems.join('\n')); process.exit(1); }
console.log('umpline check ok', JSON.stringify(seen));
