/* Tag-ups on a caught ball (#38 part 13): a runner tags and moves up only on a fly or a line drive an outfielder catches.
 * Fails when, over GAMES games,
 *   - a runner advances on a caught ball an infielder (or the pitcher) caught, or on a pop-up or ground ball,
 *   - a tag-up happens with two outs before the catch,
 *   - a sacrifice fly does not score the runner from third, or a runner scores from third on a catch without a sac fly,
 *   - no sacrifice fly ever comes on a line drive (the liner tag-up is never exercised),
 *   - the same seed does not give the same game.
 * static.mjs runs this file.
 * Usage: node tests/tagup.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { simGame } = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const { OUTFIELD_KEYS } = await import(pathToFileURL(path.join(ROOT, 'engine/rules/field.js')));
const GAMES = 400;
const problems = [], bad = m => problems.push(m);
let tags = 0, sf = 0, sfLiner = 0;
for (let s = 1; s <= GAMES; s++) {
  const g = simGame(s, {}, { teams: [s % 4, (s + 1) % 4] });
  if (s <= 10 && JSON.stringify(g.stream) !== JSON.stringify(simGame(s, {}, { teams: [s % 4, (s + 1) % 4] }).stream)) bad(`seed ${s}: not deterministic`);
  let contact = null, catchOut = null, adv = [];
  for (const x of g.stream) {
    if (x.type === 'contact') { contact = x; catchOut = null; adv = []; continue; }
    if (!contact) continue;
    if (x.type === 'out' && x.reason === 'fly_catch' && x.from === 0) catchOut = x;
    else if (x.type === 'runner_advance' && catchOut && x.how === 'batted') adv.push(x);
    else if (x.type === 'pa_end') {
      const at = `seed ${s} event ${x.i}`;
      if (catchOut && adv.length) {
        tags++;
        if (!OUTFIELD_KEYS.includes(catchOut.fielder)) bad(`${at}: tag-up on a ball ${catchOut.fielder} caught`);
        if (contact.ball !== 'FB' && contact.ball !== 'LD') bad(`${at}: tag-up on a ${contact.ball}`);
        if (catchOut.outs === 3) bad(`${at}: tag-up with two outs before the catch`);
      }
      const home = adv.some(a => a.from === 3 && a.to === 4);
      if (x.result === 'sac_fly') { sf++; if (contact.ball === 'LD') sfLiner++; if (!home) bad(`${at}: sac fly without the runner from third scoring`); }
      else if (catchOut && home) bad(`${at}: runner scores from third on a catch not scored a sac fly (${x.result})`);
      contact = null;
    }
  }
}
if (!sf) bad('no sacrifice fly at all');
if (!sfLiner) bad('no sacrifice fly on a line drive');
console.log(`tagup: ${GAMES} games, ${tags} tag-ups, ${sf} sac flies (${(sf / GAMES).toFixed(2)} a game), ${sfLiner} on liners`);
if (problems.length) { for (const p of problems.slice(0, 20)) console.error(`FAIL ${p}`); process.exit(1); }
console.log('tagup check: OK');
