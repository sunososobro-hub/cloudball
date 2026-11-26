/* #81: the manager's walk to the mound on a pitching change (render/visit.js, plain Node).
 * Checks, from both dugouts (INTRO_X / INTRO_Z read from render/game.js, the mound = spotXZ(FIELD_SPOTS.P) as game.js places P):
 *   - a CHANGE_DUR frame fits a visit; a frame too short gets none (null), so he never appears without getting back
 *   - hidden before VISIT_GO and from `end` on; `end` <= d - VISIT_END_GAP; leaves from and comes back to the dugout spot
 *   - no jump: sampled every 10 ms, no step longer than VISIT_V x dt; stops VISIT_R m from the rubber, faces it while there
 *   - every CHG frame of 60 simulated games gets a plan; deterministic
 * static.mjs runs this file. Usage: node tests/visit.check.mjs */
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { visitPlan, visitAt, VISIT_GO, VISIT_V, VISIT_R, VISIT_TALK, VISIT_END_GAP } from '../render/visit.js';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), bad = [];
const { simGame, CHANGE_DUR, FIELD_SPOTS, spotXZ } = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const game = readFileSync(path.join(ROOT, 'render/game.js'), 'utf8');
const num = k => { const m = game.match(new RegExp('\\b' + k + '=(-?[0-9.]+)')); return m ? +m[1] : NaN; };
const IX = num('INTRO_X'), IZ = num('INTRO_Z');
if (!Number.isFinite(IX) || !Number.isFinite(IZ)) bad.push(`INTRO_X/INTRO_Z not found in render/game.js (${IX}, ${IZ})`);
const mound = spotXZ(...FIELD_SPOTS.P), DT = .01, eps = 1e-6;

for (const side of [1, -1]) {
  const from = [side * IX, IZ], pl = visitPlan(from, mound, CHANGE_DUR), tag = `dugout ${from}`;
  if (!pl) { bad.push(`${tag}: no visit fits a CHANGE_DUR ${CHANGE_DUR} s frame`); continue; }
  if (pl.go !== VISIT_GO || pl.end > CHANGE_DUR - VISIT_END_GAP + eps) bad.push(`${tag}: visit ${pl.go}..${pl.end} outside [${VISIT_GO}, ${CHANGE_DUR - VISIT_END_GAP}]`);
  if (pl.leave - pl.arrive < VISIT_TALK - eps) bad.push(`${tag}: ${pl.leave - pl.arrive} s at the mound, want >= ${VISIT_TALK}`);
  if (Math.abs(Math.hypot(pl.stand[0] - mound[0], pl.stand[1] - mound[1]) - VISIT_R) > 1e-6) bad.push(`${tag}: stops off VISIT_R`);
  let prev = null, shown = 0;
  for (let u = 0; u <= CHANGE_DUR + eps; u += DT) {
    const a = visitAt(pl, u);
    if ((u < pl.go - eps || u >= pl.end + eps) && a.visible) { bad.push(`${tag}: visible at ${u.toFixed(2)} s`); break; }
    if (!a.visible) { prev = null; continue; }
    shown++;
    if (!prev && Math.hypot(a.x - from[0], a.z - from[1]) > VISIT_V * DT + eps) bad.push(`${tag}: appears ${Math.hypot(a.x - from[0], a.z - from[1]).toFixed(2)} m out of the dugout at ${u.toFixed(2)} s`);
    if (prev && Math.hypot(a.x - prev.x, a.z - prev.z) > VISIT_V * DT + 1e-4) { bad.push(`${tag}: jumps at ${u.toFixed(2)} s`); break; }
    if (u > pl.arrive + eps && u < pl.leave - eps) { const fx = mound[0] - a.x, fz = mound[1] - a.z; if (a.moving || Math.abs(Math.atan2(a.fx, a.fz) - Math.atan2(fx, fz)) > 1e-6) { bad.push(`${tag}: not facing the pitcher at ${u.toFixed(2)} s`); break; } }
    prev = a;
  }
  if (prev && Math.hypot(prev.x - from[0], prev.z - from[1]) > VISIT_V * DT + 1e-4) bad.push(`${tag}: vanishes ${Math.hypot(prev.x - from[0], prev.z - from[1]).toFixed(2)} m short of the dugout`);
  if (!shown) bad.push(`${tag}: never shown`);
  if (JSON.stringify(pl) !== JSON.stringify(visitPlan(from, mound, CHANGE_DUR))) bad.push(`${tag}: not deterministic`);
  if (visitPlan(from, mound, VISIT_GO + VISIT_END_GAP + VISIT_TALK)) bad.push(`${tag}: a frame with no time for the legs still got a visit`);
}
if (visitPlan(mound, mound, CHANGE_DUR)) bad.push('a dugout on the mound got a visit');
if (visitAt(null, 5).visible) bad.push('no plan but visible');

let chg = 0;
for (let seed = 1; seed <= 60; seed++) for (const e of simGame(seed, {}).ev) if (e.k === 'CHG') {
  chg++;
  const side = e.def === 0 ? 1 : -1;/* game.js dugout(t): side 0 at +INTRO_X */
  if (!visitPlan([side * IX, IZ], mound, e.d)) bad.push(`seed ${seed} CHG at ${e.t}: no visit (d ${e.d})`);
}
if (!chg) bad.push('no CHG frame in 60 games: the check saw nothing');
if (bad.length) { console.error('FAIL visit:\n - ' + bad.slice(0, 30).join('\n - ')); process.exit(1); }
console.log(`visit ok: both dugouts, ${chg} pitching changes in 60 games get a walk to the mound and back`);
