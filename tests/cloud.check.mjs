/* Cloud shadows (#208 item 3, plain Node). render/cloud.js is run, not read:
 *   - strengthOf: clear parks (lamp .15) = 1, dusk (.7) and night (1) = 0, never outside 0..1, falls as the lamp rises
 *   - cloudAt stays inside 0..CLOUD_MAX over a field-sized grid and over a whole game of time, and is not all-clear or all-dark
 *   - same (x, z, t) = same value (a seek shows what playing there shows); the pattern drifts: the shadow at t moves by speed * dt
 * static.mjs runs this file. Usage: node tests/cloud.check.mjs */
import { CLOUD_MAX, CLOUD_SPEED, strengthOf, cloudAt } from '../render/cloud.js';

const problems = [], bad = m => { if (problems.length < 30) problems.push(m); };
if (strengthOf(.15) !== 1 || strengthOf(0) !== 1) bad('clear sky must be full strength');
if (strengthOf(.7) !== 0 || strengthOf(1) !== 0) bad('dusk and night must have no cloud shadow');
let prev = 2; for (let l = 0; l <= 1.0001; l += .05) { const s = strengthOf(l); if (s < 0 || s > 1 || s > prev + 1e-12) bad(`strengthOf(${l.toFixed(2)})=${s} not in 0..1 or not falling`); prev = s; }
let lo = 1, hi = 0, n = 0, dark = 0;
for (let t = 0; t <= 5400; t += 450) for (let x = -130; x <= 130; x += 10) for (let z = -150; z <= 40; z += 10) {
  const v = cloudAt(x, z, t); n++; if (!(v >= 0 && v <= CLOUD_MAX + 1e-12)) bad(`cloudAt out of range ${v} at ${x},${z},${t}`); lo = Math.min(lo, v); hi = Math.max(hi, v); if (v > CLOUD_MAX / 2) dark++;
  if (v !== cloudAt(x, z, t)) bad('cloudAt not deterministic');
}
if (lo > .001) bad(`never clear (min ${lo})`); if (hi < CLOUD_MAX * .9) bad(`never dark (max ${hi})`);
const share = dark / n; if (share < .1 || share > .7) bad(`shadow share ${share.toFixed(2)} outside .1-.7`);
for (const [x, z] of [[0, -20], [30, -60], [-45, -90]]) { const dt = 20; if (Math.abs(cloudAt(x, z, 100) - cloudAt(x + CLOUD_SPEED[0] * dt, z + CLOUD_SPEED[1] * dt, 100 + dt)) > 1e-9) bad('shadow does not drift with CLOUD_SPEED'); }
if (problems.length) { console.log('cloud FAIL\n' + problems.join('\n')); process.exit(1); }
console.log(`cloud ok: ${n} samples, share dark ${share.toFixed(2)}, range ${lo.toFixed(3)}..${hi.toFixed(3)}`);
