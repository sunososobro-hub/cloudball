/* Catcher's interference (#614 part 9): on CI_OF_SWING of non-bunt swings with no steal on, the bat hits the catcher's mitt;
 * the ball is dead, the batter is awarded first and only forced runners move (OBR 5.05(b)(3), 6.01(c)). Runs GAMES seeds and fails when
 *   - there are fewer than MIN_PER_GAME or more than MAX_PER_GAME a game (MLB ~0.04),
 *   - a `catcher_interference` plate appearance has no swing and `call` `catcher_interference` in its frame, a contact or an out,
 *   - the batter does not go 0 -> 1, a runner moves when not forced or moves other than one base,
 *   - the box score counts it as an at-bat, or the fielding team's errors (`final.E`) miss it,
 *   - its play-by-play line does not say 捕手妨礙打擊,
 *   - the same seed does not give the same stream twice (rule 11).
 * static.mjs runs this file. Usage: node tests/catcherint.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const GAMES = 1500, MIN_PER_GAME = 0.02, MAX_PER_GAME = 0.07;
const errs = [], bad = m => { if (errs.length < 20) errs.push(m); };
if (typeof K.CI_OF_SWING !== 'number') bad('CI_OF_SWING is missing from engine/constants.js');

let ci = 0, withRunners = 0;
for (let s = 1; s <= GAMES; s++) {
  const g = K.simGame(s, {}, { teams: [s % 4, (s + 1) % 4] }), S = g.stream;
  const ends = S.filter(x => x.type === 'pa_end' && x.result === 'catcher_interference');
  for (const end of ends) {
    ci++;
    const at = `seed ${s} frame ${end.f}`, frame = S.filter(x => x.f === end.f);
    if (!frame.some(x => x.type === 'swing')) bad(`${at}: no swing`);
    if (!frame.some(x => x.type === 'call' && x.call === 'catcher_interference')) bad(`${at}: no catcher_interference call`);
    if (frame.some(x => x.type === 'contact' || x.type === 'out')) bad(`${at}: contact or out on catcher's interference`);
    const moves = frame.filter(x => x.type === 'runner_advance');
    if (!moves.some(m => m.runner === end.batter && m.from === 0 && m.to === 1)) bad(`${at}: the batter does not go 0 -> 1`);
    for (const m of moves) {
      if (m.to !== m.from + 1) bad(`${at}: ${m.runner} moves ${m.from} -> ${m.to}, not one base`);
      if (m.how !== 'catcher_interference') bad(`${at}: runner_advance how ${m.how}`);
    }
    const occ = new Set(moves.map(m => m.from));
    for (const m of moves) for (let b = 0; b < m.from; b++) if (!occ.has(b)) bad(`${at}: runner from ${m.from} moves but is not forced`);
    if (moves.length > 1) withRunners++;
  }
  if (ends.length) {
    const box = K.boxFromStream(S), ab = box.team.reduce((a, t) => a + t.ab, 0), pa = box.team.reduce((a, t) => a + t.pa, 0);
    const notAb = S.filter(x => x.type === 'pa_end' && ['walk', 'intentional_walk', 'hit_by_pitch', 'catcher_interference', 'sac_bunt', 'sac_fly'].includes(x.result)).length;
    if (pa - ab !== notAb) bad(`seed ${s}: box counts catcher's interference as an at-bat`);
    for (const d of [0, 1]) { const n = ends.filter(x => x.team === 1 - d).length; if (g.final.E[d] < n) bad(`seed ${s}: team ${d} has ${g.final.E[d]} errors, ${n} catcher's interference`); }
    const fx = g.ev.filter(e => e.r === 'ci');
    for (const e of fx) if (!String(e.desc).includes('捕手妨礙打擊')) bad(`seed ${s}: line "${e.desc}"`);
    if (fx.length !== ends.length) bad(`seed ${s}: ${fx.length} ci frames, ${ends.length} pa_end`);
  }
}
const again = JSON.stringify(K.simGame(55, {}).stream) === JSON.stringify(K.simGame(55, {}).stream);
if (!again) bad('seed 55 gives two different streams');
const rate = ci / GAMES;
if (rate < MIN_PER_GAME || rate > MAX_PER_GAME) bad(`${rate.toFixed(3)} catcher's interference a game, want ${MIN_PER_GAME}..${MAX_PER_GAME}`);
if (withRunners < 10) bad(`only ${withRunners} with runners on: the force rule is barely checked`);
if (errs.length) { console.error('catcherint check FAILED:\n  ' + errs.join('\n  ')); process.exit(1); }
console.log(`catcherint check ok: ${ci} in ${GAMES} games (${rate.toFixed(3)}/game), ${withRunners} with runners on`);
