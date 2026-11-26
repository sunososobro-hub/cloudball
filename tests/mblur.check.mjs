/* Motion blur params (#211, plain Node). render/mblur.js:
 *   - off (scale 0) for weight under MB_MIN_W, NaN, no frame time, and a frame over MB_MAX_DT (a seek is a jump, not a blurred step);
 *   - the streak is frame-rate independent: velocity per frame x scale = velocity per second x exposure, for 30 / 60 / 144 fps;
 *   - scale grows with the shot weight, weight above 1 clamps, deterministic. static.mjs runs this file. Usage: node tests/mblur.check.mjs */
import { mbParams, MB_EXPOSURE_S, MB_MAX_DT, MB_MIN_W, MB_MAX_UV } from '../render/mblur.js';
const problems = [], bad = m => problems.push(m);
for (const a of [[0, 0, 1 / 60], [NaN, NaN, 1 / 60], [MB_MIN_W / 2, 0, 1 / 60], [1, 0, 0], [1, 0, -1], [1, 0, NaN], [1, 0, MB_MAX_DT * 1.01], [1, 0, 5], [undefined, undefined, 1 / 60]])
  if (mbParams(...a).scale !== 0) bad(`${JSON.stringify(a)} should be off`);
for (const fps of [30, 60, 144]) {
  const dt = 1 / fps, v = 3 /* screen units per second */, streak = v * dt * mbParams(1, 0, dt).scale;
  if (Math.abs(streak - v * MB_EXPOSURE_S) > 1e-9) bad(`streak at ${fps} fps is ${streak}, want ${v * MB_EXPOSURE_S}`);
}
let prev = 0;
for (const w of [.05, .25, .5, 1]) { const s = mbParams(w, 0, 1 / 60).scale; if (s <= prev) bad('scale does not grow with weight'); prev = s; }
if (mbParams(1.7, 0, 1 / 60).scale !== mbParams(1, 0, 1 / 60).scale) bad('weight above 1 must clamp');
if (mbParams(0, 1, 1 / 60).scale !== mbParams(1, 0, 1 / 60).scale) bad('plate weight counts like tight weight');
if (mbParams(.5, 0, 1 / 60).cap !== MB_MAX_UV) bad('cap');
if (JSON.stringify(mbParams(.6, .1, .02)) !== JSON.stringify(mbParams(.6, .1, .02))) bad('not deterministic');
console.log(`mblur: exposure ${(MB_EXPOSURE_S * 1000).toFixed(1)} ms, jump over ${MB_MAX_DT} s, cap ${MB_MAX_UV}`);
if (problems.length) { console.error('mblur.check FAILED:\n' + problems.join('\n')); process.exit(1); }
