/* Depth of field params (#211, plain Node). render/dof.js:
 *   - no shot (weights 0 / NaN) or a bad distance gives scale 0 (pass-through) and a harmless focus
 *   - the tight shot gives the tight length and a scale that grows with its weight, never above the full-weight scale
 *   - the plate camera wins when both are on, with its own length and scale
 *   - focus is the distance given; deterministic. static.mjs runs this file. Usage: node tests/dof.check.mjs */
import { dofParams, DOF_TIGHT_LEN, DOF_PLATE_LEN, DOF_TIGHT_SCALE, DOF_PLATE_SCALE, DOF_MIN_W } from '../render/dof.js';
const problems = [], bad = m => problems.push(m);
for (const a of [[0, 0, 30], [NaN, NaN, 30], [DOF_MIN_W / 2, 0, 30], [1, 0, 0], [1, 0, -4], [1, 0, NaN], [undefined, undefined, 20]]) { const r = dofParams(...a); if (r.scale !== 0) bad(`${JSON.stringify(a)} should be off, scale ${r.scale}`); }
let prev = -1;
for (const w of [.05, .25, .5, .75, 1]) { const r = dofParams(w, 0, 31.5); if (r.length !== DOF_TIGHT_LEN || r.focus !== 31.5) bad('tight shot length/focus wrong'); if (r.scale <= prev) bad('tight scale does not grow with weight'); if (r.scale > DOF_TIGHT_SCALE + 1e-9) bad('tight scale above full-weight scale'); prev = r.scale; }
if (dofParams(1.4, 0, 30).scale !== DOF_TIGHT_SCALE) bad('weight above 1 must clamp');
{ const r = dofParams(1, 1, 25); if (r.length !== DOF_PLATE_LEN || r.scale !== DOF_PLATE_SCALE) bad('plate camera should win over the tight shot'); const h = dofParams(0, .5, 25); if (Math.abs(h.scale - DOF_PLATE_SCALE / 2) > 1e-9) bad('plate half weight'); }
if (JSON.stringify(dofParams(.6, 0, 30)) !== JSON.stringify(dofParams(.6, 0, 30))) bad('not deterministic');
if (!(DOF_TIGHT_LEN > 0 && DOF_PLATE_LEN > 0 && DOF_TIGHT_SCALE > 0 && DOF_PLATE_SCALE > 0)) bad('constants must be positive');
console.log(`dof: tight len ${DOF_TIGHT_LEN} m scale ${DOF_TIGHT_SCALE}, plate len ${DOF_PLATE_LEN} m scale ${DOF_PLATE_SCALE}`);
if (problems.length) { console.error('dof.check FAILED:\n' + problems.join('\n')); process.exit(1); }
console.log('dof.check OK');
