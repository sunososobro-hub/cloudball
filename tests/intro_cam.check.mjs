/* #73: the camera under the entry card (render/intro_cam.js, plain Node). Deterministic, periodic, always high and aimed down-field
 * (toward the outfield stands, never at the plate area), inside the park, and moving slowly (no whip pan).
 * static.mjs runs this file. Usage: node tests/intro_cam.check.mjs */
import { introShot, INTRO_PERIOD_S, INTRO_X, INTRO_Y, INTRO_Z, INTRO_FOV } from '../render/intro_cam.js';
const bad = [], b = m => { if (bad.length < 20) bad.push(m); };
const MAX_SPEED = 3, MAX_TURN = 0.05; /* m/s of the camera, rad/s of the yaw */
let prev = null, n = 0;
for (let t = 0; t <= INTRO_PERIOD_S * 2; t += 0.25, n++) {
  const c = introShot(t);
  if (JSON.stringify(c) !== JSON.stringify(introShot(t))) b(`t=${t} not deterministic`);
  if (Math.abs(c.x) > INTRO_X + 1e-9 || c.y !== INTRO_Y || c.z !== INTRO_Z) b(`t=${t} camera left its box`);
  const dz = c.tz - c.z, dy = c.ty - c.y, dx = c.tx - c.x;
  if (!(dz < -40)) b(`t=${t} not aimed down-field (dz ${dz})`);
  const pitch = Math.atan2(dy, Math.hypot(dx, dz));
  if (pitch > 0 || pitch < -0.6) b(`t=${t} pitch ${pitch.toFixed(2)} outside [-0.6, 0]`);
  if (c.fov < 40 || c.fov > 75 || c.fov !== INTRO_FOV) b(`t=${t} fov ${c.fov}`);
  const yaw = Math.atan2(-dx, -dz);
  if (prev) {
    const sp = Math.abs(c.x - prev.c.x) / 0.25, tu = Math.abs(yaw - prev.yaw) / 0.25;
    if (sp > MAX_SPEED) b(`t=${t} camera speed ${sp.toFixed(2)} m/s`);
    if (tu > MAX_TURN) b(`t=${t} yaw rate ${tu.toFixed(3)} rad/s`);
  }
  prev = { c, yaw };
}
const a = introShot(3), z = introShot(3 + INTRO_PERIOD_S);
if (Math.abs(a.x - z.x) > 1e-9 || Math.abs(a.tx - z.tx) > 1e-9) b('not periodic');
if (bad.length) { console.error('intro_cam.check FAILED\n' + bad.join('\n')); process.exit(1); }
console.log(`intro_cam.check ok (${n} samples)`);
