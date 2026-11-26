/* Advancing on an error (#38 part 11): on a ground ball an infielder reaches the batter on an error, and some of those
 * errors are a wild throw past first; the batter takes second and every runner two bases. Fails when, over GAMES games,
 *   - it never happens, or happens more often than MAX_PER_GAME a game (a first-guess band, not a tuning target),
 *   - it is not a reached-on-error ground ball to an infielder other than the first baseman (or a bunt), or anyone is out,
 *   - the batter does not end on second, or a runner does not end two bases on (from first on third, from second and
 *     third home), or the runs disagree with the moves,
 *   - the throw is not to the foul ground past first with nobody receiving it, or it lands after the batter reaches second,
 *   - it is not scored one error and no hit, or no RBI, or the copy does not name the wild throw,
 *   - its stream moves are not `runner_advance` how 'error', or the same seed does not give the same game.
 * static.mjs runs this file.
 * Usage: node tests/wildthrow.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { simGame } = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const K = await import(pathToFileURL(path.join(ROOT, 'engine/constants.js')));
const { BASES } = await import(pathToFileURL(path.join(ROOT, 'engine/rules/field.js')));
const GAMES = 400, MAX_PER_GAME = 0.4, EPS = 1e-9;
const PAST = [BASES[1][0] + K.WILD_THROW_PAST[0], BASES[1][1] + K.WILD_THROW_PAST[1]];
const problems = [], bad = m => problems.push(m);
let n = 0, runners = 0, roe = 0;
for (let s = 1; s <= GAMES; s++) {
  const opts = { teams: [s % 4, (s + 1) % 4] };
  const g = simGame(s, {}, opts);
  if (s <= 10 && JSON.stringify(g.stream) !== JSON.stringify(simGame(s, {}, opts).stream)) bad(`seed ${s}: not deterministic`);
  for (const e of g.ev) {
    if (e.k !== 'P' || !e.play) continue;
    if (e.play.res === 'E') roe++;
    if (!e.play.wildThrow) continue;
    n++;
    const at = `seed ${s} t ${e.t.toFixed(1)}`, p = e.play, def = 1 - e.s0.half;
    if (p.res !== 'E' || p.type !== 'GB' || p.bunt || ['1B', 'LF', 'CF', 'RF'].includes(p.fielder)) bad(`${at}: wild throw on a ${p.res} ${p.type} to ${p.fielder}${p.bunt ? ' (bunt)' : ''}`);
    if (p.errAdvance || p.outStretch || p.outHome || p.onThrow) bad(`${at}: wild throw mixed with another baserunning play`);
    if (e.outs.length) bad(`${at}: an out on a wild throw`);
    const batter = e.moves.find(m => m[0] === 0);
    if (!batter || batter[1] !== 2 || e.s1.b[1] !== batter[2]) bad(`${at}: the batter does not end on second`);
    for (const m of e.moves) if (m[0] > 0) { runners++; if (m[1] !== Math.min(4, m[0] + 2)) bad(`${at}: runner from ${m[0]} ends on ${m[1]}, expected ${Math.min(4, m[0] + 2)}`); }
    const home = e.moves.filter(m => m[1] === 4).length;
    if (e.runs !== home) bad(`${at}: ${e.runs} runs for ${home} runners home`);
    if (e.rbi) bad(`${at}: ${e.rbi} RBI on an error`);
    if (e.s1.E[def] !== e.s0.E[def] + 1 || e.s1.E[1 - def] !== e.s0.E[1 - def]) bad(`${at}: not one error on the defence`);
    if (e.s1.H[1 - def] !== e.s0.H[1 - def]) bad(`${at}: scored a hit`);
    if (!/守備失誤/.test(e.desc) || !/暴傳/.test(e.desc)) bad(`${at}: copy does not name the wild throw (${e.desc})`);
    const pl = e.plan;
    if (!pl.wild || pl.CV.key !== null || Math.abs(pl.CV.spot[0] - PAST[0]) > EPS || Math.abs(pl.CV.spot[1] - PAST[1]) > EPS) bad(`${at}: throw is not to the foul ground past first`);
    if (pl.actions.some(a => a.a === 'receive' || a.a === 'touch' || a.a === 'tag')) bad(`${at}: somebody receives the wild throw`);
    if (!pl.actions.some(a => a.a === 'throw' && a.f === p.fielder)) bad(`${at}: the fielder never throws`);
    if (batter && !(K.ARRIVE + pl.arrive < batter[3].arriveT)) bad(`${at}: the ball lands past first (${(K.ARRIVE + pl.arrive).toFixed(2)}) after the batter is on second (${batter[3].arriveT.toFixed(2)})`);
    if (batter && !g.stream.some(x => x.type === 'runner_advance' && x.how === 'error' && x.runner === batter[2] && x.from === 0 && x.to === 2 && Math.abs(x.t - (e.t + batter[3].arriveT)) < 1e-2)) bad(`${at}: the batter's move is not runner_advance how 'error'`);
  }
}
if (!n) bad('no infielder ever threw one past first');
if (n / GAMES > MAX_PER_GAME) bad(`${(n / GAMES).toFixed(2)} wild throws a game, more than ${MAX_PER_GAME}`);
console.log(`wildthrow: ${GAMES} games, ${roe} reached on error, ${n} wild throws past first (${(n / GAMES).toFixed(3)} a game), ${runners} runners moved up`);
if (problems.length) { for (const p of problems.slice(0, 20)) console.error(`FAIL ${p}`); process.exit(1); }
console.log('wildthrow check: OK');
