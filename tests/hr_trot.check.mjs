/* Home-run trot (#266 slice 1): every runner of a home run, the batter included, trots at HR_TROT_SPEED
 * (engine/constants.js) instead of RUN_SPEED, so the picture (render/game.js reads each move's timeline) is a slow trot.
 * Fails when, over GAMES games,
 *   - no home run happens (the check would prove nothing),
 *   - a home-run move is not timed at HR_TROT_SPEED, or a non-home-run batted move is,
 *   - the batter's home-to-home trot falls outside TROT_S (seconds),
 *   - runners cross the plate out of order (a runner behind would pass the one ahead),
 *   - a home-run frame ends before its last runner has crossed the plate,
 *   - the same seed gives two different games.
 * static.mjs runs this file.
 * Usage: node tests/hr_trot.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { simGame, HR_TROT_SPEED, RUN_SPEED } = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const GAMES = 200, TROT_S = [20, 25];
const errs = [], bad = m => { if (errs.length < 20) errs.push(m); };
if (!(HR_TROT_SPEED > 0 && HR_TROT_SPEED < RUN_SPEED)) bad(`HR_TROT_SPEED ${HR_TROT_SPEED} must be above 0 and below RUN_SPEED ${RUN_SPEED}`);
let hrs = 0, trotMin = Infinity, trotMax = 0;
for (let s = 1; s <= GAMES; s++) {
  const g = simGame(s, {}, { teams: [s % 4, (s + 1) % 4] });
  if (s <= 3 && JSON.stringify(simGame(s, {}, { teams: [s % 4, (s + 1) % 4] }).stream) !== JSON.stringify(g.stream)) bad(`seed ${s}: two runs differ`);
  g.ev.forEach((e, i) => {
    if (e.k !== 'P' || e.r !== 'inplay' || !e.moves) return;
    const hr = e.play.res === 'HR';
    for (const [from, to, , tl] of e.moves) {
      if (hr !== (tl.spd === HR_TROT_SPEED)) bad(`seed ${s} ev ${i}: ${hr ? 'home-run' : 'batted'} move ${from}->${to} at ${tl.spd} m/s`);
    }
    if (!hr) return;
    hrs++;
    const bat = e.moves.find(m => m[0] === 0);
    if (!bat || bat[1] !== 4) { bad(`seed ${s} ev ${i}: home run without the batter going 0->4`); return; }
    const trot = bat[3].arriveT - bat[3].st0;
    trotMin = Math.min(trotMin, trot); trotMax = Math.max(trotMax, trot);
    if (trot < TROT_S[0] || trot > TROT_S[1]) bad(`seed ${s} ev ${i}: batter trot ${trot.toFixed(1)} s outside ${TROT_S.join('-')} s`);
    const order = e.moves.filter(m => m[1] === 4).sort((a, b) => b[0] - a[0]);
    for (let k = 1; k < order.length; k++) if (order[k][3].arriveT <= order[k - 1][3].arriveT) bad(`seed ${s} ev ${i}: runner from ${order[k][0]} crosses before the runner from ${order[k - 1][0]}`);
    const last = Math.max(...e.moves.map(m => m[3].arriveT));
    if (typeof e.d !== 'number' || e.d < last) bad(`seed ${s} ev ${i}: frame lasts ${e.d} s, last runner home at ${last.toFixed(1)} s`);
  });
}
if (!hrs) bad(`no home run in ${GAMES} games`);
if (errs.length) { console.error('FAIL hr_trot:\n' + errs.join('\n')); process.exit(1); }
console.log(`OK: ${hrs} home runs in ${GAMES} games, every runner trots at ${HR_TROT_SPEED} m/s, batter home to home ${trotMin.toFixed(1)}-${trotMax.toFixed(1)} s, in order, inside the frame.`);
