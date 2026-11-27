/* Check-swing appeal picture (#708, plain Node). render/chkswing.js is run, not read, over real engine games:
 *   - only a pitch frame the engine marked with `chk` gets an appeal; its stream `appeal` event names the same umpire and ruling
 *   - the batter's swing is capped at HALF_SWING and comes back; the catcher's point is full by the appeal time
 *   - the named base umpire (only he) signals within 0.5 s of the appeal: safe sign on `no_swing`, strike fist on `swing`
 *   - everything is a pure function of (event, time)
 * static.mjs runs this file. Usage: node tests/chkswing_render.check.mjs */
import { simGame, ARRIVE, CHECK_APPEAL_AT } from '../engine/index.js';
import { appealOf, halfSwing, catcherPoint, appealSignal, appealEnd, HALF_SWING } from '../render/chkswing.js';

const T = { ARRIVE, CHECK_APPEAL_AT }, GAMES = 80, WITHIN = .5, problems = [], bad = m => { if (problems.length < 30) problems.push(m); };
let n = 0, swings = 0, denied = 0;
for (let seed = 1; seed <= GAMES; seed++) {
  const g = simGame(seed, {}, { teams: [seed % 4, (seed + 1) % 4] });
  const appeals = (g.stream || []).filter(x => x && x.type === 'appeal');
  const frames = g.ev.filter(e => e.k === 'P' && e.chk);
  for (const e of g.ev) if (!(e.k === 'P' && e.chk) && (appealOf(e, T) || halfSwing(e, ARRIVE, T) || catcherPoint(e, ARRIVE + CHECK_APPEAL_AT, T))) bad(`seed ${seed}: appeal drawn on a frame without chk at ${e.t}`);
  if (appeals.length && appeals.length !== frames.length) bad(`seed ${seed}: ${appeals.length} appeal events, ${frames.length} chk frames`);
  frames.forEach((e, i) => {
    n++;
    const a = appealOf(e, T), at = ARRIVE + CHECK_APPEAL_AT, s = appeals[i];
    if (!a || a.at !== at || (a.b !== 1 && a.b !== 3)) { bad(`seed ${seed}: appealOf ${JSON.stringify(a)} at ${e.t}`); return; }
    if (s && (s.umpire !== (a.b === 1 ? 'first_base' : 'third_base') || s.ruling !== (a.swing ? 'swing' : 'no_swing') || Math.abs(s.time - (e.t + at)) > 1e-6))
      bad(`seed ${seed}: stream appeal ${s.umpire}/${s.ruling}@${s.time} vs frame ump ${a.b} swing ${a.swing} @${e.t + at}`);
    a.swing ? swings++ : denied++;
    const cp = catcherPoint(e, at, T);
    if (!cp || cp.b !== a.b || cp.w < 1 - 1e-9) bad(`seed ${seed}: catcher not pointing at umpire ${a.b} at the appeal (${JSON.stringify(cp)})`);
    let maxSwing = 0, signalAt = null;
    for (let u = 0; u <= appealEnd(e, T) + .2; u += .01) {
      const h = halfSwing(e, u, T);
      if (!h) { bad(`seed ${seed}: no half swing at ${u.toFixed(2)}`); break; }
      maxSwing = Math.max(maxSwing, h.cap * (1 - h.back));
      const other = appealSignal(e, u, a.b === 1 ? 3 : 1, T) || appealSignal(e, u, 2, T);
      if (other) { bad(`seed ${seed}: the wrong umpire signals at ${u.toFixed(2)}`); break; }
      const sg = appealSignal(e, u, a.b, T);
      if (JSON.stringify(sg) !== JSON.stringify(appealSignal(e, u, a.b, T))) { bad(`seed ${seed}: appealSignal not pure`); break; }
      if (sg && sg.kind !== (a.swing ? 'swing' : 'no_swing')) bad(`seed ${seed}: umpire signals ${sg.kind} on a ${a.swing ? 'swing' : 'no swing'} ruling`);
      if (sg && sg.w >= 1 - 1e-9 && signalAt === null) signalAt = u;
      if (sg && !sg.arms.every(Number.isFinite)) bad(`seed ${seed}: non-finite arms`);
    }
    if (maxSwing > HALF_SWING + 1e-9) bad(`seed ${seed}: swing goes ${maxSwing} round, cap ${HALF_SWING}`);
    const end = halfSwing(e, appealEnd(e, T), T);
    if (end.cap * (1 - end.back) > 1e-6) bad(`seed ${seed}: bat not back by the end of the signal`);
    if (signalAt === null || signalAt < at || signalAt > at + WITHIN) bad(`seed ${seed}: umpire's full signal at ${signalAt}, appeal at ${at}`);
  });
}
if (!swings || !denied) bad(`want both rulings: ${swings} swing, ${denied} no swing in ${GAMES} games`);
if (problems.length) { console.error('chkswing_render check FAILED:\n  ' + problems.join('\n  ')); process.exit(1); }
console.log(`chkswing_render check OK: ${n} appeals (${swings} swing, ${denied} no swing) over ${GAMES} games: half swing, catcher points by the appeal, the named umpire signals within ${WITHIN} s`);
