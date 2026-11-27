/* #648: batted-ball exit speed. render/game.js flyPath (sliced out and run as is, like render/tools/phys_audit.mjs) must keep every solved exit
 * velocity <= EV_MAX (197 km/h, the hardest tracked ball), land within .01 m of the engine's point at T (rule 12), leave balls already under EV_MAX
 * on the old Cd .33 path, and never dip under the ground on the way. Pure check on real engine balls. */
import { readFileSync } from 'node:fs';
import { simGame } from '../engine/index.js';
const src = readFileSync(new URL('../render/game.js', import.meta.url), 'utf8'), a = src.indexOf('const CD_MAX='), b = src.indexOf('\n', src.indexOf('return t=>', a));
const lerp = (x, y, t) => x + (y - x) * t, clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const mk = new Function('lerp', 'clamp', src.slice(a, b) + '\nreturn {flyPath,flyCache,EV_MAX,CD_MAX}');
const M = mk(lerp, clamp), HIT0 = [0, 1, .3], bad = [], ok = (c, m) => { if (!c && bad.length < 20) bad.push(m) };
let n = 0, capped = 0, kept = 0, maxMiss = 0, maxEV = 0;
for (let seed = 1; seed <= 20; seed++) for (const e of simGame(seed, {}).ev) {
  if (e.k !== 'P' || e.r !== 'inplay' || !e.play || e.play.bunt || e.play.type === 'GB') continue;
  const p = e.play, PL = e.plan, T = p.hang, hr = p.res === 'HR', land = [p.lx, hr ? 6 + (p.dist - 114) * .15 : PL.hit ? .15 : 1.5, p.lz], ev = { t: seed * 1e5 + e.t };
  const f = M.flyPath(ev, HIT0, land, T), tab = M.flyCache.get(ev.t), sp = Math.hypot(...tab.v0), tag = `seed ${seed} t ${e.t}`;
  n++; maxEV = Math.max(maxEV, sp);
  ok(sp <= M.EV_MAX + 1e-9, `${tag}: exit ${(sp * 3.6).toFixed(1)} km/h over EV_MAX`);
  const L = f(T), miss = Math.hypot(L[0] - land[0], L[1] - land[1], L[2] - land[2]); maxMiss = Math.max(maxMiss, miss);
  ok(miss <= .01 + 1e-9, `${tag}: lands ${miss.toFixed(4)} m off`);
  if (tab.cd < M.CD_MAX) capped++; else kept++;
  ok(tab.cd >= 0 && tab.cd <= M.CD_MAX, `${tag}: cd ${tab.cd} outside [0, ${M.CD_MAX}]`);
  for (let t = 0; t <= T; t += 1 / 60) ok(f(t)[1] > -.01, `${tag}: under the ground at t ${t.toFixed(2)}`);
}
ok(n > 100 && capped > 0 && kept > 0, `air balls ${n}, capped ${capped}, untouched ${kept}: both cases must be covered`);
if (bad.length) { console.error('FAIL fly_ev.check:\n' + bad.join('\n')); process.exit(1) }
console.log(`fly_ev.check OK: ${n} air balls (${capped} drag-reduced, ${kept} untouched), max exit ${(maxEV * 3.6).toFixed(1)} km/h, max landing miss ${maxMiss.toFixed(4)} m`);
