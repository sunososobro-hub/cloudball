/* Dead-ball time (#610): the pitching change, the half-inning break and the time after a hit by pitch got their real length,
 * built from named steps in engine/constants.js. Timing only: no outcome may change. Fails when
 *   - CHANGE_DUR, BREAK_DUR or PITCH_DUR.hbp is not the sum of its named steps,
 *   - over GAMES seeds, the stream with every time stripped (event times, ballAt / touchAt / fielderAt / runnerAt, the engine
 *     version) or any box score differs from OUTCOME_PRINT (engine 0.4.17 = the outcomes before #610's timing change; re-recorded at 0.4.19 for #614 part 1, caught foul flies, and at 0.4.20 for #614 part 2, foul-tip labels: box scores unchanged, and at 0.4.21 for #614 part 3, foul bunts, and at 0.4.22 for #614 part 4, dropped third strikes, and at 0.4.23 for #690, triple hang time, and at 0.4.24 for #684, wall-ball pickups, and at 0.4.25 for #614 part 5, the catcher's tag on a dropped third strike: same outs, new fielder, and at 0.4.26 for #614 part 6, check-swing appeal labels: box scores unchanged, and at 0.4.27 for #614 part 7, ground-rule doubles, and at 0.4.28 for #614 part 8, rundown labels on pickoffs: same outs, and at 0.4.29 for #614 part 9, catcher's interference, and at 0.4.30 for #614 part 10, dropped infield flies, and at 0.4.31 for #614 part 11, catcher's mound visits: new stream events only, outcomes of all 1000 games equal to 0.4.30 with them left out),
 *   - a CHG / BRK frame or a hit-by-pitch frame does not take its new length.
 * If outcomes change on purpose later (a new play, a retune): bump ENGINE_VERSION and record the new print here.
 * static.mjs runs this file. Usage: node tests/deadball.check.mjs [--print] */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const GAMES = 1000;
const OUTCOME_PRINT = 'b8c0691a3e2973df';   /* engine 0.4.38 (#794 part 5, pitcher arm adds velocity: outcomes move); c4d4bc5bf7680f39 at 0.4.37 (#614 part 15, obstruction: batter awarded second on an outfield single, outcomes move); 666f16b0ac433acc at 0.4.36 (#794 part 3, extra bases taken read runner spd and outfielder arm, coach IBB from the 9th: outcomes move); 6e6e097c2f363ade at 0.4.35 (#614 part 14, line-drive triple plays: hit-and-run runners off with two on, outcomes move); f7cdaf14590e90a2 at 0.4.34 (#794, the batter-runner runs at his spd pace: outcomes move); 4deef30c11d515bd at 0.4.33 (#614 part 13, line-drive double plays: outcomes move); 8dea479f0495594b at 0.4.32 (#614 part 12, triple plays: none in these 1000 games, print unchanged) and 0.4.31 (#614 part 11, catcher's mound visits: stream events only); dd23164e1375fb00 at 0.4.30 (#614 part 10, a dropped infield fly is an out, not an error); 11ffb02c5fda01b4 at 0.4.29 (#614 part 9, catcher's interference from its own seeded RNG); a722a56ebf1e5ed1 at 0.4.28 (#614 part 8, rundowns on pickoffs: same outs, new ball path); 54e5eebc323366a2 at 0.4.27 (#614 part 7, ground-rule doubles); 1332a5019f597720 at 0.4.26 (#614 part 6, check-swing appeal labels: box scores unchanged); 644041451fe6ac9f at 0.4.25 (#614 part 5, catcher tags the batter); c80b6ef73d02a3e4 at 0.4.24 (#684, hit rolls stop at the wall); 22806bdd6d691fee at 0.4.23 (#690: a triple stays up for d / HIT_HORIZ_SPEED_MAX); 53d39a95eaecd7d1 at 0.4.22 (#614 part 4), 835156506a7b8055 at 0.4.21, afa174cb1a4e038c at 0.4.20, c51e555227982ade at 0.4.19, aa29046229aca344 at 0.4.17 / 0.4.18 */
const TIME_KEY = /^(t|time|ballAt|touchAt|fielderAt|runnerAt|engine)$/;
const errs = [], bad = m => { if (errs.length < 20) errs.push(m); };
const near = (a, b) => Math.abs(a - b) < 1e-9;

const strip = v => Array.isArray(v) ? v.map(strip) : v && typeof v === 'object'
  ? Object.fromEntries(Object.entries(v).filter(([k, x]) => !TIME_KEY.test(k) && x !== undefined).map(([k, x]) => [k, strip(x)])) : v;

if (K.CHANGE_DUR !== undefined && K.RELIEF_SIGNAL_DUR !== undefined) {
  const warm = n => n * K.WARMUP_PITCH_GAP;
  if (!near(K.CHANGE_DUR, K.RELIEF_SIGNAL_DUR + K.BULLPEN_JOG_M / K.RELIEF_JOG_SPEED + warm(K.RELIEF_WARMUP_PITCHES) + K.RELIEF_SETTLE_DUR)) bad(`CHANGE_DUR ${K.CHANGE_DUR} is not signal + jog in + warm-ups + settle`);
  if (!near(K.BREAK_DUR, K.BRK_SWAP_DUR + warm(K.BRK_WARMUP_PITCHES) + K.BRK_THROW_AROUND_DUR + K.BRK_BATTER_IN_DUR)) bad(`BREAK_DUR ${K.BREAK_DUR} is not swap + warm-ups + throw around + batter in`);
  if (!near(K.PITCH_DUR.hbp, K.HBP_PLAY_DUR + K.HBP_CHECK_DUR)) bad(`PITCH_DUR.hbp ${K.PITCH_DUR.hbp} is not play + trainer check`);
} else bad('the #610 dead-ball constants are missing from engine/constants.js');

const h = createHash('sha256');
let chg = 0, brk = 0, hbp = 0;
for (let s = 1; s <= GAMES; s++) {
  const g = K.simGame(s, {}, { teams: [s % 4, (s + 1) % 4] });
  h.update(JSON.stringify(strip(g.stream)));
  h.update(JSON.stringify(K.boxFromStream(g.stream)));
  h.update(JSON.stringify([g.stats, g.pst, strip(g.final)]));
  for (const e of g.ev) {
    if (e.k === 'CHG') { chg++; if (!near(e.d, K.CHANGE_DUR)) bad(`seed ${s}: CHG frame ${e.d} s, not CHANGE_DUR`); }
    else if (e.k === 'BRK') { brk++; if (!near(e.d, K.BREAK_DUR)) bad(`seed ${s}: BRK frame ${e.d} s, not BREAK_DUR`); }
    else if (e.k === 'P' && e.r === 'hbp') { hbp++; if (!(e.d >= K.PITCH_DUR.hbp - 1e-9)) bad(`seed ${s}: hit-by-pitch frame ${e.d} s, shorter than PITCH_DUR.hbp`); }
  }
}
const print = h.digest('hex').slice(0, 16);
if (process.argv.includes('--print')) { console.log(print); process.exit(0); }
if (!(chg && brk && hbp)) bad(`no CHG (${chg}), BRK (${brk}) or hit-by-pitch (${hbp}) frame in ${GAMES} games: the check proves nothing`);
if (print !== OUTCOME_PRINT) bad(`outcome print ${print}, recorded ${OUTCOME_PRINT}: an outcome changed without a new print (#610 is timing only)`);
if (errs.length) { console.error('deadball check FAILED:\n  ' + errs.join('\n  ')); process.exit(1); }
console.log(`deadball check ok: ${GAMES} games, outcomes = recorded print (${print}); ${chg} pitching changes at ${K.CHANGE_DUR} s, ${brk} breaks at ${K.BREAK_DUR} s, ${hbp} hit batters at ${K.PITCH_DUR.hbp} s`);
