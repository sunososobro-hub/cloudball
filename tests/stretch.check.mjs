/* Out on the bases (#38 part 9): on an outfield single with fewer than two outs and second open, the batter may try to
 * stretch it into a double and be tagged out at second by the outfielder's throw. Fails when, over GAMES games,
 *   - it never happens, or happens more often than MAX_PER_GAME a game (a first-guess band, not a tuning target),
 *   - the out is not a tag at second by the covering middle infielder of the batter, on a single to the outfield with
 *     fewer than two outs and second left open by the other runners,
 *   - the ball or the fielder is not there before the batter, or the tag is not at his arrival,
 *   - the batter is left on a base, the play is not scored a single, or the stream shows him advancing,
 *   - a stretch that is safe is not scored a double with the batter on second,
 *   - the same seed does not give the same game.
 * static.mjs runs this file.
 * Usage: node tests/stretch.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { simGame } = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const { OUTFIELD_KEYS } = await import(pathToFileURL(path.join(ROOT, 'engine/rules/field.js')));
const GAMES = 400, MAX_PER_GAME = 0.4, EPS = 2e-3;
const problems = [], bad = m => problems.push(m);
let n = 0, safe = 0;
for (let s = 1; s <= GAMES; s++) {
  const g = simGame(s, {}, { teams: [s % 4, (s + 1) % 4] });
  if (s <= 10 && JSON.stringify(g.stream) !== JSON.stringify(simGame(s, {}, { teams: [s % 4, (s + 1) % 4] }).stream)) bad(`seed ${s}: not deterministic`);
  const tagged = g.stream.filter(x => x.type === 'out' && x.reason === 'tag' && x.base === 2 && x.from === 0 && !x.steal && !x.pickoff);
  let streamOuts = 0;
  for (const e of g.ev) {
    if (e.k !== 'P' || !e.play || e.play.res !== '1B') continue;
    const batter = e.moves.find(m => m[0] === 0);
    if (!e.play.outStretch) {
      if (batter && batter[1] === 2 && !e.play.onThrow && !e.play.errAdvance) {
        safe++;
        if (e.s1.b[1] !== batter[2] || !/二壘安打/.test(e.desc)) bad(`seed ${s} t ${e.t.toFixed(1)}: safe stretch not a double with the batter on second (${e.desc})`);
      }
      continue;
    }
    n++; streamOuts++;
    const at = `seed ${s} t ${e.t.toFixed(1)}`, o = e.outs[0];
    if (!OUTFIELD_KEYS.includes(e.play.fielder)) bad(`${at}: stretch on a single to ${e.play.fielder}`);
    if (e.s0.outs >= 2) bad(`${at}: stretch with ${e.s0.outs} outs`);
    if (e.moves.some(m => m[0] > 0 && m[1] === 2) || e.s1.b[1]) bad(`${at}: stretch into a second base another runner takes`);
    if (e.outs.length !== 1 || !o || o.reason !== 'tag' || o.base !== 2 || o.from !== 0 || !['SS', '2B'].includes(o.fielder) || !batter || o.runner !== batter[2]) { bad(`${at}: not a middle infielder's tag at second of the batter`); continue; }
    if (!(o.ballAt < o.runnerAt) || !(o.fielderAt < o.runnerAt)) bad(`${at}: ball ${o.ballAt} / fielder ${o.fielderAt} not there before the batter ${o.runnerAt}`);
    if (batter[1] !== 2 || Math.abs(batter[3].arriveT - o.runnerAt) > EPS) bad(`${at}: the batter's move does not end at second when he is tagged`);
    if (!e.plan.actions.some(a => a.a === 'tag' && a.f === o.fielder && a.base === 2)) bad(`${at}: no tag action at second`);
    if (e.s1.b.includes(batter[2])) bad(`${at}: the batter is still on a base`);
    if (!/一壘安打/.test(e.desc)) bad(`${at}: not scored a single (${e.desc})`);
  }
  for (const o of tagged) if (g.stream.some(x => x.type === 'runner_advance' && x.runner === o.runner && x.from === 0 && x.i === o.i)) bad(`seed ${s}: ${o.runner} advances in the stream on the play he is tagged out`);
  if (tagged.length !== streamOuts) bad(`seed ${s}: ${tagged.length} batter tag outs at second in the stream, ${streamOuts} stretch outs`);
}
if (!n) bad('no batter was ever thrown out stretching a single');
if (n / GAMES > MAX_PER_GAME) bad(`${(n / GAMES).toFixed(2)} outs stretching a game, more than ${MAX_PER_GAME}`);
console.log(`stretch: ${GAMES} games, batter thrown out stretching ${n} times (${(n / GAMES).toFixed(3)} a game), safe ${safe}`);
if (problems.length) { for (const p of problems.slice(0, 20)) console.error(`FAIL ${p}`); process.exit(1); }
console.log('stretch check: OK');
