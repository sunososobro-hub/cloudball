/* Motion blur params (#211, plain Node). render/motionblur.js:
 *   - no shot (weights 0 / NaN / below MB_MIN_W) gives scale 0, and scale 0 gives a zero blur vector (pass-through)
 *   - scale grows with the shot weight, never above the full-weight value; either shot switches it on
 *   - a fast pixel is clamped to MB_MAX_UV, direction kept; a slow one is not touched; bad input gives 0
 *   - deterministic. static.mjs runs this file. Usage: node tests/motionblur.check.mjs */
import { mbScale, mbVec, MB_SHUTTER, MB_MAX_UV, MB_SAMPLES, MB_MIN_W } from '../render/motionblur.js';
const problems = [], bad = m => problems.push(m);
for (const a of [[0, 0], [NaN, NaN], [MB_MIN_W / 2, 0], [undefined, undefined], [-1, -1]]) if (mbScale(...a) !== 0) bad(`${JSON.stringify(a)} should be off`);
let prev = -1;
for (const w of [.05, .25, .5, .75, 1]) { const k = mbScale(w, 0); if (k <= prev) bad('scale does not grow with weight'); prev = k; }
const full = .5 * MB_SHUTTER;
if (mbScale(1, 0) !== full || mbScale(0, 1) !== full) bad('full weight of either shot must give the full scale');
if (mbScale(3, 0) !== full) bad('weight above 1 must clamp');
if (mbScale(.4, .8) !== mbScale(0, .8)) bad('the stronger shot decides');
{ const [x, y] = mbVec(.8, -.6, 0); if (x !== 0 || y !== 0) bad('scale 0 must give a zero vector'); }
{ const [x, y] = mbVec(.01, .02, full); if (Math.abs(x - .01 * full) > 1e-12 || Math.abs(y - .02 * full) > 1e-12) bad('slow pixel must pass unclamped'); }
{ const [x, y] = mbVec(1.5, -2, full); if (Math.abs(Math.hypot(x, y) - MB_MAX_UV) > 1e-9) bad('fast pixel must clamp to MB_MAX_UV'); if (Math.sign(x) !== 1 || Math.sign(y) !== -1 || Math.abs(y / x + 4 / 3) > 1e-9) bad('clamp must keep the direction'); }
for (const a of [[NaN, 0, 1], [0, Infinity, 1], [1, 1, NaN]]) { const r = mbVec(...a); if (r[0] !== 0 || r[1] !== 0) bad(`${JSON.stringify(a)} should give a zero vector`); }
if (JSON.stringify([mbScale(.6, .1), mbVec(.5, .5, .25)]) !== JSON.stringify([mbScale(.6, .1), mbVec(.5, .5, .25)])) bad('not deterministic');
if (!(MB_SHUTTER > 0 && MB_SHUTTER <= 1 && MB_MAX_UV > 0 && MB_SAMPLES >= 2 && Number.isInteger(MB_SAMPLES))) bad('constants out of range');
import { readFileSync } from 'node:fs';
if (!readFileSync(new URL('../render/game.js', import.meta.url), 'utf8').includes(`const MB_TAPS=${MB_SAMPLES};`)) bad('game.js MB_TAPS must equal MB_SAMPLES');
console.log(`motionblur: shutter ${MB_SHUTTER}, max ${MB_MAX_UV} of the screen, ${MB_SAMPLES} samples`);
if (problems.length) { console.error('motionblur.check FAILED:\n' + problems.join('\n')); process.exit(1); }
console.log('motionblur.check OK');
