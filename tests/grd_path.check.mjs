/* #718 part 1: the ball of every ground-rule double over seeds 1-200 (render/grd_path.js): it starts at the engine's land point, touches the
 * ground once (the bounce on the warning track), clears the wall top (a ball that lands within GRD_MIN_GAP of the wall is already at it, so its height there is not checked), never jumps (speed <= MAX_V), and ends beyond the wall (engine FENCE_R).
 * Usage: node tests/grd_path.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const G = await import(pathToFileURL(path.join(ROOT, 'render/grd_path.js')));
const errs = [], bad = m => { if (errs.length < 20) errs.push(m); };
const DT = 1 / 60, MAX_V = 40, TOUCH_Y = G.GRD_REST_Y + 1e-3;
if (G.GRD_FENCE_R !== K.FENCE_R) bad(`GRD_FENCE_R ${G.GRD_FENCE_R} != engine FENCE_R ${K.FENCE_R}`);
let n = 0;
for (let s = 1; s <= 200; s++) {
  const g = K.simGame(s, {}, { teams: [s % 4, (s + 1) % 4] });
  for (const e of g.ev) {
    if (e.k !== 'P' || e.r !== 'inplay' || !e.play || !e.play.groundRule) continue;
    n++;
    const land = [e.play.lx, .15, e.play.lz], P = G.grdPlan(land), at = `seed ${s} t ${e.t}`;
    let prev = G.grdAt(P, 0), touches = 0, wasAir = false, over = false, maxVy = 0;
    for (let t = DT; t <= P.dur + 1; t += DT) {
      const q = G.grdAt(P, t), v = Math.hypot(q[0] - prev[0], q[1] - prev[1], q[2] - prev[2]) / DT;
      if (v > MAX_V) bad(`${at}: ball jumps ${v.toFixed(1)} m/s at +${t.toFixed(2)} s`);
      const air = q[1] > TOUCH_Y; if (wasAir && !air) touches++; wasAir = air;
      if (Math.hypot(q[0], q[2]) >= K.FENCE_R && !over) { over = true; if (q[1] < G.GRD_WALL_H && Math.hypot(...land.filter((_, i) => i !== 1)) < K.FENCE_R - G.GRD_MIN_GAP) bad(`${at}: ball crosses the wall at y ${q[1].toFixed(2)} < ${G.GRD_WALL_H}`); }
      prev = q;
    }
    if (Math.hypot(prev[0], prev[2]) <= K.FENCE_R) bad(`${at}: ball ends inside the wall`);
    if (touches > 1) bad(`${at}: ${touches} landings after the bounce, want at most 1`);
    if (!over) bad(`${at}: ball never gets over the wall`);
  }
}
if (n < 10) bad(`only ${n} ground-rule doubles in seeds 1-200`);
if (errs.length) { console.error('grd_path check FAILED:\n  ' + errs.join('\n  ')); process.exit(1); }
console.log(`grd_path check ok: ${n} ground-rule doubles, each one bounce over the wall`);
