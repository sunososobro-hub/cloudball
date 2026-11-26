/* #43 item 5: the bunted ball's path (render/bunt_clip.js buntRoll) on the engine's bunt numbers: it keeps the engine's stop point and
 * time (rule 12), comes off the bat downward, touches the dirt within BUNT_FIRST_HOP m, never rises above its last hop, ends rolling on
 * the ground and slows down the whole way (owner 2026-11-21: "the ball looks like it floats"). */
import {buntRoll, buntRollShare, BUNT_FIRST_HOP, BUNT_HOP_H, BUNT_END_V} from '../render/bunt_clip.js';
const K = await import('../engine/constants.js'), bad = [];
const ok = (c, m) => { if (!c) bad.push(m) };
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
const G = .042, Y0 = .8;   /* ground = ball radius (game.js BUNT_GROUND_Y), bat height of a bunt at the knees-bent hold */
ok(near(buntRollShare(0), 0) && near(buntRollShare(1), 1), 'roll share runs 0 -> 1');
const [d0, dw] = K.BUNT_DIST;
for (const d of [d0, d0 + dw / 2, d0 + dw, 3]) {
  const T = d / K.BUNT_ROLL_SPEED, p0 = [0, Y0, 0], p1 = [d * .6, G, -d * .8], N = 400;
  const a = buntRoll(p0, p1, T, 0), b = buntRoll(p0, p1, T, T);
  ok(near(a[0], 0) && near(a[1], Y0) && near(a[2], 0), `d ${d}: starts at the bat`);
  ok(near(b[0], p1[0]) && near(b[1], G) && near(b[2], p1[2]), `d ${d}: at the engine's stop point at T`);
  let prevS = -1, prevV = Infinity, down = true, touch = null, maxAfter = 0, slows = true, prevY = Y0;
  for (let i = 1; i <= N; i++) {
    const t = T * i / N, q = buntRoll(p0, p1, T, t), s = Math.hypot(q[0], q[2]), v = (s - prevS) / (T / N);
    if (i > 1 && v > prevV + 1e-6) slows = false;
    /* first touch = the first sample where the ball stops falling; it must be on the dirt by then (sampling: within 1 cm) */
    if (touch === null && q[1] >= prevY - 1e-12) { if (prevY > G + .01) down = false; touch = prevS }
    if (touch !== null) maxAfter = Math.max(maxAfter, q[1] - G);
    ok(q[1] >= G - 1e-9, `d ${d}: below the ground at t ${t.toFixed(2)}`);
    prevS = s; prevV = v; prevY = q[1];
  }
  ok(down, `d ${d}: rises before the first touch (must leave the bat downward)`);
  ok(touch !== null && touch <= BUNT_FIRST_HOP + .05, `d ${d}: first touch at ${touch} m, must be within ${BUNT_FIRST_HOP} m`);
  ok(maxAfter <= Math.max(...BUNT_HOP_H) + 1e-9, `d ${d}: hops up to ${maxAfter.toFixed(3)} m after the first touch`);
  ok(slows, `d ${d}: speeds up somewhere (friction only slows it)`);
  ok(near(buntRoll(p0, p1, T, T * .5)[1], G, .05), `d ${d}: half way it is not on or near the ground (glides)`);
  const v0 = (Math.hypot(...[0, 2].map(j => buntRoll(p0, p1, T, T / N)[j]))) / (T / N);
  ok(v0 > K.BUNT_ROLL_SPEED && v0 < 2 * K.BUNT_ROLL_SPEED / (1 + BUNT_END_V) + .1, `d ${d}: speed off the bat ${v0.toFixed(1)} m/s`);
}
if (bad.length) { console.error('bunt_roll.check FAILED\n - ' + bad.join('\n - ')); process.exit(1) }
console.log('bunt_roll.check ok');
