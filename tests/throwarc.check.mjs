/* #647: a throw is a gravity parabola over its flight time TT (peak above the chord = g*TT^2/8), from game.js's own arc()/throwPeak().
 * Checks (pure, 40 seeds): vertical accel of the drawn arc = g (+-2%), arrival at the target, no dip under the ground. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { simGame } from '../engine/index.js';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(path.join(ROOT, 'render/game.js'), 'utf8'), a = src.indexOf('function arc('), b = src.indexOf('/* ---------- Fielding');
const lerp = (x, y, t) => x + (y - x) * t, { arc, throwPeak } = new Function('lerp', src.slice(a, b) + ';return{arc,throwPeak}')(lerp);
const G = 9.81; let n = 0, bad = 0, minY = Infinity, worst = 0;
for (let seed = 1; seed <= 40; seed++) for (const e of simGame(seed, {}).ev) {
  const PL = e.plan; if (e.k !== 'P' || !PL || !(PL.TT > 0) || !isFinite(PL.t0) || !(PL.TD > 0)) continue;
  for (const [rel, tgt] of [[[0, 1.5, 0], [0, 1.4, PL.TD]], [[0, 1.5, 0], [0, .15, PL.TD]]]) {
    const pk = throwPeak(PL.TT), dt = PL.TT / 240, y = t => arc(rel, tgt, pk, t / PL.TT)[1];
    const acc = -(y(PL.TT / 2 + dt) - 2 * y(PL.TT / 2) + y(PL.TT / 2 - dt)) / (dt * dt) / G; n++;
    worst = Math.max(worst, Math.abs(acc - 1)); if (Math.abs(acc - 1) > .02) bad++;
    const end = arc(rel, tgt, pk, 1); if (Math.hypot(end[0] - tgt[0], end[1] - tgt[1], end[2] - tgt[2]) > .02) bad++;
    for (let i = 0; i <= 120; i++) minY = Math.min(minY, y(PL.TT * i / 120));
  }
}
console.log(`throwarc: ${n} throws, worst |a/g-1| ${worst.toFixed(4)}, min y ${minY.toFixed(2)} m`);
if (!n || bad || minY <= .1) { console.error('FAIL throwarc'); process.exit(1) }
console.log('ok throwarc');
