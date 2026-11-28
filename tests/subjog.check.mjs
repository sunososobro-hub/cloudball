/* #611 parts 1-2: pinch-runner and defensive-replacement jog (render/subjog.js), plain Node over real engine games. The module is run, not read:
 *   - every pinch-run SUB frame (engine `k: 'SUB'` with `base`) in 400 seeds: the replaced runner starts on his spot and is
 *     in the dugout (null) by the end of the frame; the pinch runner is in the dugout at u = 0 and on the spot by d - PR_HOLD,
 *     so nobody pops in or out (#42)
 *   - no step faster than MAX_V m/s, and the two men never closer than MIN_GAP m
 *   - the frame's event is unchanged by drafting the jog (rule 10) and same input = same output
 * static.mjs runs this file. Usage: node tests/subjog.check.mjs */
import { simGame, leadAt } from '../engine/index.js';
import { BASES } from '../engine/rules/field.js';
import { prJog, dsJog, PR_HOLD } from '../render/subjog.js';

const problems = [], bad = m => { if (problems.length < 30) problems.push(m); };
const MAX_V = 9, MIN_GAP = .5, DT = .05, INTRO_X = 26, INTRO_Z = -6;/* game.js dugout(): INTRO_X, INTRO_Z */
const dugout = t => [(t === 0 ? 1 : -1) * INTRO_X, INTRO_Z];
const near = (p, q, tol = 1e-6) => Math.abs(p[0] - q[0]) < tol && Math.abs(p[1] - q[1]) < tol;
let frames = 0;
for (let seed = 1; seed <= 400; seed++) {
  const ev = simGame(seed, {}, {}).ev;
  for (const e of ev) {
    if (e.k !== 'SUB' || e.base === undefined) continue;
    frames++;
    const i = e.base - 1, off = e.s0.half, before = JSON.stringify(e);
    if (!e.s0.b[i] || !e.s1.b[i] || e.s0.b[i] === e.s1.b[i]) bad(`seed ${seed} t ${e.t}: SUB base ${e.base} does not swap a runner`);
    const [bx, bz] = BASES[i + 1], [nx, nz] = BASES[i + 2], L = Math.hypot(nx - bx, nz - bz), ld = leadAt(0);
    const spot = [bx + (nx - bx) / L * ld, bz + (nz - bz) / L * ld], dug = dugout(off), at = u => prJog(spot, dug, u, e.d, [-bx, -bz]);
    const a = at(0), z = at(e.d);
    if (!a.out || !near(a.out, spot)) bad(`seed ${seed} t ${e.t}: replaced runner not on his spot at u=0`);
    if (a.in) bad(`seed ${seed} t ${e.t}: pinch runner drawn at u=0`);
    if (z.out) bad(`seed ${seed} t ${e.t}: replaced runner still out at the end of the frame`);
    const h = at(e.d - PR_HOLD + 1e-9);
    if (!h.in || !near(h.in, spot)) bad(`seed ${seed} t ${e.t}: pinch runner not on the spot by d - PR_HOLD`);
    let prev = a;
    for (let u = DT; u <= e.d + 1e-9; u += DT) {
      const c = at(u);
      for (const k of ['out', 'in']) if (prev[k] && c[k]) { const v = Math.hypot(c[k][0] - prev[k][0], c[k][1] - prev[k][1]) / DT; if (v > MAX_V) bad(`seed ${seed} t ${e.t} u ${u.toFixed(2)}: ${k} runner ${v.toFixed(1)} m/s`); }
      if (c.out && c.in) { const g = Math.hypot(c.out[0] - c.in[0], c.out[1] - c.in[1]); if (g < MIN_GAP) bad(`seed ${seed} t ${e.t} u ${u.toFixed(2)}: runners ${g.toFixed(2)} m apart`); }
      prev = c;
    }
    if (JSON.stringify(at(3.3)) !== JSON.stringify(at(3.3))) bad(`seed ${seed}: not deterministic`);
    if (JSON.stringify(e) !== before) bad(`seed ${seed} t ${e.t}: event changed`);
  }
}
/* part 2: every defensive-replacement SUB frame (role 'defensive', d = DS_DUR): the new fielder walks from the dugout to the
 * position and is there by d - PR_HOLD, the replaced one is in the dugout by d; same speed and gap limits as the pinch runner */
let dframes = 0;
for (let seed = 1; seed <= 400; seed++) {
  const ev = simGame(seed, {}, {}).ev;
  for (const e of ev) {
    if (e.k !== 'SUB' || e.role !== 'defensive') continue;
    dframes++;
    const off = e.s0.half, dug = dugout(1 - off), before = JSON.stringify(e), pos = [(off ? 1 : -1) * 12, 20 + seed % 30];
    const at = u => dsJog(pos, dug, u, e.d), a = at(0), z = at(e.d), h = at(e.d - PR_HOLD + 1e-9);
    if (!a.out || !near(a.out, pos)) bad(`seed ${seed} t ${e.t}: replaced fielder not on his position at u=0`);
    if (a.in) bad(`seed ${seed} t ${e.t}: new fielder drawn at u=0`);
    if (z.out) bad(`seed ${seed} t ${e.t}: replaced fielder still out at the end of the frame`);
    if (!h.in || !near(h.in, pos)) bad(`seed ${seed} t ${e.t}: new fielder not on his position by d - PR_HOLD`);
    let prev = a;
    for (let u = DT; u <= e.d + 1e-9; u += DT) {
      const c = at(u);
      for (const k of ['out', 'in']) if (prev[k] && c[k]) { const v = Math.hypot(c[k][0] - prev[k][0], c[k][1] - prev[k][1]) / DT; if (v > MAX_V) bad(`seed ${seed} t ${e.t} u ${u.toFixed(2)}: ${k} fielder ${v.toFixed(1)} m/s`); }
      if (c.out && c.in) { const g = Math.hypot(c.out[0] - c.in[0], c.out[1] - c.in[1]); if (g < MIN_GAP) bad(`seed ${seed} t ${e.t} u ${u.toFixed(2)}: fielders ${g.toFixed(2)} m apart`); }
      prev = c;
    }
    if (JSON.stringify(e) !== before) bad(`seed ${seed} t ${e.t}: event changed`);
  }
}
if (dframes < 3) bad(`only ${dframes} defensive-replacement frames in 400 seeds: part 2 is not covered`);
if (frames < 5) bad(`only ${frames} pinch-run frames in 400 seeds: the check does not cover the case`);
if (problems.length) { console.error('subjog check FAILED:\n  ' + problems.join('\n  ')); process.exit(1); }
console.log(`subjog check OK: ${frames} pinch-run + ${dframes} defensive-replacement frames, jog out / off within the frame, <= ${MAX_V} m/s, >= ${MIN_GAP} m apart`);
