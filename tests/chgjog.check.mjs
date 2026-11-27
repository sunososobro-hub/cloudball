/* #611 part 3: pitching-change walk off / jog on (render/subjog.js pitChange), plain Node over real engine games. The module is run, not read:
 *   - every CHG frame in 120 seeds: the old pitcher is on the mound at u = 0 and in the dugout (null) by the end; the reliever is not drawn
 *     before RL_GO, is on the mound by d - RL_HOLD and stays there, so nobody appears or vanishes on the mound
 *   - no step faster than MAX_V m/s; the gate is on the team's own side of the field, behind the outfield line (z < 0)
 *   - RL_GO / RL_V match the engine's RELIEF_SIGNAL_DUR / RELIEF_JOG_SPEED; the event is unchanged (rule 10); same input = same output
 * static.mjs runs this file. Usage: node tests/chgjog.check.mjs */
import { simGame } from '../engine/index.js';
import * as K from '../engine/constants.js';
import { pitChange, reliefGate, RL_GO, RL_V, RL_HOLD } from '../render/subjog.js';

const problems = [], bad = m => { if (problems.length < 30) problems.push(m); };
const MAX_V = 9, DT = .1, MOUND = [0, -18.44], INTRO_X = 26, INTRO_Z = -6;
const dugout = t => [(t === 0 ? 1 : -1) * INTRO_X, INTRO_Z];
const near = (p, q) => Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6;
if (RL_GO !== K.RELIEF_SIGNAL_DUR || RL_V !== K.RELIEF_JOG_SPEED) bad('RL_GO / RL_V differ from the engine constants');
let frames = 0;
for (const t of [0, 1]) { const g = reliefGate(t); if (!(g[1] < 0) || (t === 0 ? g[0] <= 0 : g[0] >= 0)) bad(`gate of team ${t} is not on its own side: ${g}`); }
for (let seed = 1; seed <= 120; seed++) {
  const ev = simGame(seed, {}, {}).ev;
  for (const e of ev) {
    if (e.k !== 'CHG') continue;
    frames++;
    const before = JSON.stringify(e), dug = dugout(e.def), gate = reliefGate(e.def), at = u => pitChange(MOUND, dug, gate, u, e.d);
    const a = at(0), z = at(e.d), h = at(e.d - RL_HOLD + 1e-9);
    if (!a.out || !near(a.out, MOUND)) bad(`seed ${seed} t ${e.t}: old pitcher not on the mound at u=0`);
    if (a.in) bad(`seed ${seed} t ${e.t}: reliever drawn at u=0`);
    if (z.out) bad(`seed ${seed} t ${e.t}: old pitcher still out at the end`);
    if (!h.in || !near(h.in, MOUND) || !z.in || !near(z.in, MOUND)) bad(`seed ${seed} t ${e.t}: reliever not on the mound by d - RL_HOLD`);
    let prev = a;
    for (let u = DT; u <= e.d + 1e-9; u += DT) {
      const c = at(u);
      for (const k of ['out', 'in']) if (prev[k] && c[k]) { const v = Math.hypot(c[k][0] - prev[k][0], c[k][1] - prev[k][1]) / DT; if (v > MAX_V) bad(`seed ${seed} t ${e.t} u ${u.toFixed(1)}: ${k} ${v.toFixed(1)} m/s`); }
      prev = c;
    }
    if (JSON.stringify(at(30)) !== JSON.stringify(at(30))) bad(`seed ${seed}: not deterministic`);
    if (JSON.stringify(e) !== before) bad(`seed ${seed} t ${e.t}: event changed`);
  }
}
if (!frames) bad('no CHG frame in 120 games: the check saw nothing');
if (problems.length) { console.log('chgjog.check FAILED:\n' + problems.join('\n')); process.exit(1); }
console.log(`chgjog.check ok: ${frames} CHG frames`);
