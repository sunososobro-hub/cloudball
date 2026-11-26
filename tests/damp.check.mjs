/* Damp night sheen (#208 item 3, part 6, plain Node). render/damp.js is run, not read:
 *   - strengthOf: night (lamp 1) = 1, dusk (.7) = a little, clear parks (.15) and 0 = 0, never outside 0..1, rises with the lamp
 *   - fairMask: 0 behind home and outside the foul lines and far past the wall, 1 on the grass in front of home
 *   - dampAt stays inside 0..DAMP_MAX over a field-sized grid, is 0 off the fair ground, is neither all-dry nor all-wet, and is deterministic
 * static.mjs runs this file. Usage: node tests/damp.check.mjs */
import { DAMP_MAX, strengthOf, fairMask, dampAt } from '../render/damp.js';

const problems = [], bad = m => { if (problems.length < 30) problems.push(m); };
if (strengthOf(1) !== 1) bad('night must be full strength');
if (strengthOf(.15) !== 0 || strengthOf(0) !== 0) bad('clear day parks must have no sheen');
{ const d = strengthOf(.7); if (!(d > 0 && d < 1)) bad(`dusk strength ${d} must be between 0 and 1`); }
let prev = -1; for (let l = 0; l <= 1.0001; l += .05) { const s = strengthOf(l); if (s < 0 || s > 1 || s < prev - 1e-12) bad(`strengthOf(${l.toFixed(2)})=${s} not in 0..1 or not rising`); prev = s; }
if (fairMask(0, 10) !== 0 || fairMask(-60, -10) !== 0 || fairMask(0, -200) !== 0) bad('mask must be 0 behind home, outside the foul lines and past the wall');
if (fairMask(0, -50) !== 1) bad('mask must be 1 on the fair grass');
let lo = 1, hi = 0, n = 0, wet = 0;
for (let x = -130; x <= 130; x += 5) for (let z = -150; z <= 40; z += 5) {
  const v = dampAt(x, z); if (!(v >= 0 && v <= DAMP_MAX + 1e-12)) bad(`dampAt out of range ${v} at ${x},${z}`);
  if (v !== dampAt(x, z)) bad('dampAt not deterministic');
  if (fairMask(x, z) === 0 && v !== 0) bad(`sheen off the fair ground at ${x},${z}`);
  if (fairMask(x, z) === 1) { n++; lo = Math.min(lo, v); hi = Math.max(hi, v); if (v > DAMP_MAX / 2) wet++; }
}
if (lo > .001) bad(`never dry on the fair grass (min ${lo})`); if (hi < DAMP_MAX * .9) bad(`never wet (max ${hi})`);
const share = wet / n; if (share < .1 || share > .7) bad(`wet share ${share.toFixed(2)} outside .1-.7`);
if (problems.length) { console.log('damp FAIL\n' + problems.join('\n')); process.exit(1); }
console.log(`damp ok: ${n} fair-grass samples, wet share ${share.toFixed(2)}, range ${lo.toFixed(3)}..${hi.toFixed(3)}`);
