/* #611 part 3: the pitching-change walk (render/chgwalk.js), plain Node over real engine games. The module is run, not read:
 *   - CW_SIGNAL / CW_JOG equal the engine's RELIEF_SIGNAL_DUR and BULLPEN_JOG_M / RELIEF_JOG_SPEED, and fit a CHANGE_DUR frame
 *   - from both dugouts: the old pitcher is on the rubber at u = 0 and in the dugout (null) by d - CW_OLD_END_GAP; the reliever is behind the
 *     bullpen gate (null) before CW_SIGNAL and on the rubber from CW_SIGNAL + CW_JOG; nobody appears or vanishes half way
 *   - no step faster than MAX_V m/s; the two men never closer than MIN_GAP m while both are moving
 *   - every CHG frame of 60 simulated games is CHANGE_DUR long and unchanged by drafting the walk (rule 10); same input = same output
 * static.mjs runs this file. Usage: node tests/chgwalk.check.mjs */
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { oldAt, newAt, bullpenGate, holdAt, CW_SIGNAL, CW_JOG, CW_OLD_END_GAP, CW_OLD_GO, CW_HAND } from '../render/chgwalk.js';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), bad = [];
const E = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const { simGame, CHANGE_DUR, FIELD_SPOTS, spotXZ } = E;
const K = await import(pathToFileURL(path.join(ROOT, 'engine/constants.js')));
const game = readFileSync(path.join(ROOT, 'render/game.js'), 'utf8');
const num = k => { const m = game.match(new RegExp('\\b' + k + '=(-?[0-9.]+)')); return m ? +m[1] : NaN; };
const IX = num('INTRO_X'), IZ = num('INTRO_Z');
if (!Number.isFinite(IX) || !Number.isFinite(IZ)) bad.push(`INTRO_X/INTRO_Z not found in render/game.js (${IX}, ${IZ})`);
if (CW_SIGNAL !== K.RELIEF_SIGNAL_DUR) bad.push(`CW_SIGNAL ${CW_SIGNAL} != RELIEF_SIGNAL_DUR ${K.RELIEF_SIGNAL_DUR}`);
if (Math.abs(CW_JOG - K.BULLPEN_JOG_M / K.RELIEF_JOG_SPEED) > .5) bad.push(`CW_JOG ${CW_JOG} != BULLPEN_JOG_M / RELIEF_JOG_SPEED ${K.BULLPEN_JOG_M / K.RELIEF_JOG_SPEED}`);
if (CW_SIGNAL + CW_JOG >= CHANGE_DUR) bad.push(`the reliever (${CW_SIGNAL + CW_JOG} s) is not on the rubber before the frame ends (${CHANGE_DUR} s)`);
const mound = spotXZ(...FIELD_SPOTS.P), DT = .05, MAX_V = 6, MIN_GAP = .5, dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
for (const side of [1, -1]) {
  const dug = [side * IX, IZ], gate = bullpenGate(dug), tag = `dugout ${dug}`, d = CHANGE_DUR;
  if (Math.sign(gate[0]) !== side) bad.push(`${tag}: bullpen gate on the wrong side ${gate}`);
  const o0 = oldAt(mound, dug, 0, d);
  if (!o0 || dist(o0, mound) > 1e-6) bad.push(`${tag}: old pitcher not on the rubber at u = 0`);
  if (oldAt(mound, dug, d - CW_OLD_END_GAP + 1e-6, d)) bad.push(`${tag}: old pitcher still out at d - CW_OLD_END_GAP`);
  if (newAt(mound, gate, CW_SIGNAL - 1e-6)) bad.push(`${tag}: reliever drawn before CW_SIGNAL`);
  const n0 = newAt(mound, gate, CW_SIGNAL);
  if (!n0 || dist(n0, gate) > 1e-6) bad.push(`${tag}: reliever does not start at the gate`);
  const n1 = newAt(mound, gate, CW_SIGNAL + CW_JOG), n2 = newAt(mound, gate, d);
  if (!n1 || dist(n1, mound) > 1e-6 || !n2 || dist(n2, mound) > 1e-6) bad.push(`${tag}: reliever not on the rubber from CW_SIGNAL + CW_JOG`);
  let po = null, pn = null, gone = false;
  for (let u = 0; u <= d; u += DT) {
    const o = oldAt(mound, dug, u, d), n = newAt(mound, gate, u);
    if (o && gone) bad.push(`${tag} u ${u}: old pitcher comes back after he left`);
    if (!o) gone = true;
    if (o && po && dist(o, po) > MAX_V * DT) bad.push(`${tag} u ${u}: old pitcher steps ${dist(o, po).toFixed(2)} m`);
    if (n && pn && dist(n, pn) > MAX_V * DT) bad.push(`${tag} u ${u}: reliever steps ${dist(n, pn).toFixed(2)} m`);
    if (o && n && dist(o, mound) > .01 && dist(n, mound) > .01 && dist(o, n) < MIN_GAP) bad.push(`${tag} u ${u}: the two men ${dist(o, n).toFixed(2)} m apart`);
    po = o; pn = n;
  }
  if (JSON.stringify(oldAt(mound, dug, 20, d)) !== JSON.stringify(oldAt(mound, dug, 20, d))) bad.push(`${tag}: not deterministic`);
}
/* #611 part 4: the ball goes old pitcher -> manager -> reliever, in that order, never back */
{
  const rank = { mgr: 1, move: 2, P: 3 }, t = CW_SIGNAL + CW_JOG;
  if (holdAt(true, CW_OLD_GO - .01) !== null) bad.push('ball shown before the old pitcher hands it over');
  if (holdAt(false, CW_OLD_GO + 1) !== null) bad.push('ball shown with no manager at the mound');
  if (holdAt(true, CW_OLD_GO + 1).who !== 'mgr') bad.push('manager does not hold the ball after the old pitcher leaves');
  if (holdAt(true, t - .01).who !== 'mgr') bad.push('manager lets go before the reliever is on the rubber');
  if (holdAt(true, t + CW_HAND / 2).who !== 'move') bad.push('no hand-over in progress mid-way');
  if (holdAt(true, t + CW_HAND).who !== 'P' || holdAt(true, CHANGE_DUR).who !== 'P' || holdAt(false, CHANGE_DUR).who !== 'P') bad.push('reliever does not keep the ball to the frame end');
  let last = 0, lk = -1;
  for (let u = CW_OLD_GO; u <= CHANGE_DUR; u += DT) {
    const h = holdAt(true, u), r = rank[h.who];
    if (r < last) bad.push(`u ${u}: ball goes back (${h.who})`);
    if (h.who === 'move') { if (h.k < lk) bad.push(`u ${u}: hand-over runs backwards`); lk = h.k; }
    last = r;
  }
  if (!/chgBall\(e,u\)/.test(game)) bad.push('render/game.js does not call chgBall on a CHG frame');
}
let frames = 0;
for (let seed = 1; seed <= 60; seed++) {
  const g = simGame(seed, {}, {});
  for (const e of g.ev) {
    if (e.k !== 'CHG') continue;
    frames++;
    const before = JSON.stringify(e);
    oldAt(mound, [IX, IZ], 10, e.d); newAt(mound, bullpenGate([IX, IZ]), 20);
    if (JSON.stringify(e) !== before) bad.push(`seed ${seed} t ${e.t}: the CHG frame changed`);
    if (e.d !== CHANGE_DUR) bad.push(`seed ${seed} t ${e.t}: CHG frame ${e.d} s, not CHANGE_DUR`);
  }
}
if (!frames) bad.push('no CHG frame in 60 games');
if (bad.length) { console.error('chgwalk check FAILED:\n' + bad.slice(0, 30).join('\n')); process.exit(1); }
console.log(`chgwalk check OK (${frames} CHG frames, both dugouts)`);
