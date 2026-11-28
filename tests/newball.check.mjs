/* New ball after a foul out of play (#612 part 5, plain Node). render/newball.js is run, not read, over real engine games:
 *   - every foul that is not a foul bunt gets a plan; foul bunts and every other event get none
 *   - it starts after the plate umpire's foul signal is down (umpsig.js signalEnd) and ends before the event does (e.d)
 *   - the ball is in the bag (null) until the umpire pulls it, then never vanishes: umpire -> catcher -> lob, in that order, to the end
 *   - weights stay in 0..1; the umpire is back in his crouch and both hands back at rest once the lob starts
 *   - same input = same output (pure in time: a seek shows what playing there shows)
 * static.mjs runs this file. Usage: node tests/newball.check.mjs */
import { simGame, ARRIVE, BK_CALL_AT } from '../engine/index.js';
import { signalEnd } from '../render/umpsig.js';
import { newBallKind, newBallPlan, newBallAt, handSpot } from '../render/newball.js';

const T = { ARRIVE, BK_CALL_AT }, problems = [], bad = m => { if (problems.length < 30) problems.push(m); };
const ORDER = [null, 'ump', 'catcher', 'lob'];
let fouls = 0, bunts = 0;
for (let seed = 1; seed <= 60; seed++) for (const e of simGame(seed, {}, {}).ev) {
  const want = e.k === 'P' && e.r === 'foul' && !e.bunt, plan = newBallPlan(e, T);
  if (newBallKind(e) !== want || !!plan !== want) { bad(`seed ${seed}: ${e.k}/${e.r}${e.bunt ? ' bunt' : ''} plan ${!!plan}, want ${want}`); continue; }
  if (e.k === 'P' && e.r === 'foul' && e.bunt) bunts++;
  if (!plan) continue;
  fouls++;
  if (plan.t0 < signalEnd(e, T)) bad(`seed ${seed}: starts at ${plan.t0} before the foul signal ends`);
  if (e.d !== undefined && plan.end > e.d) bad(`seed ${seed}: ends at ${plan.end.toFixed(2)} s, after the event (${e.d} s)`);
  let last = 0, seenBall = false, catMax = 0, giveMax = 0;
  for (let u = 0; u <= e.d + .5; u += .02) {
    const s = newBallAt(plan, u), s2 = newBallAt(plan, u);
    if (JSON.stringify(s) !== JSON.stringify(s2)) bad(`seed ${seed}: not pure at ${u}`);
    if (!s) { if (u >= plan.t0 && u < plan.end) bad(`seed ${seed}: nothing at ${u} inside the plan`); continue; }
    for (const k of ['stand', 'reach', 'give', 'drop', 'cat', 'k']) if (!(s[k] >= 0 && s[k] <= 1 + 1e-9)) bad(`seed ${seed}: ${k} ${s[k]} at ${u}`);
    const o = ORDER.indexOf(s.ball);
    if (o < 0) bad(`seed ${seed}: ball state ${s.ball}`);
    if (o < last) bad(`seed ${seed}: ball went back from ${ORDER[last]} to ${s.ball} at ${u}`);
    if (seenBall && s.ball === null) bad(`seed ${seed}: the ball vanished at ${u}`);
    if (s.ball) seenBall = true;
    if (u < plan.pull - 1e-9 && s.ball) bad(`seed ${seed}: ball out of the bag before the pull (${u})`);
    if (s.ball === 'lob' && (s.stand > 1e-6 || s.cat > 1e-6 || s.drop < 1 - 1e-6)) bad(`seed ${seed}: hands not back at rest when the lob starts (${u})`);
    last = Math.max(last, o); catMax = Math.max(catMax, s.cat); giveMax = Math.max(giveMax, s.give);
  }
  if (!seenBall || last !== 3) bad(`seed ${seed}: the ball never reached the lob`);
  if (catMax < .99 || giveMax < .99) bad(`seed ${seed}: hands never met (cat ${catMax}, give ${giveMax})`);
}
const H = handSpot(0, 1.3);
if (!H.every(Number.isFinite) || !(H[2] > 1.3)) bad(`hand-over spot ${H} not behind the catcher`);
if (fouls < 50) bad(`only ${fouls} fouls seen`);
if (problems.length) { console.error('newball: FAIL\n  ' + problems.join('\n  ')); process.exit(1); }
console.log(`newball: OK (${fouls} fouls out of play, ${bunts} foul bunts without one)`);
