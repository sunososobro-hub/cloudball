/* #643: pitch release time from the shown km/h (render/pitchtime.js), plain Node over real engine games. The module is run, not read:
 *   - implied km/h (dist / (ARRIVE - release)) is within 2 km/h of the shown one for every pitch of seeds 1..20 (p95) and 4 at worst
 *   - the slowest and fastest pitch of seed 704 leave earlier / later than RELEASE, inside the clamp, and the ball is at the plate at ARRIVE
 *   - pitchU: the clip's release frame (RELEASE) lands exactly on the ball's release time, continuous, monotone, identity from PT_TAIL on
 * Usage: node tests/pitchtime.check.mjs */
import { simGame, RELEASE, ARRIVE } from '../engine/index.js';
import { pitchRelease, pitchU, PT_EARLY, PT_LATE, PT_TAIL } from '../render/pitchtime.js';
const problems = [], bad = m => { if (problems.length < 30) problems.push(m); };
const REL = [0, 1.8, -16.8], dist = e => Math.hypot(e.zx - REL[0], .45 + e.zy * .75 - REL[1], .6 - REL[2]);
const err = [], at704 = [];
for (let seed = 1; seed <= 20; seed++) for (const e of simGame(seed, {}).ev) {
  if (e.k !== 'P' || !e.kmh) continue;
  const d = dist(e), t = pitchRelease(d, e.kmh, RELEASE, ARRIVE);
  if (t < RELEASE - PT_EARLY - 1e-9 || t > RELEASE + PT_LATE + 1e-9) bad(`seed ${seed} t ${e.t}: release ${t} outside clamp`);
  err.push(Math.abs(d / (ARRIVE - t) * 3.6 - e.kmh));
}
for (const e of simGame(704, {}).ev) if (e.k === 'P' && e.kmh) at704.push(e);
at704.sort((a, b) => a.kmh - b.kmh);
const slow = at704[0], fast = at704[at704.length - 1];
const ts = pitchRelease(dist(slow), slow.kmh, RELEASE, ARRIVE), tf = pitchRelease(dist(fast), fast.kmh, RELEASE, ARRIVE);
if (!(ts < RELEASE)) bad(`slowest ${slow.kmh} km/h should leave before RELEASE, got ${ts}`);
if (!(tf > RELEASE)) bad(`fastest ${fast.kmh} km/h should leave after RELEASE, got ${tf}`);
err.sort((a, b) => a - b);
if (err[Math.floor(err.length * .95)] > 2) bad(`p95 implied-shown ${err[Math.floor(err.length * .95)]} > 2`);
if (err[err.length - 1] > 4) bad(`worst implied-shown ${err[err.length - 1]} > 4`);
for (const tR of [RELEASE - PT_EARLY, RELEASE - .1, RELEASE, RELEASE + .06, RELEASE + PT_LATE]) {
  if (Math.abs(pitchU(tR, tR, RELEASE) - RELEASE) > 1e-12) bad(`clip release frame not on ${tR}`);
  let prev = -1;
  for (let u = 0; u <= 5; u += .01) {
    const v = pitchU(u, tR, RELEASE);
    if (v < prev - 1e-12) bad(`pitchU not monotone at ${u} (tR ${tR})`);
    if (prev >= 0 && Math.abs(v - prev) > .03) bad(`pitchU jumps at ${u} (tR ${tR})`);
    if (u >= PT_TAIL && Math.abs(v - u) > 1e-12) bad(`pitchU not identity at ${u} (tR ${tR})`);
    prev = v;
  }
  if (Math.abs(pitchU(0, tR, RELEASE)) > 1e-12) bad(`pitchU(0) != 0 (tR ${tR})`);
}
if (pitchRelease(0, 140, RELEASE, ARRIVE) !== RELEASE || pitchRelease(17, 0, RELEASE, ARRIVE) !== RELEASE) bad('no data must give RELEASE');
if (problems.length) { console.error('pitchtime.check FAIL\n' + problems.join('\n')); process.exit(1); }
console.log(`pitchtime.check ok (${err.length} pitches, p95 ${err[Math.floor(err.length * .95)].toFixed(2)} km/h, slow ${slow.kmh} -> ${ts.toFixed(3)}, fast ${fast.kmh} -> ${tf.toFixed(3)})`);
