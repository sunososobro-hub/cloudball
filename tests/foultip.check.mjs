/* Foul tips (#614 part 2): a swing that ticks the ball straight into the catcher's mitt is a strike with the ball live,
 * and with two strikes a swinging strikeout. Runs GAMES seeds and fails when
 *   - foul tips are not FOUL_TIP_OF_WHIFF of the swinging strikes (within TOL), or fewer than MIN_PER_GAME per game,
 *   - a `tip` call is not a `swinging_strike` right after a `swing` of the same batter,
 *   - a tip frame is also a wild pitch / passed ball (a ball that got by was not held),
 *   - a tip on two strikes is not followed in its frame by a `strikeout_swinging` out of that batter, or a tip on fewer
 *     strikes ends the plate appearance or does not add a strike,
 *   - no tip ever comes with a steal under way (the ball stays live, the runner goes on).
 * static.mjs runs this file. Usage: node tests/foultip.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const GAMES = 300, TOL = 0.02, MIN_PER_GAME = 1;
const errs = [], bad = m => { if (errs.length < 20) errs.push(m); };
if (typeof K.FOUL_TIP_OF_WHIFF !== 'number') bad('FOUL_TIP_OF_WHIFF is missing from engine/constants.js');

let tips = 0, whiffs = 0, k3 = 0, withSteal = 0;
for (let s = 1; s <= GAMES; s++) {
  const g = K.simGame(s, {}, { teams: [s % 4, (s + 1) % 4] }), S = g.stream;
  for (const e of g.ev) {
    if (e.k !== 'P' || e.r !== 'sstr') continue;
    whiffs++;
    if (!e.tip) continue;
    tips++;
    if (e.wp || e.pb) bad(`seed ${s}: a foul tip at ${e.t} got by the catcher (wild pitch / passed ball)`);
    if (e.sbGo) withSteal++;
    if (e.c0[1] === K.STRIKES_FOR_OUT - 1) { k3++; if (!e.pa) bad(`seed ${s}: a two-strike foul tip at ${e.t} did not end the plate appearance`); }
    else if (e.pa || e.c1[1] !== e.c0[1] + 1) bad(`seed ${s}: a foul tip at ${e.t} on ${e.c0} went to ${e.c1}${e.pa ? ' and ended the PA' : ''}`);
  }
  S.forEach((c, i) => {
    if (c.type !== 'call' || !c.tip) return;
    const sw = S.slice(0, i).reverse().find(x => x.f === c.f && x.type === 'swing');
    if (c.call !== 'swinging_strike' || !sw || sw.batter !== c.batter) bad(`seed ${s}: tip call #${c.i} is ${c.call} without a swing of ${c.batter}`);
    const frame = S.filter(x => x.f === c.f), end = frame.find(x => x.type === 'pa_end');
    if (end) {
      const out = frame.find(x => x.type === 'out' && x.runner === c.batter && x.from === 0);
      if (end.result !== 'strikeout' || !out || out.reason !== 'strikeout_swinging') bad(`seed ${s}: tip call #${c.i} ends the PA as ${end.result}`);
    }
  });
}
const share = tips / Math.max(1, whiffs), perGame = tips / GAMES;
if (Math.abs(share - K.FOUL_TIP_OF_WHIFF) > TOL) bad(`foul tips are ${share.toFixed(3)} of swinging strikes, expected ${K.FOUL_TIP_OF_WHIFF} +- ${TOL}`);
if (perGame < MIN_PER_GAME) bad(`${perGame.toFixed(2)} foul tips per game, expected at least ${MIN_PER_GAME}`);
if (!k3) bad(`no foul-tip strikeout in ${GAMES} games`);
if (!withSteal) bad(`no foul tip with a steal under way in ${GAMES} games`);
if (errs.length) { console.error('foultip check FAILED:\n  ' + errs.join('\n  ')); process.exit(1); }
console.log(`foultip check OK: ${perGame.toFixed(2)} foul tips per game (${share.toFixed(3)} of swinging strikes), ${k3} strikeouts, ${withSteal} during a steal, over ${GAMES} games`);
