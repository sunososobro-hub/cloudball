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
console.log(bad ? `${bad} FAIL` : `pitchrubber OK (habits ${[...habits].join(',')}; shakes ${[...shakes].sort().join(',')})`); process.exit(bad ? 1 : 0);
