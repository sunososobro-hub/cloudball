/* Line-drive double play (#614 part 13): a liner an infielder catches with a runner on and fewer than two outs; the runner
 * nearest the catch broke on contact in LD_DOUBLED_OFF_P of them (`rare` RNG) and is doubled off when the ball is held on his
 * base before he gets back (`resolveDoubledOff`, out reason `doubled_off`). Fails when
 *   - a seed in SEEDS (found at engine 0.4.34; 13 replaces 1 at 0.4.37, #815) has none, or the rate over GAMES seeds is outside RATE,
 *   - a doubled-off out is not right after a fly_catch of the batter on a fair LD to P/1B/2B/3B/SS with < 2 outs, is not at
 *     the runner's own base, is not before the runner gets back, or the runner is still on base after the play,
 *   - the result is not lineout, a run scores or the line lacks 雙殺,
 *   - the same seed does not give the same stream twice (rule 11).
 * static.mjs runs this file. Usage: node tests/ldp.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const GAMES = 600, SEEDS = [8, 13], RATE = [0.04, 0.16];
const INF = ['P', '1B', '2B', '3B', 'SS'];
const errs = [], bad = m => { if (errs.length < 20) errs.push(m); };

let found = 0;
const look = (s, pinned) => {
  const g = K.simGame(s, {}, { teams: [s % 4, (s + 1) % 4] }), S = g.stream;
  let here = 0;
  for (const x of S) {
    if (x.type !== 'out' || x.reason !== 'doubled_off') continue;
    if (g.ev[x.f].play && g.ev[x.f].play.ldTp) continue;   /* line-drive triple plays (#614 part 14): tests/ldtp.check.mjs */
    here++; found++;
    const e = g.ev[x.f], at = `seed ${s} frame ${x.f}`, F = S.filter(y => y.f === x.f), outs = F.filter(y => y.type === 'out');
    const c = F.find(y => y.type === 'contact'), pa = F.find(y => y.type === 'pa_end');
    if (!c || c.ball !== 'LD' || c.foul || c.bunt || !INF.includes(c.fielder)) { bad(`${at}: not a fair liner to an infielder`); continue; }
    if (e.s0.outs > 1) bad(`${at}: ${e.s0.outs} outs before the play`);
    if (outs.length !== 2 || outs[0].reason !== 'fly_catch' || outs[0].runner !== c.batter || outs[1] !== x) bad(`${at}: outs are ${outs.map(o => o.reason).join(',')}`);
    if (x.from !== x.base || e.s0.b[x.base - 1] !== x.runner) bad(`${at}: ${x.runner} was not on base ${x.base}`);
    if (!(Math.max(x.ballAt, x.touchAt) < x.runnerAt)) bad(`${at}: runner back first`);
    if (e.s1.b.includes(x.runner)) bad(`${at}: ${x.runner} still on base`);
    if (!e.play.ldDp || e.play.ldDp !== x.base) bad(`${at}: play.ldDp ${e.play.ldDp}`);
    if (!pa || pa.result !== 'lineout') bad(`${at}: result ${pa && pa.result}`);
    if (F.some(y => y.type === 'run_scored') || e.s1.sc.join() !== e.s0.sc.join()) bad(`${at}: a run scores`);
    if (!String(e.desc).includes('雙殺')) bad(`${at}: line "${e.desc}"`);
  }
  if (pinned && !here) bad(`seed ${s}: no line-drive double play`);
};
for (const s of SEEDS) look(s, true);
for (let s = 1; s <= GAMES; s++) look(s, false);
const rate = found / (GAMES + SEEDS.length);
if (rate < RATE[0] || rate > RATE[1]) bad(`rate ${rate.toFixed(3)} a game outside ${RATE}`);
const again = JSON.stringify(K.simGame(SEEDS[0], {}, { teams: [SEEDS[0] % 4, (SEEDS[0] + 1) % 4] }).stream);
if (again !== JSON.stringify(K.simGame(SEEDS[0], {}, { teams: [SEEDS[0] % 4, (SEEDS[0] + 1) % 4] }).stream)) bad(`seed ${SEEDS[0]} gives two different streams`);
console.log(`ldp: ${found} line-drive double plays (${SEEDS.length} pinned seeds + ${GAMES} games, ${rate.toFixed(3)} a game)`);
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
console.log('OK');
