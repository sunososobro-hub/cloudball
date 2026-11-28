/* #758: the catcher's mound visit in the picture (plain Node). render/catchervisit.js is run, not read, over every CVIS frame of 60 games:
 *   - every CVIS frame gets a plan (the 30 s frame has room for the walk), and a non-CVIS-length frame too short for a talk gets none
 *   - he leaves the plate only after the plate umpire's hands are up (umptime TIME_AT + TM_UP), and stays put until then
 *   - he stops at the mound, CV_STAND m from the rubber, facing the pitcher, and talks for at least CV_TALK s
 *   - no step is longer than his jog speed x dt (dt .05 s), and he never leaves the line between the plate and the mound
 *   - at the frame end he is back at his spot, mask on, in his full crouch; the mask is off for the whole time he is away
 * static.mjs runs this file. Usage: node tests/cvisit_render.check.mjs */
import { simGame, fielderStart } from '../engine/index.js';
import { CATCHER_VISIT_DUR } from '../engine/constants.js';
import { catcherVisitPlan, catcherVisitAt, CV_GO, CV_V, CV_STAND, CV_TALK } from '../render/catchervisit.js';
import { TIME_AT, TM_UP } from '../render/umptime.js';

const problems = [], bad = m => { if (problems.length < 30) problems.push(m); };
const MOUND = [0, -18.4], DT = .05, EPS = 1e-6;
let frames = 0;
for (let seed = 1; seed <= 60; seed++) for (const e of simGame(seed, {}).ev) {
  if (e.k !== 'CVIS') continue;
  frames++;
  const c0 = fielderStart('C', e.s0.b, e.s0.outs), tag = `seed ${seed} CVIS at ${e.t}`, pl = catcherVisitPlan(c0, MOUND, e.d);
  if (!pl) { bad(`${tag}: no plan for a ${e.d} s frame`); continue; }
  if (CV_GO < TIME_AT + TM_UP) bad(`${tag}: he sets off (${CV_GO} s) before the time signal is up (${TIME_AT + TM_UP} s)`);
  let prev = catcherVisitAt(pl, 0), awayFrom = null, back = null;
  if (Math.hypot(prev.x - c0[0], prev.z - c0[1]) > EPS) bad(`${tag}: not at his spot at u=0`);
  for (let u = DT; u <= e.d + EPS; u += DT) {
    const a = catcherVisitAt(pl, Math.min(u, e.d)), step = Math.hypot(a.x - prev.x, a.z - prev.z);
    if (step > CV_V * DT + EPS) bad(`${tag}: step ${step.toFixed(3)} m in ${DT} s at u=${u.toFixed(2)}`);
    if (Math.abs(a.x - c0[0]) > EPS) bad(`${tag}: left the plate-mound line (x ${a.x.toFixed(2)})`);
    if (u < CV_GO - EPS && step > EPS) bad(`${tag}: moved at u=${u.toFixed(2)} before CV_GO`);
    if (!a.maskOn && awayFrom === null) awayFrom = u;
    if (a.maskOn && awayFrom !== null && back === null) back = u;
    if (a.maskOn && awayFrom !== null && back !== null && u > back && Math.hypot(a.x - c0[0], a.z - c0[1]) > EPS) bad(`${tag}: mask on while still away at u=${u.toFixed(2)}`);
    prev = a;
  }
  const mid = catcherVisitAt(pl, (pl.arrive + pl.leave) / 2), dm = Math.hypot(mid.x - MOUND[0], mid.z - MOUND[1]);
  if (Math.abs(dm - CV_STAND) > 1e-6) bad(`${tag}: stands ${dm.toFixed(2)} m from the rubber, want ${CV_STAND}`);
  if (Math.abs(Math.atan2(mid.fx, mid.fz) - Math.atan2(MOUND[0] - mid.x, MOUND[1] - mid.z)) > 1e-6) bad(`${tag}: not facing the pitcher`);
  if (pl.leave - pl.arrive < CV_TALK) bad(`${tag}: talk ${(pl.leave - pl.arrive).toFixed(1)} s`);
  if (mid.maskOn) bad(`${tag}: mask on during the talk`);
  const end = catcherVisitAt(pl, e.d);
  if (Math.hypot(end.x - c0[0], end.z - c0[1]) > EPS || !end.maskOn || Math.abs(end.crouch - 1) > EPS) bad(`${tag}: not back in his crouch with the mask on at the frame end`);
  if (e.d !== CATCHER_VISIT_DUR) bad(`${tag}: frame is ${e.d} s`);
}
if (catcherVisitPlan([0, 1.3], MOUND, CV_GO + CV_TALK) !== null) bad('a frame too short for the talk still gets a visit');
if (!frames) bad('no CVIS frame in 60 games: the check saw nothing');
if (problems.length) { console.error('FAIL cvisit_render:\n - ' + problems.join('\n - ')); process.exit(1); }
console.log(`cvisit_render ok: ${frames} catcher visits in 60 games walk to the mound and back`);
