/* Pitcher between-pitch routine (#642 part 1, plain Node). render/pitchback.js is pure. Fails when
 *   - he moves faster than PITCHER_WALK_V between two samples or jumps (z steps),
 *   - he is not at the rubber (z 0) and facing the plate (yaw 0) when the routine ends, or not standing at S before the walk,
 *   - he turns away before the catch, or the ball-holding window does not span catch..walk end,
 *   - the routine is not the same twice (pure), or runs past the 12 s pitch frame (engine PITCH_DUR) for S up to 1.2 m.
 * Usage: node tests/pitchback.check.mjs */
import * as B from '../render/pitchback.js';
let bad = 0; const fail = m => { bad++; console.log('FAIL', m) }; const ok = (c, m) => { if (!c) fail(m) };
const CATCH = 4.3, DT = .02;
for (const S of [.5, .85, 1.2]) {
  const p = B.pbPlan(CATCH, S);
  ok(p.end < 12, `S ${S}: routine ends ${p.end.toFixed(2)} s, inside the 12 s frame`);
  let prev = B.pbAt(0, CATCH, S);
  ok(prev.z === S && prev.yaw === 0, `S ${S}: starts standing at S facing the plate`);
  for (let u = DT; u < p.end + 1; u += DT) {
    const c = B.pbAt(u, CATCH, S);
    ok(Math.abs(c.z - prev.z) / DT <= B.PITCHER_WALK_V + 1e-6, `S ${S}: speed ${(Math.abs(c.z - prev.z) / DT).toFixed(2)} at ${u.toFixed(2)}`);
    if (u < p.turn0) ok(c.yaw === 0 && c.z === S, `S ${S}: moved before the look ends (${u.toFixed(2)})`);
    ok(c.holdsBall === (u >= CATCH && u < p.walk1), `S ${S}: ball window at ${u.toFixed(2)}`);
    prev = c;
  }
  const e = B.pbAt(p.end + .5, CATCH, S);
  ok(Math.abs(e.z) < 1e-9 && Math.abs(e.yaw) < 1e-9 && e.glove === 0 && e.look === 0, `S ${S}: ends at the rubber, facing the plate, relaxed`);
  ok(Math.abs(B.pbAt((p.walk0 + p.walk1) / 2, CATCH, S).yaw - Math.PI) < 1e-9, `S ${S}: back to the plate while walking`);
}
ok(JSON.stringify(B.pbAt(5.5, CATCH, .85)) === JSON.stringify(B.pbAt(5.5, CATCH, .85)), 'pure');
console.log(bad ? `${bad} FAIL` : 'pitchback OK'); process.exit(bad ? 1 : 0);
