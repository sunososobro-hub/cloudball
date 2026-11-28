/* #739: the ball of every dropped infield fly over SEEDS seeds (render/iffdrop.js on real engine plans). Fails when
 *   - a plan with `drop` gets no drop path, or a plan without it gets one,
 *   - the ball is not at the engine's land point (glove height) when it comes down at dropAt,
 *   - it does not touch the ground before the pick-up at catchT, goes below the ground, or falls at other than g,
 *   - it lies farther than REACH from where the fielder stands (he picks it up without moving),
 *   - the path is drawn outside [dropAt, catchT) or dropPlan changes the plan (the frame length stays the engine's),
 *   - a runner other than the batter has a move on it (the runners hold their bases).
 * static.mjs runs this file. Usage: node tests/iffdrop.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const D = await import(pathToFileURL(path.join(ROOT, 'render/iffdrop.js')));
const SEEDS = 1200, REACH = 1, EPS = 1e-6, DT = 1 / 120;
/* #794 part 5 (engine 0.4.38) left no dropped infield fly in seeds 1..SEEDS: pinned seeds with one each (same as iff.check). */
const DROP_SEEDS = [2633, 2800];
const errs = [], bad = m => { if (errs.length < 20) errs.push(m); };

let drops = 0, others = 0, maxAcc = 0;
for (const s of [...Array.from({ length: SEEDS }, (_, i) => i + 1), ...DROP_SEEDS]) {
  const g = K.simGame(s, {}, { teams: [s % 4, (s + 1) % 4] });
  g.ev.forEach((e, i) => {
    if (e.k !== 'P' || e.r !== 'inplay' || !e.plan) return;
    const at = `seed ${s} frame ${i}`, before = JSON.stringify(e.plan), P = D.dropPlan(e);
    if (JSON.stringify(e.plan) !== before) bad(`${at}: dropPlan changed the plan`);
    if (!e.plan.drop) { others++; if (P) bad(`${at}: drop path on a plan without drop`); return; }
    drops++;
    if (!P) { bad(`${at}: no drop path`); return; }
    if (D.dropAt(P, e.plan.dropAt - DT) || D.dropAt(P, e.plan.catchT)) bad(`${at}: ball drawn outside [dropAt, catchT)`);
    const b0 = D.dropAt(P, e.plan.dropAt);
    if (!b0 || Math.hypot(b0[0] - e.play.lx, b0[2] - e.play.lz) > EPS || Math.abs(b0[1] - D.DROP_GLOVE_Y) > EPS) bad(`${at}: not at the land point when it comes down`);
    let ground = Infinity, prev = [], low = Infinity;
    for (let u = e.plan.dropAt; u < e.plan.catchT; u += DT) {
      const b = D.dropAt(P, u);
      if (!b) { bad(`${at}: no ball at ${u.toFixed(3)}`); break; }
      low = Math.min(low, b[1]);
      if (b[1] <= D.DROP_REST_Y + EPS && ground === Infinity) ground = u;
      if (ground !== Infinity && b[1] > D.DROP_REST_Y + EPS) bad(`${at}: ball off the ground again at ${u.toFixed(3)}`);
      prev.push(b);
      if (prev.length === 3) {
        if (prev[2][1] > D.DROP_REST_Y + EPS) maxAcc = Math.max(maxAcc, Math.abs((prev[2][1] - 2 * prev[1][1] + prev[0][1]) / DT / DT + D.DROP_G));
        prev.shift();
      }
    }
    if (!(ground < e.plan.catchT)) bad(`${at}: the ball never touches the ground before the pick-up`);
    if (low < D.DROP_REST_Y - EPS) bad(`${at}: ball below the ground (${low.toFixed(3)})`);
    const last = D.dropAt(P, e.plan.catchT - EPS), far = last && Math.hypot(last[0] - e.plan.stand[0], last[2] - e.plan.stand[1]);
    if (!(far <= REACH)) bad(`${at}: ball lies ${far?.toFixed(2)} m from the fielder (> ${REACH})`);
    if ((e.moves || []).some(m => m[0] !== 0)) bad(`${at}: a runner moves on a dropped infield fly`);
  });
}
if (!drops) bad(`no dropped infield fly in ${SEEDS} seeds + pinned seeds ${DROP_SEEDS}`);
if (maxAcc > .5) bad(`ball off the glove falls at g +- ${maxAcc.toFixed(3)} m/s^2`);
console.log(`iffdrop: ${drops} dropped infield flies in ${SEEDS} seeds, ${others} other in-play plans without a path; accel err ${maxAcc.toFixed(4)}`);
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
console.log('OK');
