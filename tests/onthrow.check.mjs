/* Advancing on a throw (#38 part 7): on an outfield single that scores the runner from second, the outfielder may
 * throw home behind him and the batter takes second on the throw. Fails when, over GAMES games,
 *   - it never happens, or happens more often than MAX_PER_GAME a game (a first-guess band, not a tuning target),
 *   - the batter takes second on a single without the runner from second scoring in the same play,
 *   - the throw does not go to the catcher covering home, or he receives it before the runner from second scores
 *     (the runner is safe: the ball must come in behind him), or the batter reaches second before the runner scores,
 *   - such a play records an out,
 *   - the same seed does not give the same game.
 * static.mjs runs this file.
 * Usage: node tests/onthrow.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { simGame } = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const { HOME } = await import(pathToFileURL(path.join(ROOT, 'engine/rules/field.js')));
const GAMES = 400, MAX_PER_GAME = 1;
const problems = [], bad = m => problems.push(m);
let n = 0;
for (let s = 1; s <= GAMES; s++) {
  const st = simGame(s, {}, { teams: [s % 4, (s + 1) % 4] }).stream;
  if (s <= 10 && JSON.stringify(st) !== JSON.stringify(simGame(s, {}, { teams: [s % 4, (s + 1) % 4] }).stream)) bad(`seed ${s}: not deterministic`);
  let pa = [];
  for (const e of st) {
    if (e.type !== 'pa_end') { pa.push(e); continue; }
    const bTo2 = pa.find(x => x.type === 'runner_advance' && x.from === 0 && x.to === 2);
    if (e.result === 'single' && bTo2 && bTo2.how !== 'error' && bTo2.how !== 'obstruction') {   /* how 'error': an outfield bobble (tests/bobble.check.mjs); 'obstruction': tests/obstruction.check.mjs */
      n++;
      const scored = pa.find(x => x.type === 'runner_advance' && x.from === 2 && x.to === HOME);
      const thr = pa.find(x => x.type === 'fielder_action' && x.action === 'throw' && x.to === 'C');
      const rec = pa.find(x => x.type === 'fielder_action' && x.action === 'receive' && x.fielder === 'C' && x.base === HOME);
      if (!scored) bad(`seed ${s} t ${e.t}: batter took second on a single, nobody scored from second`);
      else {
        if (!thr || !rec) bad(`seed ${s} t ${e.t}: batter took second on a single without a throw home`);
        else if (rec.t < scored.t) bad(`seed ${s} t ${e.t}: catcher has the ball (${rec.t}) before the runner scores (${scored.t})`);
        if (bTo2.t < scored.t) bad(`seed ${s} t ${e.t}: batter at second before the runner scores`);
      }
      if (pa.some(x => x.type === 'out')) bad(`seed ${s} t ${e.t}: an out on an advance on the throw`);
    }
    pa = [];
  }
}
if (!n) bad('no batter ever took second on a throw home');
if (n / GAMES > MAX_PER_GAME) bad(`${(n / GAMES).toFixed(2)} advances on the throw a game, more than ${MAX_PER_GAME}`);
console.log(`onthrow: ${GAMES} games, batter took second on the throw home ${n} times (${(n / GAMES).toFixed(3)} a game)`);
if (problems.length) { for (const p of problems.slice(0, 20)) console.error(`FAIL ${p}`); process.exit(1); }
console.log('onthrow check: OK');
