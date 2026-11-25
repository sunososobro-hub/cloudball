/* Fielder defence (#378 part 3): a batter's optional `def` (range and glove, centred on 1.0) feeds the engine's
 * existing fielding code: chase speed, hit chance and error chance (engine/constants.js DEF_*; engine/sim/game.js
 * defOf). Fails when
 *   - a roster whose every batter has def 1 does not play exactly the factory game (missing def = 1),
 *   - a def outside DEF_MIN..DEF_MAX is not clamped (def 5 must play exactly like DEF_MAX),
 *   - a good defence (DEF_MAX everywhere) does not allow fewer hits and fewer errors than a poor one (DEF_MIN) over GAMES games,
 *   - the same seed and rosters give two different games.
 * static.mjs runs this file.
 * Usage: node tests/defence.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { simGame, ROSTERS, DEF_MIN, DEF_MAX } = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const GAMES = 300;
const withDef = d => ROSTERS.map(t => ({ ...t, bat: t.bat.map(b => ({ ...b, def: d })) }));
const play = (s, rosters) => simGame(s, {}, { teams: [s % 4, (s + 1) % 4], ...(rosters ? { rosters } : {}) });
const same = (a, b) => JSON.stringify(a.stream) === JSON.stringify(b.stream);
const hits = g => g.stats.flat().reduce((n, b) => n + b.h, 0), errors = g => g.final.E[0] + g.final.E[1];

const problems = [], ONE = withDef(1), HI = withDef(DEF_MAX), LO = withDef(DEF_MIN), WILD = withDef(5);
let hHi = 0, hLo = 0, eHi = 0, eLo = 0;
for (let s = 1; s <= GAMES; s++) {
  if (s <= 50 && !same(play(s), play(s, ONE))) problems.push(`seed ${s}: def 1 everywhere differs from the factory game`);
  if (s <= 50 && !same(play(s, HI), play(s, WILD))) problems.push(`seed ${s}: def 5 is not clamped to DEF_MAX`);
  if (s <= 20 && !same(play(s, HI), play(s, HI))) problems.push(`seed ${s}: same seed and rosters, two games`);
  const gh = play(s, HI), gl = play(s, LO);
  hHi += hits(gh); hLo += hits(gl); eHi += errors(gh); eLo += errors(gl);
}
if (!(hHi < hLo)) problems.push(`a good defence allowed ${hHi} hits, a poor one ${hLo}: def does not reach the fielding code`);
if (!(eHi < eLo)) problems.push(`a good defence made ${eHi} errors, a poor one ${eLo}: the glove does not reach the error chance`);
console.log(`defence: ${GAMES} games, def ${DEF_MAX}: ${hHi} hits ${eHi} errors; def ${DEF_MIN}: ${hLo} hits ${eLo} errors`);
if (problems.length) { for (const p of problems.slice(0, 20)) console.error(`FAIL ${p}`); process.exit(1); }
console.log('defence check: OK');
