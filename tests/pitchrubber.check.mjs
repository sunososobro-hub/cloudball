/* Pitcher rubber routine (#642 part 2, plain Node). render/pitchback.js pbRubberPlan / pbRubberAt are pure. Fails when
 *   - any output is not 0 before the walk-back routine ends or from dur - PB_MARGIN on (the next delivery would start with a jump),
 *   - an output jumps between two samples DT apart (STEP per key; a head shake peaks near 4.4 rad/s, so headYaw gets .05 per .01 s),
 *   - the hand habit and the set overlap, or the routine does not fit (fits false) in a 12 s frame for S up to 1.2 m,
 *   - a short frame does not drop pieces (habit, then shakes) and still end in time,
 *   - the habit is not a property of the pitcher (same seed -> same habit on every pitch it is shown), or fewer than 3 habits over 40
 *     pitchers, or the shakes never vary over the event index,
 *   - the plan is not the same twice (pure).
 * Usage: node tests/pitchrubber.check.mjs */
import * as B from '../render/pitchback.js';
let bad = 0; const fail = m => { if (bad++ < 20) console.log('FAIL', m) }; const ok = (c, m) => { if (!c) fail(m) };
const CATCH = 4.3, DT = .01, KEYS = ['lean', 'headYaw', 'headPitch', 'handW', 'set'];
const STEP = { lean: .03, headYaw: .05, headPitch: .03, handW: .05, set: .05 };
const habits = new Set(), shakes = new Set();
for (let pi = 0; pi < 40; pi++) {
  const seed = B.pbSeedOf('1:' + pi); const mine = new Set();
  for (const S of [.5, 1.2]) for (let ei = 0; ei < 12; ei++) {
    const end = B.pbPlan(CATCH, S).end, p = B.pbRubberPlan(end, 12, seed, ei);
    ok(p.fits, `seed ${pi} ei ${ei}: fits in 12 s`);
    if (p.habit !== 'none') mine.add(p.habit); shakes.add(p.shakes);
    let prev = B.pbRubberAt(0, p), hab = 0, set = 0;
    for (let u = DT; u < 12; u += DT) {
      const c = B.pbRubberAt(u, p);
      if (u <= end || u >= 12 - B.PB_MARGIN) ok(KEYS.every(k => c[k] === 0), `seed ${pi} ei ${ei}: not at rest at ${u.toFixed(2)}`);
      for (const k of KEYS) ok(Math.abs(c[k] - prev[k]) <= STEP[k], `seed ${pi} ei ${ei}: ${k} jumps at ${u.toFixed(2)}`);
      ok(!(c.handW > 0 && c.set > 0), `seed ${pi} ei ${ei}: habit and set overlap at ${u.toFixed(2)}`);
      if (c.handW > 0) hab = 1; if (c.set > .99) set = 1; prev = c;
    }
    ok(set === 1, `seed ${pi} ei ${ei}: never comes set`);
    ok(hab === (p.habit !== 'none' ? 1 : 0), `seed ${pi} ei ${ei}: habit ${p.habit} drawn ${hab}`);
    ok(JSON.stringify(p) === JSON.stringify(B.pbRubberPlan(end, 12, seed, ei)), 'pure');
  }
  ok(mine.size <= 1, `seed ${pi}: more than one habit (${[...mine]})`); for (const h of mine) habits.add(h);
}
ok(habits.size >= 3, `habits over 40 pitchers: ${[...habits]}`);
ok(shakes.size >= 2, `shake counts never vary: ${[...shakes]}`);
// short frame: pieces dropped, still at rest by dur - margin
for (let ei = 0; ei < 30; ei++) {
  const end = B.pbPlan(CATCH, 1.2).end, dur = end + B.PB_SIGN_IN + B.PB_NOD + B.PB_SET + B.PB_SET_OUT + B.PB_MARGIN + .05;
  const p = B.pbRubberPlan(end, dur, B.pbSeedOf('x'), ei);
  ok(p.fits && p.habit === 'none' && p.shakes === 0, `short frame ei ${ei}: ${p.habit} ${p.shakes} fits ${p.fits}`);
  const tight = B.pbRubberPlan(end, end + 1, B.pbSeedOf('x'), ei);
  ok(!tight.fits && KEYS.every(k => B.pbRubberAt(end + .5, tight)[k] === 0), `no room ei ${ei}: stands still`);
}
// part 3: runners on / full count (#642): look-back at an occupied base, set leaning forward, longer sign; still at rest outside, no jumps, pure
const SITS = [{ b: [1, 0, 0], c: [0, 0] }, { b: [0, 1, 0], c: [1, 1] }, { b: [0, 0, 1], c: [3, 2] }, { b: [1, 1, 1], c: [3, 2] }];
const dirs = new Set();
for (const sit of SITS) for (let pi = 0; pi < 20; pi++) for (let ei = 0; ei < 8; ei++) {
  const seed = B.pbSeedOf('2:' + pi), end = B.pbPlan(CATCH, 1.2).end, p = B.pbRubberPlan(end, 12, seed, ei, sit), q0 = B.pbRubberPlan(end, 12, seed, ei);
  ok(p.fits, `sit ${JSON.stringify(sit)} ${pi}/${ei}: fits in 12 s`); ok(p.lookDir !== 0 && Math.abs(p.l1 - p.l0 - B.PB_LOOK_RUN) < 1e-9, `look-back missing ${pi}/${ei}`);
  ok(sit.b[0] && !sit.b[1] && !sit.b[2] ? p.lookDir === 1 : sit.b[2] && !sit.b[0] && !sit.b[1] ? p.lookDir === -1 : true, `look direction ${pi}/${ei}`);
  ok(p.s1 - p.s0 > q0.s1 - q0.s0 || p.habit !== q0.habit, `sign not longer ${pi}/${ei}`); dirs.add(p.lookDir);
  let prev = B.pbRubberAt(0, p), looked = 0;
  for (let u = DT; u < 12; u += DT) {
    const c = B.pbRubberAt(u, p);
    if (u <= end || u >= 12 - B.PB_MARGIN) ok(KEYS.every(k => c[k] === 0), `sit ${pi}/${ei}: not at rest at ${u.toFixed(2)}`);
    for (const k of KEYS) ok(Math.abs(c[k] - prev[k]) <= STEP[k], `sit ${pi}/${ei}: ${k} jumps at ${u.toFixed(2)}`);
    if (Math.abs(c.headYaw) > .8 * B.PB_LOOK_YAW && u > p.l0) looked = 1; prev = c;
  }
  ok(looked === 1, `sit ${pi}/${ei}: never looks back`); ok(JSON.stringify(p) === JSON.stringify(B.pbRubberPlan(end, 12, seed, ei, sit)), 'pure');
  ok(B.pbRubberAt(p.out0 - .01, p).lean > B.PB_SET_LEAN_RUN * .99 && B.pbRubberAt(p.out0 - .01, q0).lean === 0, `set not leaning ${pi}/${ei}`);
}
ok(dirs.has(1) && dirs.has(-1), `look directions never vary: ${[...dirs]}`);
for (let ei = 0; ei < 30; ei++) {  // a frame too short for the look-back drops it (and the extra pause), never overruns
  const end = B.pbPlan(CATCH, 1.2).end, dur = end + B.PB_SIGN_IN + B.PB_NOD + B.PB_SET + B.PB_SET_OUT + B.PB_MARGIN + .05;
  const p = B.pbRubberPlan(end, dur, B.pbSeedOf('x'), ei, SITS[3]); ok(p.fits && p.lookDir === 0, `short frame with runners ei ${ei}`);
}
console.log(bad ? `${bad} FAIL` : `pitchrubber OK (habits ${[...habits].join(',')}; shakes ${[...shakes].sort().join(',')})`); process.exit(bad ? 1 : 0);
