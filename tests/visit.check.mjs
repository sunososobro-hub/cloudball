/* #81: the manager's walk to the mound on a pitching change (render/visit.js, plain Node).
 * Checks, from both dugouts (INTRO_X / INTRO_Z read from render/game.js, the mound = spotXZ(FIELD_SPOTS.P) as game.js places P):
 *   - a CHANGE_DUR frame fits a visit; a frame too short gets none (null), so he never appears without getting back
 *   - hidden before VISIT_GO and from `end` on; `end` <= d - VISIT_END_GAP; leaves from and comes back to the dugout spot
 *   - no jump: sampled every 10 ms, no step longer than VISIT_V x dt; stops VISIT_R m from the rubber, faces it while there
 *   - every CHG frame of 60 simulated games gets a plan; deterministic
 *   - mound visits (engine VIS frame, MOUND_VISIT_DUR s): each fits a plan from its dugout, follows a pitching vote picked 'stay'
 *     in the frame before, carries one `mound_visit` stream event of its frame, at most one per pitcher of a team
 * static.mjs runs this file. Usage: node tests/visit.check.mjs */
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { visitPlan, visitAt, VISIT_GO, VISIT_V, VISIT_R, VISIT_TALK, VISIT_END_GAP } from '../render/visit.js';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), bad = [];
const { simGame, CHANGE_DUR, MOUND_VISIT_DUR, FIELD_SPOTS, spotXZ } = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
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

let chg = 0, vis = 0;
for (let seed = 1; seed <= 60; seed++) {
  const g = simGame(seed, {}), seen = new Set();
  g.ev.forEach((e, fi) => {
    if (e.k !== 'CHG' && e.k !== 'VIS') return;
    const side = e.def === 0 ? 1 : -1;/* game.js dugout(t): side 0 at +INTRO_X */
    if (!visitPlan([side * IX, IZ], mound, e.d)) bad.push(`seed ${seed} ${e.k} at ${e.t}: no visit (d ${e.d})`);
    if (e.k === 'CHG') { chg++; return; }
    vis++;
    const v = g.ev[fi - 1], sv = g.stream.filter(x => x.type === 'mound_visit' && x.f === fi);
    if (e.d !== MOUND_VISIT_DUR) bad.push(`seed ${seed} VIS at ${e.t}: d ${e.d}, want MOUND_VISIT_DUR ${MOUND_VISIT_DUR}`);
    if (!v || v.k !== 'VOTE' || v.kind !== 'P' || v.pick !== 'stay' || v.team !== e.def) bad.push(`seed ${seed} VIS at ${e.t}: not right after a pitching vote picked 'stay'`);
    if (sv.length !== 1 || sv[0].team !== e.def || sv[0].staff !== 'pitching') bad.push(`seed ${seed} VIS at ${e.t}: ${sv.length} mound_visit events`);
    else if (seen.has(`${e.def}:${sv[0].pitcher}`)) bad.push(`seed ${seed}: second visit to ${sv[0].pitcher}`);
    else seen.add(`${e.def}:${sv[0].pitcher}`);
  });
  if (g.stream.filter(x => x.type === 'mound_visit').length !== g.ev.filter(e => e.k === 'VIS').length) bad.push(`seed ${seed}: mound_visit events and VIS frames differ`);
}
if (!chg) bad.push('no CHG frame in 60 games: the check saw nothing');
if (!vis) bad.push('no VIS frame in 60 games: the check saw nothing');
if (bad.length) { console.error('FAIL visit:\n - ' + bad.slice(0, 30).join('\n - ')); process.exit(1); }
console.log(`visit ok: both dugouts, ${chg} pitching changes and ${vis} mound visits in 60 games get a walk to the mound and back`);
