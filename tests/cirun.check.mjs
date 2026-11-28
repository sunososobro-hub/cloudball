/* #732 part 3: catcher's interference, the run to first. Plain Node, runs the engine over seeds 1-GAMES.
 * The renderer draws the batter's jog (bat laid down by batdrop.js `lay`) and the forced runners from the frame's `moves`, so the timing it
 * reads must be right. Fails when, on a `ci` pitch frame,
 *   - no move takes the batter 0 -> 1, or a move is not one base, or a runner moves who is not forced (a runner on 1st / 2nd / 3rd moves only
 *     when every base behind him is full),
 *   - any runner starts (`st0`) before the dead-ball call (ARRIVE + CALL_LAG): nobody leaves before the umpire signals time,
 *   - a runner arrives after the frame ends (`arriveT` > `d`) or before he starts,
 *   - the batter walks faster than RUN_MAX m/s (a jog, not a sprint: the ball is dead).
 * static.mjs runs this file. Usage: node tests/cirun.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const GAMES = 1500, RUN_MAX = 6, errs = [], bad = m => { if (errs.length < 20) errs.push(m); };
let n = 0, forced = 0;
for (let s = 1; s <= GAMES; s++) {
  const g = K.simGame(s, {}, { teams: [s % 4, (s + 1) % 4] });
  (g.ev || []).forEach((e, i) => {
    if (e.k !== 'P' || e.r !== 'ci') return;
    n++;
    const at = `seed ${s} event ${i}`, call = K.ARRIVE + K.CALL_LAG, b = e.s0.b, mv = e.moves || [];
    if (!mv.some(m => m[0] === 0 && m[1] === 1)) bad(`${at}: the batter does not go 0 -> 1`);
    for (const [from, to, name, tl] of mv) {
      if (to !== from + 1 && !(from === 3 && to === 4)) bad(`${at}: ${name} moves ${from} -> ${to}`);
      if (from > 0 && !b.slice(0, from).every(Boolean)) bad(`${at}: ${name} moves from ${from} but is not forced`);
      if (from > 0) forced++;
      if (!tl || !Number.isFinite(tl.st0) || !Number.isFinite(tl.arriveT)) { bad(`${at}: ${name} has no timeline`); continue; }
      if (tl.st0 < call) bad(`${at}: ${name} starts at ${tl.st0} before the dead-ball call at ${call}`);
      if (tl.arriveT <= tl.st0) bad(`${at}: ${name} arrives ${tl.arriveT} before he starts ${tl.st0}`);
      if (tl.arriveT > e.d + 1e-9) bad(`${at}: ${name} arrives ${tl.arriveT} after the frame ends ${e.d}`);
      if (tl.spd > RUN_MAX) bad(`${at}: ${name} runs ${tl.spd} m/s`);
    }
    for (let k = 1; k <= 3; k++) if (b[k - 1] && b.slice(0, k).every(Boolean) && !mv.some(m => m[0] === k)) bad(`${at}: forced runner on ${k} does not move`);
  });
}
if (!n) bad('no catcher_interference in seeds 1-' + GAMES);
if (!forced) bad('no ci with a forced runner in seeds 1-' + GAMES);
if (errs.length) { console.error('cirun.check FAIL\n  ' + errs.join('\n  ')); process.exit(1); }
console.log(`cirun.check ok (${n} ci, ${forced} forced-runner moves in ${GAMES} games)`);
