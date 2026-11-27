/* Corner fielders chasing caught foul flies (#620 part 3, plain Node). render/foulchase.js is run, not read, over real engine games:
 *   - only a caught foul fly by 1B / 3B / LF / RF with a chase of RUN_MIN m or more gets a facing; every other event or fielder: null
 *   - at contact and just before the catch he faces the ball (home side of the land point), so there is no snap from or to the old facing
 *   - mid-chase LF / RF face where they run (at the line); 1B / 3B drift side-on (about 90 deg from both run and ball when those differ)
 *   - unit vector, pure in time, and no turn faster than a person turns (MAX_TURN rad per s)
 * static.mjs runs this file. Usage: node tests/foulchase.check.mjs */
import { simGame, fielderStart } from '../engine/index.js';
import { foulChaseFace, FOUL_CHASERS, FOUL_TURN, RUN_MIN } from '../render/foulchase.js';

const MAX_TURN = 2 * Math.PI, DT = .02, EPS = 1e-6, problems = [], bad = m => { if (problems.length < 30) problems.push(m); };
const ang = v => Math.atan2(v[0], v[1]), diff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d <= -Math.PI) d += 2 * Math.PI; return Math.abs(d); };
const seen = { '1B': 0, '3B': 0, LF: 0, RF: 0 };
for (let seed = 1; seed <= 200; seed++) for (const e of simGame(seed, {}, { teams: [seed % 4, (seed + 1) % 4] }).ev) {
  const p = e.play, foul = e.k === 'P' && e.r === 'inplay' && p && p.foul;
  const key = p && p.fielder, from = key ? fielderStart(key, e.s0 ? e.s0.b : [0, 0, 0], e.s0 ? e.s0.outs : 0) : [0, 0];
  const catchT = e.plan ? e.plan.catchT : 1, run = e.plan && e.plan.stand ? Math.hypot(e.plan.stand[0] - from[0], e.plan.stand[1] - from[1]) : 0;
  const want = foul && key in FOUL_CHASERS && run >= RUN_MIN;
  if (!want) { if (foulChaseFace(e, catchT / 2, catchT, from)) bad(`seed ${seed}: facing on ${e.k}/${e.r}${key ? ' by ' + key : ''}`); continue; }
  seen[key]++;
  const aBall = Math.atan2(-p.lx, -p.lz), aRun = Math.atan2(e.plan.stand[0] - from[0], e.plan.stand[1] - from[1]);
  const f0 = foulChaseFace(e, 0, catchT, from), f1 = foulChaseFace(e, catchT - 1e-4, catchT, from);
  if (!f0 || diff(ang(f0), aBall) > 1e-3) bad(`seed ${seed} ${key}: not facing the ball at contact`);
  if (!f1 || diff(ang(f1), aBall) > 1e-2) bad(`seed ${seed} ${key}: not facing the ball at the catch`);
  if (foulChaseFace(e, catchT, catchT, from)) bad(`seed ${seed} ${key}: still steering after the catch`);
  if (catchT > 2 * FOUL_TURN + .1) {
    const m = foulChaseFace(e, catchT / 2, catchT, from), am = ang(m);
    if (FOUL_CHASERS[key]) { if (diff(aRun, aBall) > 2 && (diff(am, aBall) < 1 || diff(am, aRun) < 1)) bad(`seed ${seed} ${key}: not side-on mid-drift`); }
    else if (diff(am, aRun) > 1e-3) bad(`seed ${seed} ${key}: not facing his run mid-chase`);
  }
  let prev = null;
  for (let u = 0; u < catchT; u += DT) {
    const a = foulChaseFace(e, u, catchT, from), b = foulChaseFace(e, u, catchT, from);
    if (!a || JSON.stringify(a) !== JSON.stringify(b)) { bad(`seed ${seed} ${key}: not pure / missing at ${u.toFixed(2)}`); break; }
    if (Math.abs(Math.hypot(a[0], a[1]) - 1) > EPS) { bad(`seed ${seed} ${key}: not a unit vector`); break; }
    if (prev && diff(ang(a), ang(prev)) > MAX_TURN * DT + EPS) { bad(`seed ${seed} ${key}: turns ${(diff(ang(a), ang(prev)) / DT).toFixed(1)} rad/s at ${u.toFixed(2)}`); break; }
    prev = a;
  }
}
for (const k of Object.keys(seen)) if (seen[k] < 2) bad(`only ${seen[k]} chased foul flies by ${k} in 200 games: the check sees too few`);
if (problems.length) { console.error('foulchase check FAILED:\n  ' + problems.join('\n  ')); process.exit(1); }
console.log(`foulchase check OK: chased foul flies ${Object.entries(seen).map(([k, n]) => k + ' ' + n).join(', ')}; corner infielders drift side-on, corner outfielders run at the line, all face the ball at the catch`);
