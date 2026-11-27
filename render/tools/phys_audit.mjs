/* #638 step 1: ball-physics audit of what the renderer draws, from the engine stream alone (plain Node, no browser, no GPU).
 *   node render/tools/phys_audit.mjs [seeds=40]
 * flyPath (batted air balls) is sliced out of render/game.js and run as is; the pitch, grounder, roll and throw lines
 * mirror the one-line formulas in game.js (ball code after `if(u<RELEASE||e.bk)` and in the `e.r==='inplay'` block):
 * a fix PR that changes one of them updates its mirror here in the same PR and puts the before/after numbers in its body.
 * The pitch release point is an estimate (REL_Z, REL_Y: rubber -18.4 + ~1.6 m stride, hand ~1.8 m up), not read from the rig. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { simGame, RELEASE, ARRIVE } from '../../engine/index.js';
import { rollPlan } from '../roll.js'; /* #646 */
import { gbPlan, gbPath, gbGlove } from '../gb_path.js';
import { onDirt } from '../dust.js';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SEEDS = Number(process.argv[2] || 40);
const G = 9.81, REL_Z = -16.8, REL_Y = 1.8, PLATE_Z = .6, THROW_ARC = .05;
const src = readFileSync(path.join(ROOT, 'render/game.js'), 'utf8'), a = src.indexOf('const AIR_K='), b = src.indexOf('\n', src.indexOf('return t=>', a));
if (a < 0 || b < a) { console.error('flyPath not found in render/game.js'); process.exit(2) }
const lerp = (x, y, t) => x + (y - x) * t, clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const flyPath = new Function('lerp', 'clamp', src.slice(a, b) + '\nreturn (e,p0,p1,T)=>{const f=flyPath(e,p0,p1,T),t=flyCache.get(e.t);return {f,v0:t.v0}}')(lerp, clamp);
const pa = src.indexOf('function arc('), pb = src.indexOf('/* ---------- Fielding'), { arc, pitchArc, pitchBreak, PITCH_BRK_IN } = new Function('lerp', src.slice(pa, pb) + ';return{arc,pitchArc,pitchBreak,PITCH_BRK_IN}')(lerp); /* #644 */
const ca = src.indexOf('const CONTACT_Z='), contactPt = new Function(src.slice(ca, src.indexOf('\n', ca)) + ';return contactPt')(); /* #649: game.js contact point, run as is */
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const { throwPeak } = new Function('lerp', src.slice(pa, pb) + ';return{throwPeak}')(lerp), drawnPeak = TT => { let pk = 0; for (let i = 0; i <= 120; i++) pk = Math.max(pk, arc([0, 0, 0], [0, 0, 1], throwPeak(TT), i / 120)[1]); return pk }; /* #647 */
const pct = (arr, q) => { const s = [...arr].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))] };
const row = (name, arr, d = 2) => console.log(name.padEnd(46), 'n', String(arr.length).padStart(5), ' p5', pct(arr, .05).toFixed(d), ' p50', pct(arr, .5).toFixed(d), ' p95', pct(arr, .95).toFixed(d), ' min', Math.min(...arr).toFixed(d), ' max', Math.max(...arr).toFixed(d));
const S = { kmh: [], jump: [], gbPk: [], gbStill: [], roll: [], rollV: [], rollA: [], thr: [], thrIn: [], thrOut: [], ev: [], evHR: [], la: [], pkE: [] }, PT = {};
for (let seed = 1; seed <= SEEDS; seed++) for (const e of simGame(seed, {}).ev) {
  if (e.k !== 'P' || !e.kmh) continue;
  const swung = (e.r === 'inplay' && !e.play.bunt) || e.r === 'foul', HIT0 = swung ? contactPt(e) : null, end = swung && pitchArc([0, REL_Y, REL_Z], HIT0, .3, 1, pitchBreak(e.pt, [1, REL_Y, REL_Z]));
  const plate = swung ? HIT0 : [e.zx, .45 + e.zy * .75, PLATE_Z], d = Math.hypot(plate[0], plate[1] - REL_Y, plate[2] - REL_Z); /* where the drawn pitch ends */
  S.kmh.push(d / (ARRIVE - RELEASE) * 3.6 - e.kmh); (PT[e.pt] ??= []).push(e.kmh);
  if (e.r === 'foul') S.jump.push(dist(end, arc(HIT0, [e.foulDir * 24, 9, 22], 12, 0))); /* game.js: pitch ends at the contact point, the foul leaves from it */
  if (e.r !== 'inplay' || !e.play || e.play.bunt) continue;
  const p = e.play, PL = e.plan, T = p.hang, hr = p.res === 'HR';
  if (p.type === 'GB') { /* #645: game.js draws render/gb_path.js (imported, not mirrored): gravity / drawn vertical accel per airborne piece, still time before the catch */
    const land = [p.lx, .15, p.lz], dirt = onDirt(p.lx, p.lz), P = gbPlan(HIT0, land, T, dirt), dt = 1 / 240, y = t => gbPath(HIT0, land, T, t, dirt, P)[1];
    S.jump.push(dist(end, gbPath(HIT0, land, T, 0, dirt, P)));
    for (const q of P.segs) { const t = q.a + q.d / 2; S.gbPk.push(G / (-(y(t + dt) - 2 * y(t) + y(t - dt)) / (dt * dt))) }
    if (!PL.hit) { let still = 0; const at = t => t <= T ? gbPath(HIT0, land, T, t, dirt, P) : gbGlove(land, PL.stand, T, PL.catchT, t);
      for (let t = 1 / 60; t <= PL.catchT; t += 1 / 60) { const a = at(t - 1 / 60), b = at(t); if (Math.hypot(b[0] - a[0], b[2] - a[2]) * 60 < .05) still += 1 / 60 }
      S.gbStill.push(still) } }
  else { const land = [p.lx, hr ? 6 + (p.dist - 114) * .15 : PL.hit ? .15 : 1.5, p.lz], r = flyPath({ t: seed * 1e5 + e.t }, HIT0, land, T), v = r.v0, kmh = Math.hypot(...v) * 3.6;
    S.jump.push(dist(end, r.f(0))); S.ev.push(kmh); if (hr) S.evHR.push(kmh); S.la.push(Math.atan2(v[1], Math.hypot(v[0], v[2])) * 180 / Math.PI);
    let pk = 0; for (let t = 0; t <= T; t += 1 / 60) pk = Math.max(pk, r.f(t)[1]); S.pkE.push(pk - p.peak) }
  if (PL.hit && !hr) { const r = rollPlan([p.lx, .15, p.lz], [PL.target[0], .15, PL.target[1]], PL.catchT - T, onDirt(p.lx, p.lz)); S.roll.push(r.dur > 0 ? r.v0 - r.a * r.dur : 0); S.rollV.push(r.v0); S.rollA.push(r.a) } /* #646: friction roll */
  if (PL.TT > 0 && isFinite(PL.t0) && PL.TD > 0) { const k = drawnPeak(PL.TT) / (G * PL.TT * PL.TT / 8); /* #647: the drawn arc is game.js arc() with throwPeak(TT) */ S.thr.push(k); (PL.TD < 35 ? S.thrIn : PL.TD > 50 ? S.thrOut : []).push(k) }
}
console.log(`#638 phys_audit, seeds 1..${SEEDS}`);
row('1 pitch: implied km/h - shown km/h', S.kmh, 1);
for (const k of Object.keys(PITCH_BRK_IN)) { const [bx, by] = pitchBreak(k, [1, 0, 0]); console.log(`    #644 ${k} break at the plate vs release line: ${(by * 100).toFixed(0)} cm vertical, ${(bx * 100).toFixed(0)} cm arm side (Statcast induced, minus the fastball's rise)`) }
for (const [k, v] of Object.entries(PT)) console.log(`    ${k} shown km/h ${Math.min(...v)}-${Math.max(...v)} (${v.length})`);
row('5 contact: pitch end -> batted ball start (m)', S.jump, 3);
row('5 air ball: solved exit velo (km/h)', S.ev, 0);
row('5 home run: solved exit velo (km/h)', S.evHR, 0);
row('5 air ball: launch angle (deg)', S.la, 0);
row('5 air ball: drawn peak - engine peak (m)', S.pkE, 1);
row('4 grounder: gravity / drawn vertical accel per hop', S.gbPk);
row('4 grounder: ball frozen at land before catch (s)', S.gbStill);
row('4 hit roll: end speed at rollEnd (m/s)', S.roll, 2);
row('4 hit roll: start speed (m/s)', S.rollV, 1);
row('4 hit roll: max deceleration (m/s^2)', S.rollA, 1);
row('3 throw: drawn peak / gravity peak, all', S.thr);
row('3 throw: same, infield < 35 m', S.thrIn);
row('3 throw: same, outfield > 50 m', S.thrOut);
