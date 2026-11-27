/* Ball kids at the foul lines (#612 part 6, plain Node). render/ballkid.js is run, not read:
 *   - one post per foul line, mirrored (x opposite, same z), in foul ground (outside the 45-degree line) and behind the base
 *   - at least 3 m from the base umpire's post, the base coach's box, both dugouts' fronts and the bullpen benches
 *   - faces the plate (unit vector pointing from the post to home)
 * static.mjs runs this file. Usage: node tests/ballkid.check.mjs */
import { kidPost, kidFace, kidAt, kidTrip, restSpot, KID_S, KID_D, KID_RUN_V, KID_JOG_V } from '../render/ballkid.js';
import { PEN_BENCH, penWorld } from '../render/pen.js';

const problems = [], bad = m => problems.push(m), R2 = Math.SQRT1_2;
const line = (side, s, d) => [side * (s + d) * R2, (d - s) * R2];
const [a, b] = [kidPost(1), kidPost(-1)];
if (Math.abs(a[0] + b[0]) > 1e-9 || Math.abs(a[1] - b[1]) > 1e-9) bad(`posts are not mirrored: ${a} / ${b}`);
if (!(KID_D > 0)) bad('post is not in foul ground');
if (!(KID_S > 27.43)) bad('post is not past the base');
for (const side of [1, -1]) {
  const P = kidPost(side), clear = (name, q, m) => { const d = Math.hypot(P[0] - q[0], P[1] - q[1]); if (d < m) bad(`side ${side}: ${d.toFixed(1)} m from ${name} (< ${m})`); };
  clear('base umpire post', line(side, 32, 1.2), 3);
  clear('coach box', line(side, 24, 5.5), 3);
  clear('dugout', [side * 26, -6], 3);
  for (const pb of PEN_BENCH) clear('pen bench', penWorld(side, pb[0], pb[1]), 3);
  const f = kidFace(side), L = Math.hypot(f[0], f[1]);
  if (Math.abs(L - 1) > 1e-9) bad(`side ${side}: facing is not a unit vector`);
  if (f[0] * -P[0] + f[1] * -P[1] <= 0) bad(`side ${side}: not facing the plate`);
}
/* part 7: the fetch trip (kidAt is run, not read): starts and ends idle at the post, never faster than the sprint, never jumps, touches the rest spot,
 * the ball is in his hand only from the pick-up on. */
for (const side of [1, -1]) {
  const T = kidTrip(side), E = restSpot(side), P = kidPost(side), STEP = .02;
  let prev = kidAt(side, 0), touched = false, held = 0;
  if (prev.k !== 'idle') bad(`side ${side}: not idle before the trip`);
  for (let t = STEP; t < T.tEnd + 2; t += STEP) {
    const a = kidAt(side, t), v = Math.hypot(a.x - prev.x, a.z - prev.z) / STEP;
    if (v > KID_RUN_V + .01) bad(`side ${side}: speed ${v.toFixed(2)} m/s at ${t.toFixed(2)}`);
    if (a.k === 'back' && v > KID_JOG_V + .01) bad(`side ${side}: jog back too fast ${v.toFixed(2)}`);
    if (Math.hypot(a.x - E[0], a.z - E[1]) < .05) touched = true;
    if (a.ball) { held++; if (t < T.tPick - .3) bad(`side ${side}: ball in hand before the pick-up at ${t.toFixed(2)}`); }
    prev = a;
  }
  if (!touched) bad(`side ${side}: never reaches the ball`);
  if (!held) bad(`side ${side}: never holds the ball`);
  if (prev.k !== 'idle' || Math.hypot(prev.x - P[0], prev.z - P[1]) > 1e-9) bad(`side ${side}: not back at his post`);
}
if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
console.log('ballkid ok');
