/* Headless smoke check: every seed must produce a finished game with a consistent score. */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { simGame } = require('../../engine/sim/sim.js');

const GAMES = Number(process.env.GAMES || 200);
let failures = 0, runs = 0;
for (let seed = 1; seed <= GAMES; seed++) {
  const g = simGame(seed, {});
  const end = g.ev[g.ev.length - 1];
  const lineTotal = g.final.ls.map(ls => ls.reduce((a, b) => a + (b || 0), 0));
  if (end.k !== 'END') { failures++; console.error(`seed ${seed}: game did not end`); }
  if (lineTotal[0] !== g.final.sc[0] || lineTotal[1] !== g.final.sc[1]) { failures++; console.error(`seed ${seed}: score != line score`); }
  if (JSON.stringify(simGame(seed, {}).final) !== JSON.stringify(g.final)) { failures++; console.error(`seed ${seed}: not deterministic`); }
  runs += g.final.sc[0] + g.final.sc[1];
}
console.log(`${GAMES} games, ${(runs / GAMES).toFixed(2)} runs/game, ${failures} failures`);
process.exit(failures ? 1 : 0);
