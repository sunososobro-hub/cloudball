/* Obstruction (#614 part 15): on an outfield single with second open, the batter rounding first is impeded by the first
 * baseman and awarded second (OBR 6.01(h)(2)); single + an error on the fielding team (OBR 9.12(c)). Runs GAMES seeds and fails when
 *   - there are fewer than MIN_PER_GAME or more than MAX_PER_GAME a game (aim ~0.01),
 *   - an obstruction plate appearance is not a single, has an out, or its batter does not go 0 -> 2 with how `obstruction`,
 *   - another runner's move is marked `obstruction`, or a runner ends on second with the batter,
 *   - the fielding team's errors (`final.E`) miss it, or the box score does not count the single as a hit,
 *   - its play-by-play line does not say 妨礙跑壘,
 *   - the same seed does not give the same stream twice (rule 11).
 * static.mjs runs this file. Usage: node tests/obstruction.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const GAMES = 2500, MIN_PER_GAME = 0.004, MAX_PER_GAME = 0.025;
const errs = [], bad = m => { if (errs.length < 20) errs.push(m); };
if (typeof K.OBSTRUCTION_OF_OF_1B_P !== 'number') bad('OBSTRUCTION_OF_OF_1B_P is missing from engine/constants.js');

let n = 0, withRunners = 0;
for (let s = 1; s <= GAMES; s++) {
  const g = K.simGame(s, {}, { teams: [s % 4, (s + 1) % 4] }), S = g.stream;
  const ends = S.filter(x => x.type === 'pa_end' && x.obstruction);
  for (const end of ends) {
    n++;
    const at = `seed ${s} frame ${end.f}`, frame = S.filter(x => x.f === end.f);
    if (end.result !== 'single') bad(`${at}: result ${end.result}, want single`);
    if (frame.some(x => x.type === 'out')) bad(`${at}: an out on the obstruction play`);
    if (!frame.some(x => x.type === 'contact')) bad(`${at}: no contact`);
    const moves = frame.filter(x => x.type === 'runner_advance');
    const bm = moves.filter(m => m.runner === end.batter && m.from === 0);
    if (bm.length !== 1 || bm[0].to !== 2 || bm[0].how !== 'obstruction') bad(`${at}: batter move ${JSON.stringify(bm)}, want 0 -> 2 how obstruction`);
    for (const m of moves) if (m.from !== 0 && m.how === 'obstruction') bad(`${at}: runner from ${m.from} marked obstruction`);
    if (moves.some(m => m.from !== 0 && m.to === 2)) bad(`${at}: a runner ends on second with the batter`);
    if (moves.length > 1) withRunners++;
  }
  if (ends.length) {
    for (const d of [0, 1]) { const k = ends.filter(x => x.team === 1 - d).length; if (g.final.E[d] < k) bad(`seed ${s}: team ${d} has ${g.final.E[d]} errors, ${k} obstructions`); }
    const box = K.boxFromStream(S), h = box.team.reduce((a, t) => a + t.h, 0), hits = S.filter(x => x.type === 'pa_end' && ['single', 'infield_single', 'bunt_single', 'double', 'triple', 'home_run'].includes(x.result)).length;
    if (h !== hits) bad(`seed ${s}: box has ${h} hits, stream ${hits}`);
    const fx = g.ev.filter(e => e.play && e.play.obstruction);
    for (const e of fx) if (!String(e.desc).includes('妨礙跑壘')) bad(`seed ${s}: line "${e.desc}"`);
    if (fx.length !== ends.length) bad(`seed ${s}: ${fx.length} obstruction frames, ${ends.length} pa_end`);
  }
}
const again = JSON.stringify(K.simGame(55, {}).stream) === JSON.stringify(K.simGame(55, {}).stream);
if (!again) bad('seed 55 gives two different streams');
const rate = n / GAMES;
if (rate < MIN_PER_GAME || rate > MAX_PER_GAME) bad(`${rate.toFixed(4)} obstructions a game, want ${MIN_PER_GAME}..${MAX_PER_GAME}`);
if (withRunners < 3) bad(`only ${withRunners} with runners on: the other runners are barely checked`);
if (errs.length) { console.error('obstruction check FAILED:\n  ' + errs.join('\n  ')); process.exit(1); }
console.log(`obstruction check ok: ${n} in ${GAMES} games (${rate.toFixed(4)}/game), ${withRunners} with runners on`);
