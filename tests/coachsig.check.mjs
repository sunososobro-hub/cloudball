/* #612 part 2: the third-base coach's signals (plain Node, render/coachsig.js is run). Checks: over real engine games a runner scoring
 * from base 1-3 gets a wave that starts before he is home and ends before the event's last arrival plus SIG_HOLD, a runner stopping at
 * third gets a hold, a non-P event or a play with neither gets none; part 3: every pickoff throw (out or safe) gets one first-base "back" from before the throw to after the runner is in; weights stay 0..1 with no jump; pure in time; game.js builds it.
 * static.mjs runs this file. Usage: node tests/coachsig.check.mjs */
import { readFileSync } from 'node:fs';
import { simGame } from '../engine/index.js';
import { coachSignals, backSignals, signalAt, handsFor, SIG_RAMP, SIG_HOLD, BASE_LEN, BACK_LEAD, BACK_AFTER, REST } from '../render/coachsig.js';
const bad = [], B = m => { if (bad.length < 30) bad.push(m); };
let waves = 0, holds = 0, none = 0, backs = 0;
if (coachSignals({ k: 'BRK' }).length || coachSignals(null).length) B('signals on a non-P event');
for (let seed = 1; seed <= 30; seed++) for (const e of simGame(seed, {}, {}).ev) {
  /* part 3: the first-base coach's "back" covers every pickoff throw, from before the throw until the runner is back, and nothing else */
  const bs = backSignals(e), po = e.k === 'P' && e.po;
  if (bs.length !== (po ? 1 : 0)) B(`seed ${seed}: ${bs.length} back signals on a ${po ? 'pickoff' : 'non-pickoff'} event`);
  for (const s of bs) {
    backs++; const pl = e.plan;
    if (!(s.t0 < pl.t0 && s.t0 >= pl.t0 - BACK_LEAD - 1e-9)) B('back does not start before the throw');
    if (!(s.t1 >= pl.runnerAt + BACK_AFTER - 1e-9)) B('back ends before the runner is in');
    const mid = signalAt(bs, (pl.t0 + pl.runnerAt) / 2), h = mid && handsFor(mid);
    if (!mid || mid.kind !== 'back' || mid.w < .99) B('no full back signal while the runner dives');
    if (!h || h.r[1] >= REST[1] || h.l[1] >= REST[1]) B('back hands not pumped down');
    let prev = null; for (let u = s.t0; u <= s.t1; u += .01) { const g = handsFor(signalAt(bs, u)) || { r: REST }; if (prev && Math.abs(g.r[1] - prev) > .05) B('back hands jump'); prev = g.r[1] }
  }
  const sigs = coachSignals(e), mv = e.k === 'P' ? (e.moves || []) : [];
  const nW = mv.filter(m => m[1] === 4 && m[0] <= 3 && m[0] !== m[1] && m[3] && Number.isFinite(m[3].arriveT)).length;
  const nH = mv.filter(m => m[1] === 3 && m[0] < 3 && m[3] && Number.isFinite(m[3].arriveT)).length;
  if (sigs.filter(s => s.kind === 'wave').length !== nW || sigs.filter(s => s.kind === 'hold').length !== nH) B(`seed ${seed}: signal count differs from moves`);
  if (!sigs.length) { none++; if (signalAt(sigs, 1) !== null) B('signal without a move'); continue }
  for (const s of sigs) {
    if (!(s.t0 >= 0 && s.t1 > s.t0)) B('bad window ' + JSON.stringify(s));
    if (s.kind === 'wave') { const last = Math.max(...mv.filter(m => m[1] === 4).map(m => m[3].arriveT)); if (s.t1 > last + SIG_HOLD + 1e-9) B('wave outlasts the scoring run'); if (s.t0 > last - BASE_LEN / 12) B('wave starts too late'); waves++ } else holds++;
    const a = signalAt(sigs, s.t0 - 1), mid = signalAt(sigs, (s.t0 + s.t1) / 2);
    if (a && a.kind === s.kind && a.w !== 0 && s.t0 - 1 >= 0 && !sigs.some(o => o !== s && o.t0 <= s.t0 - 1 && o.t1 >= s.t0 - 1)) B('signal before its window');
    if (!mid || mid.w < .99) B('no full signal mid-window');
    let prev = 0; for (let u = s.t0; u <= s.t1; u += .02) { const g = signalAt([s], u); if (g.w < 0 || g.w > 1) B('weight outside 0..1'); if (Math.abs(g.w - prev) > .02 / SIG_RAMP + 1e-9) B('weight jumps'); prev = g.w }
    if (JSON.stringify(signalAt(sigs, s.t0 + .7)) !== JSON.stringify(signalAt(sigs, s.t0 + .7))) B('not pure');
    for (const kind of [s.kind]) { const h = handsFor({ kind, w: 1, phase: .3 }); if (!h || [...h.r, ...h.l].some(v => !Number.isFinite(v))) B('bad hands') }
  }
}
if (!waves || !holds || !backs) B(`30 games gave ${waves} waves, ${holds} holds, ${backs} backs: the check saw nothing`);
if (handsFor(null) !== null || handsFor({ kind: 'wave', w: 0, phase: 0 }) !== null) B('hands without a signal');
const gameSrc = readFileSync(new URL('../render/game.js', import.meta.url), 'utf8');
if (!/coachsig\.js/.test(gameSrc) || !/backSignals/.test(gameSrc)) B('game.js does not load coachsig.js or draw the back signal');
if (bad.length) { console.error('coachsig.check FAILED\n' + bad.join('\n')); process.exit(1) }
console.log(`coachsig.check ok (${waves} waves, ${holds} holds, ${backs} backs, ${none} quiet events)`);
