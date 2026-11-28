/* Line-drive triple play (#614 part 14): nobody out, two runners off on a hit-and-run, a liner an infielder catches; the
 * fielder holds the ball on the first runner's base before he is back (`resolveDoubledOff`), then throws on to the other
 * runner's base, whose cover holds it there before that runner is back: three outs (fly_catch, doubled_off, doubled_off).
 * Both runners broke with the pitch from the primary lead; LD_BOTH_BROKE_OF_P of the broken-runner liners (`rare` RNG, same number).
 * Fails when
 *   - a seed in SEEDS (found at engine 0.4.35; 3803 and 5237 replace 2247 and 780 at 0.4.36, #794 part 3) has none, or the rate over GAMES seeds is above MAX_RATE,
 *   - a line-drive triple play is not a fair LD to P/1B/2B/3B/SS with nobody out and two runners on,
 *   - its outs are not fly_catch of the batter then two doubled_off at the runners' own bases, each before its runner is back,
 *     the second after the first, the second held by a fielder who received a throw from the first one's fielder,
 *   - the result is not triple_play, a run scores, the half does not end, or the line lacks 三殺,
 *   - the same seed does not give the same stream twice (rule 11).
 * static.mjs runs this file. Usage: node tests/ldtp.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const GAMES = 800, SEEDS = [5237, 3803, 2466, 4109], MAX_RATE = 0.01;
const INF = ['P', '1B', '2B', '3B', 'SS'];
const errs = [], bad = m => { if (errs.length < 20) errs.push(m); };

let found = 0;
const look = (s, pinned) => {
  const g = K.simGame(s, {}, { teams: [s % 4, (s + 1) % 4] }), S = g.stream;
  let here = 0;
  for (const x of S) {
    if (x.type !== 'pa_end' || !g.ev[x.f].play || !g.ev[x.f].play.ldTp) continue;
    here++; found++;
    const e = g.ev[x.f], at = `seed ${s} frame ${x.f}`, F = S.filter(y => y.f === x.f), outs = F.filter(y => y.type === 'out');
    const c = F.find(y => y.type === 'contact');
    if (!c || c.ball !== 'LD' || c.foul || c.bunt || !INF.includes(c.fielder)) { bad(`${at}: not a fair liner to an infielder`); continue; }
    if (e.s0.outs !== 0 || e.s0.b.filter(Boolean).length < 2) bad(`${at}: ${e.s0.outs} outs, ${e.s0.b.filter(Boolean).length} on`);
    if (outs.length !== 3) { bad(`${at}: ${outs.length} outs`); continue; }
    const [o0, o1, o2] = outs;
    if (o0.reason !== 'fly_catch' || o0.runner !== c.batter) bad(`${at}: first out ${o0.reason}`);
    for (const o of [o1, o2]) {
      if (o.reason !== 'doubled_off') { bad(`${at}: out ${o.reason}`); continue; }
      if (o.from !== o.base || e.s0.b[o.base - 1] !== o.runner) bad(`${at}: ${o.runner} was not on base ${o.base}`);
      if (!(Math.max(o.ballAt, o.touchAt) < o.runnerAt)) bad(`${at}: ${o.runner} back first`);
      if (e.s1.b.includes(o.runner)) bad(`${at}: ${o.runner} still on base`);
    }
    if (o1.base === o2.base || o1.runner === o2.runner) bad(`${at}: the same runner or base twice`);
    if (o2.t < o1.t || o2.ballAt <= o1.ballAt) bad(`${at}: third out before the second`);
    const th = e.plan.actions.find(a => a.a === 'throw' && a.f === o1.fielder && a.to === o2.fielder);
    const rc = e.plan.actions.find(a => a.a === 'receive' && a.f === o2.fielder && a.base === o2.base);
    if (!th || !rc || rc.t < th.t) bad(`${at}: no throw ${o1.fielder} -> ${o2.fielder} at base ${o2.base}`);
    if (e.play.ldDp !== o1.base || e.play.ldTp !== o2.base) bad(`${at}: play.ldDp ${e.play.ldDp} ldTp ${e.play.ldTp}`);
    if (x.result !== 'triple_play') bad(`${at}: result ${x.result}`);
    if (F.some(y => y.type === 'run_scored') || e.s1.sc.join() !== e.s0.sc.join()) bad(`${at}: a run scores`);
    if (e.s1.outs !== K.OUTS_PER_HALF) bad(`${at}: ${e.s1.outs} outs after the play`);
    if (!S.some(y => y.type === 'half_end' && y.f >= x.f && y.f <= x.f + 1)) bad(`${at}: the half does not end`);
    if (!String(e.desc).includes('三殺')) bad(`${at}: line "${e.desc}"`);
  }
  if (pinned && !here) bad(`seed ${s}: no line-drive triple play`);
};
for (const s of SEEDS) look(s, true);
for (let s = 1; s <= GAMES; s++) look(s, false);
const rate = found / (GAMES + SEEDS.length);
if (rate > MAX_RATE) bad(`rate ${rate.toFixed(4)} a game above ${MAX_RATE}`);
const again = JSON.stringify(K.simGame(SEEDS[0], {}, { teams: [SEEDS[0] % 4, (SEEDS[0] + 1) % 4] }).stream);
if (again !== JSON.stringify(K.simGame(SEEDS[0], {}, { teams: [SEEDS[0] % 4, (SEEDS[0] + 1) % 4] }).stream)) bad(`seed ${SEEDS[0]} gives two different streams`);
console.log(`ldtp: ${found} line-drive triple plays (${SEEDS.length} pinned seeds + ${GAMES} games, ${rate.toFixed(4)} a game)`);
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
console.log('OK');
