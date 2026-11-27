/* #645: the grounder path (render/gb_path.js) on real engine grounders: every airborne piece falls at 9.81 m/s^2, the ball is at the
 * engine's land point at T (rule 12), it never sits still before the catch, never goes under the ground, and bunts are not touched. */
import { simGame } from '../engine/index.js';
import { gbPlan, gbPath, gbGlove, GB_G, GB_GROUND_Y } from '../render/gb_path.js';
import { onDirt } from '../render/dust.js';
const bad = [], ok = (c, m) => { if (!c && bad.length < 20) bad.push(m) };
const HIT0 = [0, 1, .3], DT = 1 / 240;   /* game.js HIT0 (swung bat contact point) */
let n = 0, nDirt = 0, maxAccErr = 0, maxLand = 0, minSpeed = Infinity;
for (let seed = 1; seed <= 12; seed++) for (const e of simGame(seed, {}).ev) {
  if (e.k !== 'P' || e.r !== 'inplay' || !e.play || e.play.type !== 'GB' || e.play.bunt) continue;
  const p = e.play, PL = e.plan, T = p.hang, land = [p.lx, GB_GROUND_Y, p.lz], dirt = onDirt(p.lx, p.lz), P = gbPlan(HIT0, land, T, dirt);
  n++; if (dirt) nDirt++;
  const at = t => t <= T ? gbPath(HIT0, land, T, t, dirt, P) : gbGlove(land, PL.stand, T, PL.catchT, t), tag = `seed ${seed} t ${e.t}`;
  const a0 = at(0); ok(Math.hypot(a0[0] - HIT0[0], a0[1] - HIT0[1], a0[2] - HIT0[2]) < 1e-9, `${tag}: starts at the bat`);
  ok(P.segs.length >= 2 && P.segs.length <= 4, `${tag}: ${P.segs.length} ground touches (2-4)`);
  ok(P.segs[0].vy <= 1e-9, `${tag}: leaves the bat going up`);
  for (const q of P.segs) for (let t = q.a + 2 * DT; t <= q.a + q.d - 2 * DT; t += DT) {
    const y = k => gbPath(HIT0, land, T, k, dirt, P)[1], acc = -(y(t + DT) - 2 * y(t) + y(t - DT)) / (DT * DT);
    maxAccErr = Math.max(maxAccErr, Math.abs(acc - GB_G));
  }
  const L = at(T), dl = Math.hypot(L[0] - land[0], L[1] - land[1], L[2] - land[2]); maxLand = Math.max(maxLand, dl);
  const end = PL.hit ? T : PL.catchT;
  for (let t = DT; t <= end + 1e-9; t += DT) {
    const a = at(t - DT), b = at(t), v = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / DT;
    minSpeed = Math.min(minSpeed, v);
    ok(v > 0, `${tag}: still at t ${t.toFixed(3)} (catch ${end.toFixed(3)})`);
    ok(b[1] >= GB_GROUND_Y - 1e-9, `${tag}: under the ground at t ${t.toFixed(3)}`);
  }
}
ok(n > 50 && nDirt > 0 && nDirt < n, `grounders ${n}, on dirt ${nDirt}: both surfaces must be covered`);
ok(maxAccErr <= .1, `airborne vertical acceleration off by ${maxAccErr.toFixed(3)} m/s^2 (limit .1)`);
ok(maxLand < .02, `ball ${maxLand.toFixed(4)} m from the land point at T (limit .02)`);
if (bad.length) { console.error('gb_path.check FAILED\n - ' + bad.join('\n - ')); process.exit(1) }
console.log(`gb_path.check ok (${n} grounders, ${nDirt} on dirt; accel err ${maxAccErr.toFixed(4)}, land err ${maxLand.toFixed(4)} m, min speed ${minSpeed.toFixed(2)} m/s)`);
