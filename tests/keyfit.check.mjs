/* Tight key-shadow frustum (#211, plain Node). render/keyfit.js:
 *   - no focus (or a bad one) gives the whole-park fit that game.js starts with
 *   - a focus moves the target onto the ground under it and keeps the light direction (position - target) unchanged
 *   - the tight box is smaller than the park box and still holds a 3 m radius around the focus along the light's sideways axes
 *   - deterministic. static.mjs runs this file. Usage: node tests/keyfit.check.mjs */
import { keyFit, KEY_OFFSET, KEY_PARK_TARGET, KEY_PARK_HALF, KEY_TIGHT_HALF } from '../render/keyfit.js';
const problems = [], bad = m => problems.push(m), eq = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
for (const f of [null, undefined, { x: NaN, y: 0, z: 0 }, { x: 1, y: 0 }]) { const r = keyFit(f); if (r.tight || r.half !== KEY_PARK_HALF || !eq(r.target, KEY_PARK_TARGET)) bad(`bad focus ${JSON.stringify(f)} did not give the park fit`); }
for (const f of [{ x: 0, y: 1.2, z: 0 }, { x: -0.8, y: 0, z: -0.4 }, { x: 3, y: 2, z: 30 }]) {
  const r = keyFit(f);
  if (!r.tight || r.half !== KEY_TIGHT_HALF) bad('focus did not give the tight fit');
  if (!eq(r.target, [f.x, 0, f.z])) bad('target is not on the ground under the focus');
  if (!eq(r.position.map((v, i) => v - r.target[i]), KEY_OFFSET)) bad('light direction changed');
  if (!eq(keyFit(f).position, r.position)) bad('not deterministic');
}
if (!(KEY_TIGHT_HALF < KEY_PARK_HALF && KEY_TIGHT_HALF >= 3)) bad('tight half-width out of range');
/* the focus' ground point projects to the box centre; a point 3 m away (any direction) stays inside half-width */
{ const d = KEY_OFFSET, L = Math.hypot(...d), up = [0, 1, 0], side = [d[1] * up[2] - d[2] * up[1], d[2] * up[0] - d[0] * up[2], d[0] * up[1] - d[1] * up[0]], sl = Math.hypot(...side);
  const sx = side.map(v => v / sl), upv = [sx[1] * d[2] - sx[2] * d[1], sx[2] * d[0] - sx[0] * d[2], sx[0] * d[1] - sx[1] * d[0]].map(v => v / L);
  for (const p of [[3, 0, 0], [0, 0, 3], [0, 2.2, 0], [-3, 0, 0], [0, 0, -3]]) { const u = Math.abs(p[0] * sx[0] + p[1] * sx[1] + p[2] * sx[2]), v = Math.abs(p[0] * upv[0] + p[1] * upv[1] + p[2] * upv[2]); if (u > KEY_TIGHT_HALF || v > KEY_TIGHT_HALF) bad(`point ${p} falls outside the tight box`); } }
console.log(`keyfit: park ±${KEY_PARK_HALF} m, tight ±${KEY_TIGHT_HALF} m`);
if (problems.length) { console.error('keyfit.check FAILED:\n' + problems.join('\n')); process.exit(1); }
console.log('keyfit.check OK');
