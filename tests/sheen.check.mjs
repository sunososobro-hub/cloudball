/* Damp night sheen (#208 item 3, plain Node). render/sheen.js is run, not read:
 *   - sheenStrength: clear (lamp .15) and dusk (.5) = 0, night (1) = 1, never outside 0..1, rises with the lamp
 *   - sheenAt stays inside 0..SHEEN_MAX over a field-sized grid and a whole game of time, and is neither all-dry nor all-wet
 *   - same (x, z, t) = same value (a seek shows what playing there shows)
 * static.mjs runs this file. Usage: node tests/sheen.check.mjs */
import { SHEEN_MAX, sheenStrength, sheenAt } from '../render/sheen.js';

const problems = [], bad = m => { if (problems.length < 30) problems.push(m); };
if (sheenStrength(.15) !== 0 || sheenStrength(.5) !== 0) bad('clear and dusk skies must have no sheen');
if (sheenStrength(1) !== 1) bad('night must be full strength');
let prev = -1; for (let l = 0; l <= 1.0001; l += .05) { const s = sheenStrength(l); if (s < 0 || s > 1 || s < prev - 1e-12) bad(`sheenStrength(${l.toFixed(2)})=${s} not in 0..1 or not rising`); prev = s; }
let lo = 1, hi = 0, n = 0, wet = 0;
for (let t = 0; t <= 5400; t += 450) for (let x = -130; x <= 130; x += 10) for (let z = -150; z <= 40; z += 10) {
  const v = sheenAt(x, z, t); n++; if (!(v >= 0 && v <= SHEEN_MAX + 1e-12)) bad(`sheenAt out of range ${v} at ${x},${z},${t}`); lo = Math.min(lo, v); hi = Math.max(hi, v); if (v > SHEEN_MAX / 2) wet++;
  if (v !== sheenAt(x, z, t)) bad('sheenAt not deterministic');
}
if (lo > .001) bad(`never dry (min ${lo})`); if (hi < SHEEN_MAX * .9) bad(`never wet (max ${hi})`);
const share = wet / n; if (share < .1 || share > .7) bad(`wet share ${share.toFixed(2)} outside .1-.7`);
if (sheenAt(10, -30, 0) === sheenAt(10, -30, 600)) bad('sheen does not shimmer with time');
if (problems.length) { console.log('sheen FAIL\n' + problems.join('\n')); process.exit(1); }
console.log(`sheen ok: ${n} samples, share wet ${share.toFixed(2)}, range ${lo.toFixed(3)}..${hi.toFixed(3)}`);
