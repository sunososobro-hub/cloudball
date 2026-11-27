/* Ball kids at the foul lines (#612 part 6, plain Node). render/ballkid.js is run, not read:
 *   - one post per foul line, mirrored (x opposite, same z), in foul ground (outside the 45-degree line) and behind the base
 *   - at least 3 m from the base umpire's post, the base coach's box, both dugouts' fronts and the bullpen benches
 *   - faces the plate (unit vector pointing from the post to home)
 * static.mjs runs this file. Usage: node tests/ballkid.check.mjs */
import { kidPost, kidFace, KID_S, KID_D, KID_RUN_V, kidAt, kidHold, kidTrips, kidBall } from '../render/ballkid.js';
import { simGame, ARRIVE } from '../engine/index.js';
import { FB_T, FB_ROLL_T } from '../render/foul_bunt.js';
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
/* part 7: the fetch of a foul bunt, over real games. The kid never jumps (event boundaries included), never runs faster than KID_RUN_V,
 * is at the ball when it leaves the picture, and is back at his post when the trip ends. */
const SEEDS = 150, STEP = .25;
let trips = 0, taken = 0, skipped = 0;
for (let seed = 1; seed <= SEEDS; seed++) {
  const ev = simGame(seed).ev;
  for (const side of [1, -1]) {
    let prev = null;
    for (let ei = 0; ei < ev.length; ei++) {
      const e = ev[ei], d = e.k === "END" || !Number.isFinite(e.d) ? 0 : Math.min(e.d, 130);
      for (let u = 0; u <= d + 1e-9; u += STEP) {
        const a = kidAt(side, ev, ei, u, ARRIVE), P = a ? [a.x, a.z] : kidPost(side);
        if (prev) { const v = Math.hypot(P[0] - prev.p[0], P[1] - prev.p[1]) / (ev[ei].t + u - prev.T || 1); if (ev[ei].t + u > prev.T && v > KID_RUN_V + .01) bad(`seed ${seed} side ${side} ei ${ei} u ${u.toFixed(2)}: kid moves ${v.toFixed(1)} m/s`); }
        prev = { p: P, T: e.t + u };
      }
      if (e.k === 'P' && e.r === 'foul' && e.bunt && e.foulDir === side) {
        trips++;
        const h = kidHold(ev, ei, ARRIVE);
        if (h === undefined) { skipped++; continue; }
        taken++;
        const a = kidAt(side, ev, ei, h + ARRIVE, ARRIVE), B = kidBall(side);
        if (!a || Math.hypot(a.x - B[0], a.z - B[1]) > .05) bad(`seed ${seed} ei ${ei}: kid is not at the ball when it is picked up`);
        if (h <= FB_T + FB_ROLL_T) bad(`seed ${seed} ei ${ei}: picked up (${h.toFixed(2)} s) before the ball rests`);
        const tr = kidTrips(ev, ei, side, ARRIVE).find(q => q.ei === ei);
        const z = kidAt(side, ev, ei, tr.te - e.t - .01, ARRIVE), Q = kidPost(side);
        if (!z || Math.hypot(z.x - Q[0], z.z - Q[1]) > .1) bad(`seed ${seed} ei ${ei}: trip does not end at the post`);
      }
    }
  }
}
if (!taken) bad(`no foul bunt was fetched in ${SEEDS} games: nothing was checked`);
if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
console.log(`ballkid ok: ${trips} foul bunts on a kid's side, ${taken} fetched, ${skipped} left (kid still away)`);
