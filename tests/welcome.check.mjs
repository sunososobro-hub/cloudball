/* #266 item 2: teammates meet a home run at the plate (render/welcome.js, plain Node).
 * Over GAMES simulated games, for every home-run frame, from the batting team's dugout (INTRO_X / INTRO_Z) along the scorers' path
 * (the quadratic Bezier of game.js peelPath, PEEL_IN / PEEL_THRU / PEEL_THRU_TURN read from render/game.js), fails when:
 *   - no home run happens (the check would prove nothing), or a home run gets no plan;
 *   - the party is not WELCOME_N teammates with 3 <= WELCOME_N <= 5;
 *   - one teammate's outing (dugout -> spot -> dugout) lasts longer than WELCOME_MAX s, starts before the frame does, or he is not in
 *     place WELCOME_EARLY s before the batter reaches the plate;
 *   - the batter (HR_TROT_SPEED) is not past every spot before the party leaves;
 *   - a spot is closer than WELCOME_SIDE to the scorers' path, under 1 m from another spot, or under 2 m from the plate;
 *   - sampled every 10 ms a teammate jumps, appears or vanishes away from the dugout, hops higher than WELCOME_HOP_H or is still off
 *     the ground when he starts back;
 *   - the same frame gives two different plans.
 * static.mjs runs this file. Usage: node tests/welcome.check.mjs */
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { welcomePlan, welcomeAt, WELCOME_N, WELCOME_MAX, WELCOME_EARLY, WELCOME_SIDE, WELCOME_ARC, WELCOME_OUT_V, WELCOME_HOP_H } from '../render/welcome.js';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), errs = [], bad = m => { if (errs.length < 20) errs.push(m); };
const { simGame, HR_TROT_SPEED } = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const game = readFileSync(path.join(ROOT, 'render/game.js'), 'utf8');
const num = k => { const m = game.match(new RegExp('\\b' + k + '=(-?[0-9.]+)')); return m ? +m[1] : NaN; };
const IX = num('INTRO_X'), IZ = num('INTRO_Z'), THRU = num('PEEL_THRU'), TURN = num('PEEL_THRU_TURN'), PN = 32;
if (![IX, IZ, THRU, TURN].every(Number.isFinite)) bad(`INTRO_X/INTRO_Z/PEEL_THRU/PEEL_THRU_TURN not found in render/game.js`);
if (!(WELCOME_N >= 3 && WELCOME_N <= 5)) bad(`WELCOME_N ${WELCOME_N} outside 3-5`);
const dugout = t => [(t === 0 ? 1 : -1) * IX, IZ];
function peelPath(t) {
  const D = dugout(t), thr = D[0] < 0 ? TURN : THRU, P1 = [Math.SQRT1_2 * thr, Math.SQRT1_2 * thr], pts = [], cum = [0];
  for (let i = 0; i <= PN; i++) { const s = i / PN, a = 2 * s * (1 - s), b = s * s; pts.push([a * P1[0] + b * D[0], a * P1[1] + b * D[1]]); if (i) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); }
  return { pts, cum, L: cum[PN] };
}
const segDist = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, k = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(p[0] - a[0] - dx * k, p[1] - a[1] - dz * k); };
const pathDist = (p, P) => Math.min(...P.pts.slice(1).map((b, i) => segDist(p, P.pts[i], b)));

const GAMES = 120, DT = .01, eps = 1e-6;
let hrs = 0, slams = 0, maxOut = 0;
for (let s = 1; s <= GAMES; s++) {
  const g = simGame(s, {}, { teams: [s % 4, (s + 1) % 4] });
  g.ev.forEach((e, i) => {
    if (e.k !== 'P' || !e.play || e.play.res !== 'HR' || !e.moves) return;
    hrs++;
    const off = e.s0.half, tag = `seed ${s} ev ${i}`, arr = e.moves.filter(m => m[1] === 4).map(m => m[3].arriveT), first = Math.min(...arr), last = Math.max(...arr);
    if (arr.length === 4) slams++;
    const from = dugout(off), P = peelPath(off), pl = welcomePlan(from, P, first, last);
    if (!pl) { bad(`${tag}: home run without a welcome plan`); return; }
    if (JSON.stringify(pl) !== JSON.stringify(welcomePlan(from, P, first, last))) bad(`${tag}: not deterministic`);
    if (pl.members.length !== WELCOME_N) bad(`${tag}: ${pl.members.length} teammates, want ${WELCOME_N}`);
    pl.members.forEach((m, k) => {
      const t = `${tag} mate ${k}`;
      maxOut = Math.max(maxOut, m.end - m.go);
      if (m.end - m.go > WELCOME_MAX + eps) bad(`${t}: outing ${(m.end - m.go).toFixed(2)} s > WELCOME_MAX ${WELCOME_MAX}`);
      if (m.go < -eps) bad(`${t}: leaves the dugout before the frame starts (${m.go.toFixed(2)} s)`);
      if (m.inAt > last - WELCOME_EARLY + eps) bad(`${t}: in place at ${m.inAt.toFixed(2)} s, batter home at ${last.toFixed(2)} s`);
      if (last + WELCOME_ARC[k] / HR_TROT_SPEED > m.leave) bad(`${t}: leaves before the batter has passed his spot`);
      if (pathDist(m.spot, P) < WELCOME_SIDE * .9) bad(`${t}: spot ${pathDist(m.spot, P).toFixed(2)} m from the scorers' path`);
      if (Math.hypot(...m.spot) < 2) bad(`${t}: spot on the plate`);
      pl.members.forEach((o, j) => { if (j > k && Math.hypot(o.spot[0] - m.spot[0], o.spot[1] - m.spot[1]) < 1) bad(`${t}: spot under 1 m from mate ${j}`); });
      const vMax = Math.max(WELCOME_OUT_V, m.L / (m.end - m.leave)) * DT + 1e-4;
      let prev = null, shown = 0;
      for (let u = 0; u <= pl.end + 1; u += DT) {
        const a = welcomeAt(pl, k, u);
        if (!a.visible) { if (prev && Math.hypot(prev.x - from[0], prev.z - from[1]) > vMax) bad(`${t}: vanishes ${Math.hypot(prev.x - from[0], prev.z - from[1]).toFixed(2)} m from the dugout at ${u.toFixed(2)} s`); prev = null; continue; }
        shown++;
        if (!prev && Math.hypot(a.x - from[0], a.z - from[1]) > vMax) bad(`${t}: appears ${Math.hypot(a.x - from[0], a.z - from[1]).toFixed(2)} m out of the dugout at ${u.toFixed(2)} s`);
        if (prev && Math.hypot(a.x - prev.x, a.z - prev.z) > vMax) { bad(`${t}: jumps at ${u.toFixed(2)} s`); break; }
        if (a.hop > WELCOME_HOP_H + eps || a.hop < 0) bad(`${t}: hop ${a.hop} m`);
        if (a.moving && a.hop !== 0) bad(`${t}: off the ground while walking at ${u.toFixed(2)} s`);
        prev = a;
      }
      if (!shown) bad(`${t}: never shown`);
    });
  });
}
if (!hrs) bad(`no home run in ${GAMES} games`);
if (welcomePlan([26, -6], null, 1, 2) || welcomeAt(null, 0, 5).visible) bad('no path / no plan still drew someone');
if (errs.length) { console.error(`welcome: FAIL\n  ${errs.join('\n  ')}`); process.exit(1); }
console.log(`welcome: ok (${hrs} home runs, ${slams} grand slams, ${WELCOME_N} teammates, longest outing ${maxOut.toFixed(1)} s <= ${WELCOME_MAX} s)`);
