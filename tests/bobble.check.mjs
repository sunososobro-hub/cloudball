/* Advancing on an error (#38 part 10): on an outfield single the outfielder may bobble the ball; the batter and every
 * runner take one base more than the single gives them. Fails when, over GAMES games,
 *   - it never happens, or happens more often than MAX_PER_GAME a game (a first-guess band, not a tuning target),
 *   - it is not a single to an outfielder, or nobody is out on it,
 *   - the batter does not end on second, or a runner does not end one base past the single (from first on third,
 *     from second and third home), or the bases after the play disagree with the moves,
 *   - the fielder's pickup is not OF_BOBBLE_TIME later than the ball allows, or the ball reaches the relay at second
 *     before the batter does,
 *   - it is not scored a single plus one error on the defence, or its stream moves are not `runner_advance` how 'error',
 *   - the same seed does not give the same game.
 * static.mjs runs this file.
 * Usage: node tests/bobble.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { simGame } = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const K = await import(pathToFileURL(path.join(ROOT, 'engine/constants.js')));
const { OUTFIELD_KEYS } = await import(pathToFileURL(path.join(ROOT, 'engine/rules/field.js')));
const GAMES = 400, MAX_PER_GAME = 0.4, EPS = 2e-3;
const problems = [], bad = m => problems.push(m);
let n = 0, runners = 0;
for (let s = 1; s <= GAMES; s++) {
  const opts = { teams: [s % 4, (s + 1) % 4] };
  const g = simGame(s, {}, opts);
  if (s <= 10 && JSON.stringify(g.stream) !== JSON.stringify(simGame(s, {}, opts).stream)) bad(`seed ${s}: not deterministic`);
  const errMoves = g.stream.filter(x => x.type === 'runner_advance' && x.how === 'error').length;
  let evMoves = 0;
  for (const e of g.ev) {
    if (e.k !== 'P' || !e.play || !e.play.errAdvance) continue;
    n++; evMoves += e.moves.length;
    const at = `seed ${s} t ${e.t.toFixed(1)}`, p = e.play, def = 1 - e.s0.half;
    if (p.res !== '1B' || !OUTFIELD_KEYS.includes(p.fielder)) bad(`${at}: bobble on a ${p.res} to ${p.fielder}`);
    if (e.outs.length) bad(`${at}: an out on a bobble`);
    if (p.outStretch || p.outHome || p.onThrow) bad(`${at}: bobble mixed with another baserunning play`);
    const batter = e.moves.find(m => m[0] === 0);
    if (!batter || batter[1] !== 2 || e.s1.b[1] !== batter[2]) bad(`${at}: the batter does not end on second`);
    for (const m of e.moves) if (m[0] > 0) { runners++; if (m[1] !== Math.min(4, m[0] + 2)) bad(`${at}: runner from ${m[0]} ends on ${m[1]}, expected ${Math.min(4, m[0] + 2)}`); }
    const home = e.moves.filter(m => m[1] === 4).length;
    if (e.runs !== home) bad(`${at}: ${e.runs} runs for ${home} runners home`);
    if (e.s1.E[def] !== e.s0.E[def] + 1 || e.s1.E[1 - def] !== e.s0.E[1 - def]) bad(`${at}: not one error on the defence`);
    if (e.s1.H[1 - def] !== e.s0.H[1 - def] + 1) bad(`${at}: not scored a hit`);
    if (!/一壘安打/.test(e.desc) || !/漏接失誤/.test(e.desc)) bad(`${at}: copy is not a single with the bobble (${e.desc})`);
    const pl = e.plan;
    if (!(pl.catchT - Math.max(pl.ballDownAt, pl.fielderAt) >= K.OF_BOBBLE_TIME - EPS)) bad(`${at}: pickup not delayed by the bobble`);
    if (batter && !(K.ARRIVE + pl.arrive > batter[3].arriveT)) bad(`${at}: the ball reaches second (${(K.ARRIVE + pl.arrive).toFixed(2)}) before the batter (${batter[3].arriveT.toFixed(2)})`);
  }
  if (errMoves !== evMoves) bad(`seed ${s}: ${errMoves} runner_advance how 'error' in the stream, ${evMoves} bobble moves`);
}
if (!n) bad('no outfielder ever bobbled a single');
if (n / GAMES > MAX_PER_GAME) bad(`${(n / GAMES).toFixed(2)} bobbles a game, more than ${MAX_PER_GAME}`);
console.log(`bobble: ${GAMES} games, outfield bobbles on a single ${n} times (${(n / GAMES).toFixed(3)} a game), ${runners} runners moved up`);
if (problems.length) { for (const p of problems.slice(0, 20)) console.error(`FAIL ${p}`); process.exit(1); }
console.log('bobble check: OK');
