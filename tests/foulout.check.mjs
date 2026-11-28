/* Caught foul flies (#614 part 1): a ball fouled off in the air can be caught in foul ground for a fly-catch out.
 * Runs GAMES seeds and fails when
 *   - caught foul flies per game fall outside RATE (about 1.4 in MLB, engine/constants.js FOUL_OUT_P),
 *   - a contact marked `foul` lands in fair ground (inside the 45-degree foul lines, in front of the plate),
 *   - it is not followed in its frame by a `fly_catch` out of that batter by the contact's fielder,
 *   - its fielder is not one of FOUL_OUT_ZONES, or its plate appearance does not end as a popout, flyout or sacrifice fly (a runner may tag up),
 *   - no catcher, first-baseman, third-baseman and corner-outfielder foul catch shows up at all.
 * static.mjs runs this file. Usage: node tests/foulout.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const GAMES = 300, RATE = [0.8, 2.2];
const errs = [], bad = m => { if (errs.length < 20) errs.push(m); };
const keys = new Set((K.FOUL_OUT_ZONES || []).map(z => z[0])), seen = new Set();
if (!keys.size) bad('FOUL_OUT_ZONES is missing from engine/constants.js');
/* foul ground: beyond either foul line (|x| > depth toward centre field) or behind the plate */
const isFoul = ([x, z]) => Math.abs(x) > -z;

let n = 0;
for (let s = 1; s <= GAMES; s++) {
  const g = K.simGame(s, {}, { teams: [s % 4, (s + 1) % 4] }), S = g.stream;
  S.forEach((c, i) => {
    if (c.type !== 'contact' || !c.foul) return;
    n++; seen.add(c.fielder);
    if (!isFoul(c.land)) bad(`seed ${s}: foul fly #${c.i} lands in fair ground at [${c.land}]`);
    if (!keys.has(c.fielder)) bad(`seed ${s}: foul fly #${c.i} caught by ${c.fielder}, not a FOUL_OUT_ZONES fielder`);
    const frame = S.filter(x => x.f === c.f);
    const out = frame.find(x => x.type === 'out' && x.runner === c.batter && x.from === 0);
    if (!out || out.reason !== 'fly_catch' || out.fielder !== c.fielder) bad(`seed ${s}: foul fly #${c.i} has no fly_catch of ${c.batter} by ${c.fielder}`);
    const end = frame.find(x => x.type === 'pa_end');
    if (!end || !['popout', 'flyout', 'sac_fly'].includes(end.result)) bad(`seed ${s}: foul fly #${c.i} ends the PA as ${end && end.result}`);
  });
}
const perGame = n / GAMES;
if (perGame < RATE[0] || perGame > RATE[1]) bad(`${perGame.toFixed(2)} caught foul flies per game, expected ${RATE[0]}..${RATE[1]}`);
for (const k of ['C', '1B', '3B', 'LF', 'RF']) if (!seen.has(k)) bad(`no foul fly caught by ${k} in ${GAMES} games`);
if (errs.length) { console.error('foulout check FAILED:\n  ' + errs.join('\n  ')); process.exit(1); }
console.log(`foulout check OK: ${perGame.toFixed(2)} caught foul flies per game over ${GAMES} games, by ${[...seen].sort().join(' ')}`);
