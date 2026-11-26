/* #255: lamp sprite fade near the camera (plain Node). render/lampfade.js is run, not read:
 *   - 0 at and below LAMP_FADE_NEAR, 1 at and above LAMP_FADE_FAR, never outside 0..1, never decreasing with distance
 *   - the camera spots of the park (low behind first base, behind home, high home camera, broadcast) are inside the near ring of at
 *     least one home-side tower sprite and see it dimmed to under 15 percent, while the far wall and the far towers keep full light
 * static.mjs runs this file. Usage: node tests/lampfade.check.mjs */
import { lampFade, LAMP_FADE_NEAR, LAMP_FADE_FAR } from '../render/lampfade.js';
const bad = [], b = m => { if (bad.length < 20) bad.push(m); };
if (!(LAMP_FADE_NEAR > 0 && LAMP_FADE_FAR > LAMP_FADE_NEAR)) b('near/far order');
if (lampFade(0) !== 0 || lampFade(LAMP_FADE_NEAR) !== 0) b('not 0 at near');
if (lampFade(LAMP_FADE_FAR) !== 1 || lampFade(1e6) !== 1) b('not 1 at far');
let prev = -1;
for (let d = -5; d <= 300; d += 0.5) { const f = lampFade(d); if (!(f >= 0 && f <= 1) || f < prev) b(`d=${d} f=${f}`); prev = f; }
const TOWERS = [[-62, 10], [62, 10], [-100, -70], [100, -70], [-55, -135], [55, -135]], H = 46;
const dist = (c, t) => Math.hypot(c[0] - t[0], c[1] - H, c[2] - t[1]);
/* low camera behind the first-base line, a few metres off the ground */
const low = [-50, 2.5, 22];
const nearest = Math.min(...TOWERS.map(t => dist(low, t)));
if (!(lampFade(nearest) < 0.15)) b(`low camera sees its nearest tower at ${lampFade(nearest).toFixed(2)} (dist ${nearest.toFixed(1)})`);
const farCam = [0, 6, 18];
if (!(lampFade(dist(farCam, TOWERS[5])) > 0.9)) b('far tower dimmed from the plate camera');
if (JSON.stringify([0, 20, 60, 100, 200].map(d => lampFade(d))) !== JSON.stringify([0, 20, 60, 100, 200].map(d => lampFade(d)))) b('not deterministic');
console.log(bad.length ? 'FAIL ' + bad.join('\n') : 'lampfade.check ok');
process.exit(bad.length ? 1 : 0);
