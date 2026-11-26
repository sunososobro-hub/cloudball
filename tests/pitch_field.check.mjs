/* Fielding pitcher clip hand-off (#274 item 2, plain Node). Runs the real render/game.js pitch block (from `const kf=` up to
 * `function arc(`, the same slice render/tools/pitch_handoff_probe.mjs evaluates) with its few globals stubbed, on the engine's own plans:
 *   - at ARRIVE the fielding pitcher's clip weight equals the delivery's pmW (no snap when the run code takes over)
 *   - it never rises, and no 1/60 s frame drops it by more than MAX_STEP
 *   - it is 0 by his first plan action (catch, field, cover), so the ball meets the proxy hand, and 0 after PF_FADE
 * static.mjs runs this file. Usage: node tests/pitch_field.check.mjs */
import { readFileSync } from 'node:fs';
import { simGame, RELEASE, ARRIVE, FIELD_REACT } from '../engine/index.js';

const MAX_STEP = .12, SEEDS = 60, DT = 1 / 60;
const problems = [], bad = m => { if (problems.length < 30) problems.push(m); };
const src = readFileSync(new URL('../render/game.js', import.meta.url), 'utf8'), a = src.indexOf('const kf='), b = src.indexOf('function arc(');
if (a < 0 || b < a) { console.log('pitch_field FAIL\npitch block not found in render/game.js'); process.exit(1); }
const sat01 = t => Math.max(0, Math.min(1, t)), ease = t => t * t * (3 - 2 * t);
const api = new Function('fielders', 'PR', 'OFF', 'window', 'clamp', 'lerp', 'sat01', 'ease', 'RELEASE', 'ARRIVE', 'FIELD_REACT',
  src.slice(a, b) + ';return{pmW,pmFieldW,P_RUN_BLEND}')({}, {}, new Set(), {}, (v, x, y) => Math.max(x, Math.min(y, v)), (x, y, t) => x + (y - x) * t,
  sat01, ease, RELEASE, ARRIVE, FIELD_REACT);
const { pmW, pmFieldW, P_RUN_BLEND } = api, FADE = FIELD_REACT + P_RUN_BLEND;

let n = 0, fielded = 0, covered = 0, worst = 0;
for (let seed = 1; seed <= SEEDS; seed++) {
  for (const e of simGame(seed, {}).ev) {
    if (e.k !== 'P' || e.r !== 'inplay' || !e.plan || !(e.play.fielder === 'P' || (e.plan.CV && e.plan.CV.key === 'P'))) continue;
    n++; if (e.play.fielder === 'P') fielded++; else covered++;
    const tP = Math.min(...e.plan.actions.filter(x => x.f === 'P').map(x => x.t));
    const w0 = pmFieldW(ARRIVE, tP);
    if (Math.abs(w0 - pmW(ARRIVE)) > 1e-9) bad(`seed ${seed} t ${e.t}: weight at ARRIVE ${w0} != pmW ${pmW(ARRIVE)} (snap)`);
    let prev = w0;
    for (let u = ARRIVE + DT; u <= ARRIVE + 2; u += DT) {
      const w = pmFieldW(u, tP);
      if (w > prev + 1e-12) bad(`seed ${seed} t ${e.t}: weight rises at u ${u.toFixed(3)}`);
      worst = Math.max(worst, prev - w);
      if (prev - w > MAX_STEP) bad(`seed ${seed} t ${e.t}: weight drops ${(prev - w).toFixed(3)} in one frame at u ${u.toFixed(3)} (tP ${tP.toFixed(2)})`);
      if ((u - ARRIVE >= tP - 1e-9 || u - ARRIVE >= FADE - 1e-9) && w > 1e-9) bad(`seed ${seed} t ${e.t}: clip still on (${w.toFixed(3)}) at u ${u.toFixed(3)}, first action ${tP.toFixed(2)}`);
      prev = w;
    }
  }
}
if (n < 20) bad(`only ${n} pitcher plays in ${SEEDS} seeds`);
if (problems.length) { console.log('pitch_field FAIL\n' + problems.join('\n')); process.exit(1); }
console.log(`pitch_field ok: ${n} pitcher plays (${fielded} fielded, ${covered} covers) in ${SEEDS} seeds, worst frame drop ${worst.toFixed(3)}`);
