/* #644: pitch break by type (plain Node). Runs the real pitchArc / pitchBreak from render/game.js (sliced from `function arc(` to the
 * Fielding section) on the engine's own pitches, 40 seeds:
 *   - the ball ends on today's plate spot (max diff < .005 m) and starts at the hand
 *   - break at the plate vs the line it was released along (end minus the tangent at release, less the hump) equals the stated value
 *     for its type, within +-25% (arm side flipped for a lefty), and the five types differ
 *   - the ball never dips below the ground on the way
 * Usage: node tests/pitchbreak.check.mjs */
import { readFileSync } from 'node:fs';
import { simGame, RELEASE, ARRIVE } from '../engine/index.js';
const SEEDS = 40, END_TOL = .005, BRK_TOL = .25, REL = [.4, 1.8, -16.8], problems = [], bad = m => { if (problems.length < 30) problems.push(m) };
const src = readFileSync(new URL('../render/game.js', import.meta.url), 'utf8'), a = src.indexOf('function arc('), b = src.indexOf('/* ---------- Fielding');
if (a < 0 || b < a) { console.log('pitchbreak FAIL\nfunction arc / Fielding marker not found in render/game.js'); process.exit(1) }
const lerp = (x, y, t) => x + (y - x) * t;
const api = new Function('lerp', src.slice(a, b) + ';return{pitchArc,pitchBreak,PITCH_BRK_IN}')(lerp), { pitchArc, pitchBreak, PITCH_BRK_IN } = api;
const seen = {}; let n = 0, worstEnd = 0;
for (let seed = 1; seed <= SEEDS; seed++) for (const e of simGame(seed, {}).ev) {
  if (e.k !== 'P' || !e.kmh || e.r === 'hbp') continue;
  for (const sx of [1, -1]) {
    const hand = [REL[0] * sx, REL[1], REL[2]], plate = [e.zx, .45 + e.zy * .75, .6], brk = pitchBreak(e.pt, hand);
    n++; const p0 = pitchArc(hand, plate, .3, 0, brk), p1 = pitchArc(hand, plate, .3, 1, brk);
    worstEnd = Math.max(worstEnd, Math.hypot(p1[0] - plate[0], p1[1] - plate[1], p1[2] - plate[2]));
    if (Math.hypot(p0[0] - hand[0], p0[1] - hand[1], p0[2] - hand[2]) > 1e-9) bad(`seed ${seed} t ${e.t}: does not start at the hand`);
    for (let t = 0; t <= 1; t += 1 / 60) if (pitchArc(hand, plate, .3, t, brk)[1] < 0) { bad(`seed ${seed} t ${e.t} ${e.pt}: below ground at t=${t.toFixed(2)}`); break }
    /* tangent at release by a tiny step; the hump (peak .3) is the old look, so it is taken out of both ends */
    const h = 1e-4, q0 = pitchArc(hand, plate, .3, 0, brk), q1 = pitchArc(hand, plate, .3, h, brk), flat = pitchArc(hand, plate, .3, h, [0, 0]);
    const vel = [0, 1].map(i => (q1[i] - q0[i] - (flat[i] - q0[i])) / h), bx = -vel[0], by = -vel[1];
    (seen[e.pt] ??= []).push([bx * sx, by]);
  }
}
if (worstEnd >= END_TOL) bad(`end point off the plate spot by ${worstEnd.toFixed(4)} m (limit ${END_TOL})`);
const mean = (v, i) => v.reduce((s, x) => s + x[i], 0) / v.length, types = Object.keys(PITCH_BRK_IN);
for (const t of types) {
  const v = seen[t]; if (!v) { bad(`${t}: no pitch in ${SEEDS} seeds`); continue }
  const want = [PITCH_BRK_IN[t][1] * .0254, PITCH_BRK_IN[t][0] * .0254], got = [mean(v, 0), mean(v, 1)];
  for (const i of [0, 1]) if (Math.abs(got[i] - want[i]) > Math.max(.005, Math.abs(want[i]) * BRK_TOL)) bad(`${t} ${i ? 'vertical' : 'horizontal'} break ${got[i].toFixed(3)} m, stated ${want[i].toFixed(3)} m`);
}
if (new Set(types.map(t => PITCH_BRK_IN[t].join())).size !== types.length) bad('two pitch types share the same break');
if (problems.length) { console.log('pitchbreak FAIL\n' + problems.join('\n')); process.exit(1) }
console.log(`pitchbreak ok: ${n} pitches, end diff max ${worstEnd.toExponential(1)} m, types ${Object.keys(seen).join(' ')}`);
