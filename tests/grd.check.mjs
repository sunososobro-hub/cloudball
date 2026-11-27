/* Ground-rule doubles (#614 part 7): an air-ball double whose roll reaches the outfield wall bounces over it in
 * GRD_OF_WALL_2B_P of cases; the ball is dead and every runner gets exactly two bases. Runs GAMES seeds and fails when
 *   - ground-rule doubles are not GRD_OF_WALL_2B_P of the wall-reaching air doubles (within TOL), or fewer than MIN_PER_GAME a game,
 *   - a `pa_end` with `groundRule: true` is not a `double`, is a ground ball or a bunt, or its roll stops short of the wall,
 *   - in that frame a runner does not move exactly two bases (batter 0 -> 2, first -> third, second and third score), or an out is made,
 *   - its play-by-play line does not say 場地規則二壘安打, or any other plate appearance carries `groundRule`,
 *   - the same seed does not give the same stream twice (rule 11).
 * static.mjs runs this file. Usage: node tests/grd.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const GAMES = 600, TOL = 0.08, MIN_PER_GAME = 0.1;
const errs = [], bad = m => { if (errs.length < 20) errs.push(m); };
if (typeof K.GRD_OF_WALL_2B_P !== 'number') bad('GRD_OF_WALL_2B_P is missing from engine/constants.js');

const wallAt = K.FENCE_R - K.WALL_PICKUP;
let wall2 = 0, grd = 0, withRunners = 0;
for (let s = 1; s <= GAMES; s++) {
  const g = K.simGame(s, {}, { teams: [s % 4, (s + 1) % 4] }), S = g.stream;
  for (const e of g.ev) {
    if (e.k !== 'P' || e.r !== 'inplay' || !e.play) continue;
    const p = e.play, reaches = p.res === '2B' && p.type !== 'GB' && !p.bunt && Math.hypot(p.lx, p.lz) * K.HIT_ROLL_FACTOR > wallAt;
    if (reaches) { wall2++; if (p.groundRule) grd++; }
    else if (p.groundRule) bad(`seed ${s} t ${e.t}: groundRule on a ${p.res} ${p.type} that does not reach the wall`);
  }
  for (const end of S.filter(x => x.type === 'pa_end' && x.groundRule)) {
    const at = `seed ${s} frame ${end.f}`, frame = S.filter(x => x.f === end.f);
    if (end.result !== 'double') bad(`${at}: ground-rule ${end.result}`);
    if (frame.some(x => x.type === 'out')) bad(`${at}: an out on a ground-rule double`);
    const moves = frame.filter(x => x.type === 'runner_advance');
    if (!moves.some(m => m.runner === end.batter && m.from === 0 && m.to === 2)) bad(`${at}: the batter does not go 0 -> 2`);
    for (const m of moves) if (m.to !== Math.min(4, m.from + 2)) bad(`${at}: ${m.runner} moves ${m.from} -> ${m.to}, not two bases`);
    if (moves.length > 1) withRunners++;
  }
  const line = (g.ev.find(e => e.play && e.play.groundRule) || {}).desc;
  if (line !== undefined && !String(line).includes('場地規則二壘安打')) bad(`seed ${s}: ground-rule line "${line}"`);
}
const again = JSON.stringify(K.simGame(7, {}).stream) === JSON.stringify(K.simGame(7, {}).stream);
if (!again) bad('seed 7 gives two different streams');
const share = grd / (wall2 || 1);
if (Math.abs(share - K.GRD_OF_WALL_2B_P) > TOL) bad(`${grd} of ${wall2} wall-reaching doubles are ground-rule (${share.toFixed(3)}), want ${K.GRD_OF_WALL_2B_P} +- ${TOL}`);
if (grd / GAMES < MIN_PER_GAME) bad(`${(grd / GAMES).toFixed(3)} ground-rule doubles a game, want >= ${MIN_PER_GAME}`);
if (withRunners < 10) bad(`only ${withRunners} ground-rule doubles with runners on: the base rule is barely checked`);
if (errs.length) { console.error('grd check FAILED:\n  ' + errs.join('\n  ')); process.exit(1); }
console.log(`grd check ok: ${grd} ground-rule doubles in ${GAMES} games (${(grd / GAMES).toFixed(3)}/game, ${share.toFixed(3)} of ${wall2} wall doubles), ${withRunners} with runners on`);
