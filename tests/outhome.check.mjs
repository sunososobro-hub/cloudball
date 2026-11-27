/* Out on the bases (#38 part 8): on an outfield single with fewer than two outs, a runner from second may be sent
 * home and thrown out by the outfielder's throw to the catcher. Fails when, over GAMES games,
 *   - it never happens, or happens more often than MAX_PER_GAME a game (a first-guess band, not a tuning target),
 *   - the out is not a tag by the catcher at home of the runner who started on second, on a single to the outfield,
 *     with fewer than two outs before the play,
 *   - the catcher receives the throw after the runner arrives, or the tag is not at the runner's arrival,
 *   - that runner is also recorded as scoring, or the batter is not on first,
 *   - the same seed does not give the same game.
 * static.mjs runs this file.
 * Usage: node tests/outhome.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { simGame } = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const { HOME, OUTFIELD_KEYS } = await import(pathToFileURL(path.join(ROOT, 'engine/rules/field.js')));
const { ARRIVE } = await import(pathToFileURL(path.join(ROOT, 'engine/constants.js')));
const GAMES = 400, MAX_PER_GAME = 0.3, EPS = 2e-3;
const problems = [], bad = m => problems.push(m);
let n = 0;
for (let s = 1; s <= GAMES; s++) {
  const g = simGame(s, {}, { teams: [s % 4, (s + 1) % 4] });
  if (s <= 10 && JSON.stringify(g.stream) !== JSON.stringify(simGame(s, {}, { teams: [s % 4, (s + 1) % 4] }).stream)) bad(`seed ${s}: not deterministic`);
  for (const e of g.ev) {
    if (e.k !== 'P' || !e.play || !e.play.outHome) continue;
    n++;
    const at = `seed ${s} t ${e.t.toFixed(1)}`, o = e.outs[0], runner = e.s0.b[1];
    if (e.play.res !== '1B' || !OUTFIELD_KEYS.includes(e.play.fielder)) bad(`${at}: out at home on a ${e.play.res} to ${e.play.fielder}`);
    if (e.s0.outs >= 2) bad(`${at}: sent home with ${e.s0.outs} outs`);
    if (e.outs.length !== 1 || !o || o.reason !== 'tag' || o.base !== HOME || o.fielder !== 'C' || o.runner !== runner || o.from !== 2) { bad(`${at}: not a catcher's tag at home of the runner from second`); continue; }
    if (!(o.ballAt < o.runnerAt) || !(o.fielderAt < o.runnerAt)) bad(`${at}: ball ${o.ballAt} / catcher ${o.fielderAt} not there before the runner ${o.runnerAt}`);
    const mv = e.moves.find(m => m[2] === runner);
    if (!mv || mv[1] !== HOME || Math.abs(mv[3].arriveT - o.runnerAt) > EPS) bad(`${at}: the runner's move does not end at home when he is tagged`);
    const tag = e.plan.actions.find(a => a.a === 'tag' && a.f === 'C' && a.base === HOME);
    if (!tag) bad(`${at}: no tag action by the catcher`);
    else if (Math.abs(ARRIVE + tag.t - o.runnerAt) > EPS) bad(`${at}: tag action not at the runner's arrival`);
    if (e.s1.b.includes(runner)) bad(`${at}: the runner out at home is still on a base`);
    if (e.s1.b[0] !== e.moves.find(m => m[0] === 0)?.[2]) bad(`${at}: batter is not on first`);
    const scored = g.stream.some(x => x.type === 'run_scored' && x.runner === runner && Math.abs(x.time - (e.t + o.runnerAt)) < EPS);
    if (scored) bad(`${at}: the runner out at home also scores`);
  }
}
if (!n) bad('no runner was ever thrown out at home on a single');
if (n / GAMES > MAX_PER_GAME) bad(`${(n / GAMES).toFixed(2)} outs at home on a single a game, more than ${MAX_PER_GAME}`);
console.log(`outhome: ${GAMES} games, runner from second thrown out at home on a single ${n} times (${(n / GAMES).toFixed(3)} a game)`);
if (problems.length) { for (const p of problems.slice(0, 20)) console.error(`FAIL ${p}`); process.exit(1); }
console.log('outhome check: OK');
