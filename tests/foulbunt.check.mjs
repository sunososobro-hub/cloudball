/* Foul bunts (#614 part 3): a bunt attempt bunted foul is a strike at any count, so with two strikes it is a strikeout.
 * Runs seeds (at least MIN_GAMES, up to MAX_GAMES until a foul-bunt strikeout shows up) and fails when
 *   - foul bunts are not BUNT_FOUL_P of the bunt attempts (foul bunts + bunts put in play) within TOL,
 *   - a foul bunt is not a swing, or its stream `call` is not `foul` + `bunt: true` right after a `swing` of that batter,
 *   - a foul bunt on fewer than two strikes ends the plate appearance or does not add a strike,
 *   - a foul bunt on two strikes is not a strikeout (`pa_end` result `strikeout`, `strikeout_swinging` out of the batter),
 *   - no foul-bunt strikeout happens in MAX_GAMES games.
 * static.mjs runs this file. Usage: node tests/foulbunt.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const MIN_GAMES = 800, MAX_GAMES = 6000, TOL = 0.06;
const errs = [], bad = m => { if (errs.length < 20) errs.push(m); };
for (const c of ['BUNT_FOUL_P', 'BUNT_FOUL_RIGHT_P', 'BUNT_2K_KEEP_P']) if (typeof K[c] !== 'number') bad(`${c} is missing from engine/constants.js`);

let fouls = 0, inPlay = 0, k3 = 0, s = 0;
while (s < MAX_GAMES && (s < MIN_GAMES || !k3)) {
  s++;
  const g = K.simGame(s, {}, { teams: [s % 4, (s + 1) % 4] }), S = g.stream;
  for (const e of g.ev) {
    if (e.k !== 'P') continue;
    if (e.r === 'inplay' && e.play && e.play.bunt) inPlay++;
    if (!e.bunt) continue;
    fouls++;
    if (e.r !== 'foul' || !e.swing) bad(`seed ${s}: foul bunt at ${e.t} is r=${e.r} swing=${e.swing}`);
    if (e.c0[1] === K.STRIKES_FOR_OUT - 1) { k3++; if (!e.pa) bad(`seed ${s}: a two-strike foul bunt at ${e.t} did not end the plate appearance`); }
    else if (e.pa || e.c1[1] !== e.c0[1] + 1) bad(`seed ${s}: a foul bunt at ${e.t} on ${e.c0} went to ${e.c1}${e.pa ? ' and ended the PA' : ''}`);
  }
  S.forEach((c, i) => {
    if (c.type !== 'call' || !c.bunt) return;
    const sw = S.slice(0, i).reverse().find(x => x.f === c.f && x.type === 'swing');
    if (c.call !== 'foul' || !sw || sw.batter !== c.batter) bad(`seed ${s}: bunt call #${c.i} is ${c.call} without a swing of ${c.batter}`);
    const frame = S.filter(x => x.f === c.f), end = frame.find(x => x.type === 'pa_end');
    if (end) {
      const out = frame.find(x => x.type === 'out' && x.runner === c.batter && x.from === 0);
      if (end.result !== 'strikeout' || !out || out.reason !== 'strikeout_swinging') bad(`seed ${s}: foul-bunt call #${c.i} ends the PA as ${end.result}`);
    }
  });
}
const share = fouls / Math.max(1, fouls + inPlay);
if (Math.abs(share - K.BUNT_FOUL_P) > TOL) bad(`foul bunts are ${share.toFixed(3)} of bunt attempts, expected ${K.BUNT_FOUL_P} +- ${TOL}`);
if (!k3) bad(`no foul-bunt strikeout in ${s} games`);
if (errs.length) { console.error('foulbunt check FAILED:\n  ' + errs.join('\n  ')); process.exit(1); }
console.log(`foulbunt check OK: ${fouls} foul bunts (${share.toFixed(3)} of ${fouls + inPlay} attempts), ${k3} foul-bunt strikeouts, over ${s} games`);
