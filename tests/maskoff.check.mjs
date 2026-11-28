/* Catcher's mask on caught foul pop-ups (#620 part 1, plain Node). render/maskoff.js is run, not read, over real engine games:
 *   - only a caught foul fly (play.foul) whose fielder is the catcher drops the mask; every other event: null, mask stays on
 *   - it comes off after contact and lands before the catch; it lies MASK_TOSS m from his start, farther from the ball than he was
 *   - maskAt: null before the toss, on the ground once MASK_FLY is over, height between the dirt and head + peak, pure in time
 *   - no fair-ball cue on any caught foul fly: the line umpires (render/umpline.js) give it no `fair` / `hr` signal
 * static.mjs runs this file. Usage: node tests/maskoff.check.mjs */
import { simGame, ARRIVE, fielderStart } from '../engine/index.js';
import { maskOff, maskAt, MASK_FLY, MASK_TOSS, MASK_HEAD_Y, MASK_PEAK, MASK_GROUND_Y } from '../render/maskoff.js';
import { lineCall } from '../render/umpline.js';

const T = { ARRIVE }, problems = [], bad = m => { if (problems.length < 30) problems.push(m); };
let byC = 0, foulFlies = 0;
for (let seed = 1; seed <= 120; seed++) for (const e of simGame(seed, {}, { teams: [seed % 4, (seed + 1) % 4] }).ev) {
  const c0 = fielderStart('C', e.s0 ? e.s0.b : [0, 0, 0], e.s0 ? e.s0.outs : 0);
  const p = e.play, foul = e.k === 'P' && e.r === 'inplay' && p && p.foul, m = maskOff(e, T, c0);
  if (foul) {
    foulFlies++;
    const lc = lineCall(e, T);
    if (lc && (lc.kind === 'fair' || lc.kind === 'hr')) bad(`seed ${seed}: caught foul fly (${p.fielder}, spray ${p.spray}) gets a ${lc.kind} signal`);
  }
  if (!(foul && p.fielder === 'C')) { if (m) bad(`seed ${seed}: mask off on ${e.k}/${e.r}${p ? ' by ' + p.fielder : ''}`); continue; }
  byC++;
  if (!m) { bad(`seed ${seed}: catcher's foul pop-up keeps the mask on`); continue; }
  const land = [p.lx, p.lz], d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]), catchAt = ARRIVE + e.plan.catchT;
  if (!(m.at > ARRIVE && m.at + MASK_FLY < catchAt)) bad(`seed ${seed}: mask off at ${m.at.toFixed(2)} s, catch at ${catchAt.toFixed(2)} s`);
  if (Math.abs(d(m.spot, c0) - MASK_TOSS) > 1e-6) bad(`seed ${seed}: mask lies ${d(m.spot, c0).toFixed(2)} m from him, want ${MASK_TOSS}`);
  if (!(d(m.spot, land) > d(c0, land))) bad(`seed ${seed}: mask tossed toward the ball (${d(m.spot, land).toFixed(2)} m from it, he was ${d(c0, land).toFixed(2)} m)`);
  if (maskAt(e, m.at - .01, T, c0)) bad(`seed ${seed}: mask off before its time`);
  for (let u = m.at; u <= e.d; u += .05) {
    const a = maskAt(e, u, T, c0), b = maskAt(e, u, T, c0);
    if (!a) { bad(`seed ${seed}: mask back on at ${u.toFixed(2)} s`); break; }
    if (JSON.stringify(a) !== JSON.stringify(b)) { bad(`seed ${seed}: maskAt not pure at ${u}`); break; }
    if (!a.pos.every(Number.isFinite) || a.pos[1] < MASK_GROUND_Y - 1e-9 || a.pos[1] > MASK_HEAD_Y + MASK_PEAK + 1e-9) { bad(`seed ${seed}: mask at ${a.pos} at ${u.toFixed(2)} s`); break; }
    if (u >= m.at + MASK_FLY && (!a.ground || Math.abs(a.pos[1] - MASK_GROUND_Y) > 1e-9)) { bad(`seed ${seed}: mask not lying on the dirt at ${u.toFixed(2)} s`); break; }
  }
}
if (byC < 3) bad(`only ${byC} catcher foul pop-ups in 120 games: the check sees too few`);
if (problems.length) { console.error('maskoff check FAILED:\n  ' + problems.join('\n  ')); process.exit(1); }
console.log(`maskoff check OK: ${foulFlies} caught foul flies, ${byC} by the catcher drop the mask away from the ball; none gets a fair / home-run line signal`);
