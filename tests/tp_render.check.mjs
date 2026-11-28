/* #775: the 3D view of the 5-4-3 triple play (render/game.js). The engine plays it with moves=[] (nobody advances, rule 10); the picture
 * still shows the runners going for their bases and 3B stepping on third. This runs the two helper lines of game.js (`tpFix`, `tpStand`)
 * on real engine triple plays (seed 1131, teams [3, 0], and the other pinned seeds) and fails when
 *   - after tpFix a triple play does not have three moves, one per out, each with the out's runner, from and base, arriving at the engine's runnerAt,
 *     the runner from second going into third by a slide,
 *   - tpStand is not on the third-base bag (plan.bag3) at plan.touch3, or does not start at the fielding spot, or jumps (not monotone in time),
 *   - a move arrives after the engine's last out, or a non-triple-play event gets moves it did not have (tpFix leaves it alone).
 * Usage: node tests/tp_render.check.mjs */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as K from '../engine/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(path.join(ROOT, 'render/game.js'), 'utf8').split('\n');
const grab = name => { const l = src.find(x => x.startsWith(`const ${name}=`)); if (!l) throw new Error(`game.js has no line "const ${name}="`); return l; };
const sat01 = x => Math.max(0, Math.min(1, x)), lerp = (a, b, k) => a + (b - a) * k;
const { tpFix, tpStand } = new Function('runnerTimeline', 'sat01', 'lerp', `${grab('tpFix')}\n${grab('tpStand')}\nreturn{tpFix,tpStand}`)(K.runnerTimeline, sat01, lerp);
const errs = [], bad = m => { if (errs.length < 20) errs.push(m); };
let n = 0;
for (const s of [1131, 2273, 7269, 8463]) {
  const g = K.simGame(s, {}, { teams: [s % 4, (s + 1) % 4] });
  const before = g.ev.map(e => e.moves && e.moves.length);
  tpFix(g);
  g.ev.forEach((e, i) => {
    const at = `seed ${s} event ${i}`;
    if (!(e.play && e.play.tp)) { if ((e.moves && e.moves.length) !== before[i]) bad(`${at}: moves changed on a non-triple-play`); return; }
    n++;
    const P = e.plan, last = Math.max(...e.outs.map(o => o.at));
    if (e.moves.length !== 3 || e.outs.length !== 3) { bad(`${at}: ${e.moves.length} moves, ${e.outs.length} outs`); return; }
    e.outs.forEach((o, j) => {
      const m = e.moves[j];
      if (m[2] !== o.runner || m[0] !== o.from || m[1] !== o.base) bad(`${at}: move ${j} is ${m[0]}->${m[1]} ${m[2]}, out is ${o.from}->${o.base} ${o.runner}`);
      if (m[3].slide !== (o.base >= 2)) bad(`${at}: move ${j} slide ${m[3].slide} at base ${o.base}`);
      if (Math.abs(m[3].arriveT - o.runnerAt) > 0.02) bad(`${at}: move ${j} arrives ${m[3].arriveT.toFixed(3)}, engine runnerAt ${o.runnerAt.toFixed(3)}`);
      if (m[3].arriveT > last + 1) bad(`${at}: move ${j} arrives long after the last out`);
    });
    if (e.moves[0][0] !== 2 || e.moves[0][1] !== 3) bad(`${at}: first move is not the runner from second into third`);
    const [x0, z0] = tpStand(P.stand[0], P.stand[1], P.bag3, P.catchT, P.touch3, P.catchT);
    if (Math.hypot(x0 - P.stand[0], z0 - P.stand[1]) > 1e-9) bad(`${at}: 3B does not start where he fielded it`);
    const [x1, z1] = tpStand(P.stand[0], P.stand[1], P.bag3, P.catchT, P.touch3, P.touch3);
    if (Math.hypot(x1 - P.bag3[0], z1 - P.bag3[1]) > 1e-9) bad(`${at}: 3B is not on the bag at touch3`);
    const [x2, z2] = tpStand(P.stand[0], P.stand[1], P.bag3, P.catchT, P.touch3, P.touch3 + 1);
    if (Math.hypot(x2 - P.bag3[0], z2 - P.bag3[1]) > 1e-9) bad(`${at}: 3B leaves the bag after touch3`);
    let prev = Math.hypot(P.stand[0] - P.bag3[0], P.stand[1] - P.bag3[1]);
    for (let k = 1; k <= 20; k++) {
      const [x, z] = tpStand(P.stand[0], P.stand[1], P.bag3, P.catchT, P.touch3, P.catchT + (P.touch3 - P.catchT) * k / 20), d = Math.hypot(x - P.bag3[0], z - P.bag3[1]);
      if (d > prev + 1e-9) bad(`${at}: 3B walks away from the bag`); prev = d;
    }
  });
}
if (n < 4) bad(`only ${n} triple plays found in the pinned seeds`);
console.log(`tp_render: ${n} triple plays`);
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
console.log('OK');
