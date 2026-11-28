/* Triple play (#614 part 12): with nobody out and runners on first and second (bases loaded too), a double-play grounder to
 * the third baseman becomes a 5-4-3 triple play when all three forces beat their runners (`resolveTriple`): 3B steps on
 * third, throws to the pivot at second, the pivot relays to first. No draw: the timing decides. Fails when
 *   - a seed in SEEDS (found at engine 0.4.32; 2273 replaces 6270 at 0.4.34, #794) has no triple play, or a triple play shows up out of its situation
 *     (not 3B, outs, first or second empty) over GAMES seeds,
 *   - a triple play is not three force outs at third, second and first by 3B, 2B and 1B in that time order, each before its
 *     runner, or a runner moves, a run scores, the half does not end, the result is not triple_play or the line lacks 三殺,
 *   - the same seed does not give the same stream twice (rule 11).
 * static.mjs runs this file. Usage: node tests/tripleplay.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const GAMES = 1500, SEEDS = [1334, 1451, 2220, 2273];
const WANT = [[3, '3B', 2], [2, '2B', 1], [1, '1B', 0]];   /* base, fielder, the runner's starting base */
const errs = [], bad = m => { if (errs.length < 20) errs.push(m); };

let found = 0;
const look = (s, pinned) => {
  const g = K.simGame(s, {}, { teams: [s % 4, (s + 1) % 4] }), S = g.stream;
  let here = 0;
  for (const x of S) {
    if (x.type !== 'pa_end' || x.result !== 'triple_play') continue;
    if (g.ev[x.f].play && g.ev[x.f].play.ldTp) continue;   /* line-drive triple plays (#614 part 14): tests/ldtp.check.mjs */
    here++; found++;
    const e = g.ev[x.f], at = `seed ${s} frame ${x.f}`, F = S.filter(y => y.f === x.f), outs = F.filter(y => y.type === 'out');
    if (!e.play || e.play.fielder !== '3B' || e.play.type !== 'GB' || e.s0.outs !== 0 || !e.s0.b[0] || !e.s0.b[1]) bad(`${at}: triple play out of its situation`);
    if (!e.play || !e.play.tp) bad(`${at}: play not flagged tp`);
    if (outs.length !== 3) { bad(`${at}: ${outs.length} outs`); continue; }
    outs.forEach((o, i) => {
      const [base, fielder, from] = WANT[i];
      if (o.reason !== 'force' || o.base !== base || o.fielder !== fielder || o.from !== from) bad(`${at}: out ${i + 1} is ${o.reason} at ${o.base} by ${o.fielder} from ${o.from}`);
      if (!(Math.max(o.ballAt, o.touchAt) < o.runnerAt)) bad(`${at}: out ${i + 1} not before its runner`);
      if (i && o.t < outs[i - 1].t) bad(`${at}: out ${i + 1} before out ${i}`);
    });
    if (outs[0].runner !== e.s0.b[1] || outs[1].runner !== e.s0.b[0] || outs[2].runner !== x.batter) bad(`${at}: wrong runners out`);
    if (F.some(y => y.type === 'runner_advance' && y.from > 0) || F.some(y => y.type === 'run_scored')) bad(`${at}: a runner moves or a run scores`);
    if (e.s1 && e.s1.sc.join() !== e.s0.sc.join()) bad(`${at}: the score changes`);
    if (e.s1 && e.s1.outs !== K.OUTS_PER_HALF) bad(`${at}: ${e.s1.outs} outs after the play`);
    if (!S.some(y => y.type === 'half_end' && y.f >= x.f && y.f <= x.f + 1)) bad(`${at}: the half does not end`);
    if (!String(e.desc).includes('三殺')) bad(`${at}: line "${e.desc}"`);
  }
  if (pinned && !here) bad(`seed ${s}: no triple play`);
};
for (const s of SEEDS) look(s, true);
for (let s = 1; s <= GAMES; s++) look(s, false);
const again = JSON.stringify(K.simGame(SEEDS[0], {}, { teams: [SEEDS[0] % 4, (SEEDS[0] + 1) % 4] }).stream);
if (again !== JSON.stringify(K.simGame(SEEDS[0], {}, { teams: [SEEDS[0] % 4, (SEEDS[0] + 1) % 4] }).stream)) bad(`seed ${SEEDS[0]} gives two different streams`);
console.log(`tripleplay: ${found} triple plays (${SEEDS.length} pinned seeds + ${GAMES} games)`);
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
console.log('OK');
