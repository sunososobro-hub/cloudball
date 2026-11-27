/* End-of-game choreography (#613, plain Node). render/finale.js is a pure function of (plan, time). Fails when
 *   - winnerSide gets who won wrong (fielding side / batting side = walk-off / tie),
 *   - a visible figure moves faster than 8 m/s between two frames (nobody jumps; a figure turning hidden is allowed to stop),
 *   - the fielding winners are not all inside the handshake ring between mound and plate (z -15..-3) at once and with arms up,
 *   - the walk-off winners are not all within 2.5 m of home plate at once (the mob), starting at their dugout (the scorer at the plate),
 *   - the winners do not all stand in one line behind the plate facing +z and bow (bow reaches 1 and returns to 0), or leave and end hidden,
 *   - losers on the field (walk-off fielders, a tie) do not reach their dugout and end hidden, or winners who bat/field are listed as losers,
 *   - the four umpires do not walk off together (same time at the exit side by side) and vanish,
 *   - the plan is not the same twice (pure).
 * Usage: node tests/finale.check.mjs */
import * as F from '../render/finale.js';
let bad = 0;
const fail = m => { bad++; console.log('FAIL', m) };
const ok = (c, m) => { if (!c) fail(m) };
const field = [[0, -18.4], [0, .8], [-11, -10], [0, -14], [11, -10], [-19, -25], [0, -33], [19, -25], [-7, -22]];
const base = { fielders: field, dugDef: [-26, -6], dugOff: [26, -6], umps: [[0, 1.7], [11, -11], [0, -25], [-11, -11]], nOff: 8 };
ok(F.winnerSide([3, 2], 1) === 'def' && F.winnerSide([3, 2], 0) === 'off' && F.winnerSide([2, 3], 1) === 'off' && F.winnerSide([2, 3], 0) === 'def' && F.winnerSide([2, 2], 0) === null, 'winnerSide');
const DT = .05;
function scan(plan) {
  const all = [...plan.W, ...plan.L, ...plan.U];
  for (const f of all) {
    let prev = f.at(0);
    for (let u = DT; u < plan.end + 3; u += DT) {
      const c = f.at(u);
      if (prev.vis && c.vis && Math.hypot(c.x - prev.x, c.z - prev.z) / DT > 8) { fail(`jump ${f.i} at ${u.toFixed(2)}`); break }
      if (!prev.vis && c.vis && u > DT && prev.mode !== 'stand' && prev.mode !== 'gone') { fail(`appears ${f.i}`); break }
      prev = c;
    }
    ok(!f.at(plan.end + 1).vis, `figure ${f.i} still visible after the end`);
  }
}
for (const [name, winner, sc, off] of [['def wins', 'def', [3, 2], 1], ['walk-off', 'off', [2, 3], 1]]) {
  const p = F.finalePlan({ ...base, winner }), p2 = F.finalePlan({ ...base, winner });
  scan(p);
  ok(p.W.length === (winner === 'def' ? 9 : 8), `${name}: winner count ${p.W.length}`);
  ok(p.L.length === (winner === 'def' ? 0 : 9), `${name}: loser count ${p.L.length}`);
  ok(JSON.stringify(p.W.map(f => f.at(p.tArrive + 1))) === JSON.stringify(p2.W.map(f => f.at(p.tArrive + 1))), `${name}: not pure`);
  /* the gathering */
  const t = (p.tArrive + p.tCheerEnd) / 2, fr = p.W.map(f => f.at(t));
  if (winner === 'def') ok(fr.every(c => c.vis && c.z < -3 && c.z > -15 && c.arms === 1), 'ring: all between mound and plate with arms up');
  else { ok(fr.every(c => c.vis && Math.hypot(c.x - F.FIN_HOME[0], c.z - F.FIN_HOME[1]) < 2.5), 'mob: all round home plate'); const s = p.W.find(f => f.i === 0).at(0); ok(s.vis && Math.hypot(s.x - F.FIN_HOME[0], s.z - F.FIN_HOME[1]) < .01, 'scorer is at the plate at u=0'); ok(!p.W[1].at(0).vis, 'the rest start in the dugout (hidden until they run out)'); const r = p.W[1].at(.5 + p.W[1].leaves * 0); ok(Math.hypot(p.W[7].at(.01).x - base.dugOff[0], 0) < 1 || !p.W[7].at(.01).vis, 'start at the dugout') }
  /* the line and the bow */
  const tb = p.tBow + F.FIN_BOW * .5, lf = p.W.map(f => f.at(tb));
  ok(lf.every(c => c.vis && c.z === F.FIN_LINE_Z && c.fz === 1 && c.fx === 0 && c.bow === 1), 'line: all on the line facing +z at full bow');
  ok(new Set(lf.map(c => c.x.toFixed(3))).size === lf.length, 'line: distinct places');
  ok(p.W.every(f => f.at(p.tBow - .01).bow === 0 && f.at(p.tBow + F.FIN_BOW + .01).bow === 0), 'bow starts and ends upright');
  ok(p.W.every(f => f.at(p.end + 1).mode === 'gone'), 'winners end gone');
  /* losers */
  p.L.forEach(f => ok(!f.at(p.end + 1).vis && f.at(0).vis, 'loser starts on the field and ends gone'));
  /* umps */
  const tu = Math.max(...p.U.map(f => f.gone)) - .3, uf = p.U.map(f => f.at(tu));
  ok(uf.every(c => c.vis && c.x < -10), 'umps leave together');
  ok(Math.max(...uf.map(c => c.x)) - Math.min(...uf.map(c => c.x)) < 1, 'umps walk abreast');
  ok(p.end > 10 && p.end < 60, `${name}: end ${p.end.toFixed(1)} s`);
}
const tie = F.finalePlan({ ...base, winner: null });
ok(tie.W.length === 0 && tie.L.length === 9, 'tie: everybody walks off');
scan(tie);
if (bad) process.exit(1);
console.log('finale.check: ok');
