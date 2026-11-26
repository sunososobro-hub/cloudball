/* Bat boy fetches the bat (#43 item 2, plain Node). render/batboy.js is run, not read:
 *   - over real engine games, every bat let go gets a trip that starts after the bat has landed, out of the batting team's dugout
 *     (game.js dugout: team 0 on +x, [+-26, -6]) and back into it, with no jump: positions are continuous at every phase change
 *   - he holds the bat only from the middle of the pick-up on, standing next to the bat's middle
 *   - his route keeps >= .5 m from the catcher, the plate umpire (post and give-way spot), the box and BAT_FROM, and never crosses
 *     in front of the plate (the pitch line, z < 0 with |x| < 1)
 *   - same input = same output (pure in time)
 * static.mjs runs this file. Usage: node tests/batboy.check.mjs */
import { simGame } from '../engine/index.js';
import { BAT_LEN, batKind, batLand, batFlightT } from '../render/batdrop.js';
import { BOY_GO, boyPlan, boyAt } from '../render/batboy.js';

const problems = [], bad = m => { if (problems.length < 30) problems.push(m); };
const dugout = t => [(t === 0 ? 1 : -1) * 26, -6];
const AVOID = [[0, 1.3, 'catcher'], [.3, 2.6, 'plate umpire'], [2, 2.1, 'umpire give-way'], [-2, 2.1, 'umpire give-way'],
  [-.9, .15, 'right box'], [.9, .15, 'left box'], [-2.6, 1, 'BAT_FROM'], [2.6, 1, 'BAT_FROM']];
const DT = .02;
let trips = 0, longest = 0, closest = Infinity;
for (let seed = 1; seed <= 20; seed++) {
  const g = simGame(seed, {}, {});
  for (const e of g.ev) {
    const k = batKind(e); if (!k) continue;
    const side = [-1, 1][trips % 2], L = batLand(k, side), plan = boyPlan(L, dugout(e.s0.half), BAT_LEN);
    trips++; longest = Math.max(longest, plan.end);
    if (BOY_GO <= batFlightT(k, 2.5)) bad(`${k}: he sets off before the bat has landed`);
    if (boyAt(plan, BOY_GO - .01) !== null || boyAt(plan, plan.end) !== null) bad(`seed ${seed}: shown outside his trip`);
    const D = dugout(e.s0.half), a = boyAt(plan, BOY_GO), z = boyAt(plan, plan.end - 1e-6);
    if (Math.hypot(a.x - D[0], a.z - D[1]) > 1e-6 || Math.hypot(z.x - D[0], z.z - D[1]) > .01) bad(`seed ${seed}: does not start and end at his dugout`);
    let prev = null;
    for (let t = BOY_GO; t < plan.end; t += DT) {
      const s = boyAt(plan, t);
      if (JSON.stringify(s) !== JSON.stringify(boyAt(plan, t))) bad(`seed ${seed}: not pure in time`);
      if (prev && Math.hypot(s.x - prev.x, s.z - prev.z) > 6.0 * DT + 1e-6) { bad(`seed ${seed}: jumps at ${t.toFixed(2)} (${prev.phase} -> ${s.phase})`); break; }
      if (s.carry !== (t >= plan.tPick)) bad(`seed ${seed}: carry wrong at ${t.toFixed(2)}`);
      if (s.carry && s.phase === 'out') bad(`seed ${seed}: carries the bat before picking it up`);
      if (s.phase !== 'pick') {
        for (const [ax, az, who] of AVOID) { const d = Math.hypot(s.x - ax, s.z - az); closest = Math.min(closest, d); if (d < .5) { bad(`seed ${seed}: ${d.toFixed(2)} m from the ${who} at ${t.toFixed(2)}`); break; } }
        if (s.z < 0 && Math.abs(s.x) < 1) bad(`seed ${seed}: crosses the pitch line at ${t.toFixed(2)}`);
      }
      prev = s;
    }
    const pk = boyAt(plan, plan.tPick), d = Math.hypot(pk.x - plan.bat[0], pk.z - plan.bat[1]);
    if (d > .6) bad(`seed ${seed}: picks the bat up from ${d.toFixed(2)} m`);
    if (!(pk.bend > .9)) bad(`seed ${seed}: does not bend for the bat`);
  }
}
if (!trips) bad('no bat was let go in 20 games');
if (problems.length) { console.log('batboy FAIL\n' + problems.join('\n')); process.exit(1); }
console.log(`batboy ok: 20 games, ${trips} trips, longest ${longest.toFixed(1)} s after release, closest pass ${closest.toFixed(2)} m`);
