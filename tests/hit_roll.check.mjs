/* #646: a base-hit roll slows down by friction and is done before the fielder's pickup. Runs render/roll.js on every non-HR hit
 * of 40 engine seeds (the same plan numbers game.js feeds it): speed never rises, ends <= .3 m/s at rollEnd, stops by catchT, never below ground. */
import { simGame } from '../engine/index.js';
import { rollPlan, rollAt, rollSpeed, ROLL_Y } from '../render/roll.js';
import { onDirt } from '../render/dust.js';
const bad = []; const ok = (c, m) => { if (!c && bad.length < 20) bad.push(m) };
let n = 0, dirt = 0, grass = 0;
for (let seed = 1; seed <= 40; seed++) for (const e of simGame(seed, {}).ev) {
  if (e.r !== 'inplay' || !e.play || e.play.bunt || !e.plan || !e.plan.hit || e.play.res === 'HR') continue;
  const p = e.play, PL = e.plan, T = p.hang, land = [p.lx, ROLL_Y, p.lz], end = [PL.target[0], ROLL_Y, PL.target[1]], avail = PL.catchT - T, d = onDirt(p.lx, p.lz);
  const r = rollPlan(land, end, avail, d), tag = `seed ${seed} t ${e.t}`; n++; d ? dirt++ : grass++;
  if (!(r.dur > 0)) continue;
  ok(r.dur <= avail + 1e-9, `${tag}: roll ${r.dur} s outlasts pickup at ${avail} s`);
  ok(rollSpeed(r, r.dur) <= .3, `${tag}: end speed ${rollSpeed(r, r.dur)}`);
  const q = rollAt(r, land, end, r.dur);
  ok(Math.hypot(q[0] - end[0], q[2] - end[2]) < 1e-6, `${tag}: does not end at rollEnd`);
  let prevV = Infinity, prevS = -1;
  for (let i = 0; i <= 60; i++) { const t = r.dur * i / 60, v = rollSpeed(r, t), b = rollAt(r, land, end, t), s = Math.hypot(b[0] - land[0], b[2] - land[2]);
    ok(v <= prevV + 1e-9, `${tag}: speeds up at ${t.toFixed(2)} s`); ok(s >= prevS - 1e-9, `${tag}: rolls backwards`); ok(b[1] >= ROLL_Y - 1e-9, `${tag}: below the ground`);
    prevV = v; prevS = s }
}
/* the two surface constants differ (the ball runs longer on the infield skin than in the grass) */
const a = rollPlan([0, .15, 0], [6, .15, 0], 99, false), b = rollPlan([0, .15, 0], [6, .15, 0], 99, true);
ok(b.a < a.a && b.dur > a.dur, 'dirt and grass constants differ');
ok(n > 300 && dirt > 20 && grass > 20, `sample too small: ${n} hits, ${dirt} dirt, ${grass} grass`);
if (bad.length) { console.error('hit_roll FAIL\n' + bad.join('\n')); process.exit(1) }
console.log(`hit_roll ok: ${n} hits (${dirt} dirt, ${grass} grass)`);
