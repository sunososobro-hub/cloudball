/* Checks for the tension index (plain Node): node commentary/tension.check.mjs
 *   - the bases it tracks match the engine's own frame state
 *   - deterministic, in range, and causal (cutting the stream never changes earlier values)
 *   - known situations score in the expected order */
import { simGame } from '../engine/index.js';
import { tensionTrack, tensionOf, basesAfter, TENSION_MAX } from './tension.js';

const GAMES = Number(process.env.GAMES || 60), problems = [], bad = m => { if (problems.length < 30) problems.push(m); };
let sum = 0, n = 0, top = 0;
for (let seed = 1; seed <= GAMES; seed++) {
  const g = simGame(seed, {}), track = tensionTrack(g.stream);
  if (JSON.stringify(track) !== JSON.stringify(tensionTrack(g.stream))) bad(`seed ${seed}: not deterministic`);
  for (const v of track) { if (!Number.isInteger(v) || v < 0 || v > TENSION_MAX) bad(`seed ${seed}: value ${v} out of range`); sum += v; n++; top = Math.max(top, v); }
  for (const cut of [Math.floor(g.stream.length / 3), Math.floor(g.stream.length * 0.8)]) {
    const part = tensionTrack(g.stream.slice(0, cut + 1));
    if (part.join() !== track.slice(0, cut + 1).join()) bad(`seed ${seed}: values before ${cut} depend on later events`);
  }
  if (seed <= 10) {   /* bases at the end of each engine frame match the engine's own state */
    const lastOfFrame = new Map(); g.stream.forEach(x => lastOfFrame.set(x.f, x.i));
    for (const [f, i] of lastOfFrame) {
      const want = g.ev[f] && g.ev[f].s1 && g.ev[f].s1.b; if (!want || g.stream[i].type === 'half_end' || g.stream[i].type === 'game_end') continue;
      if (basesAfter(g.stream, i).join() !== want.map(Boolean).join()) { bad(`seed ${seed} frame ${f}: bases ${basesAfter(g.stream, i)} vs engine ${want.map(Boolean)}`); break; }
    }
  }
}
const S = (o) => ({ inning: 1, half: 0, outs: 0, score: [0, 0], bases: [null, null, null, null], balls: 0, strikes: 0, over: false, ...o });
const R = 'r';
const known = {
  'bottom 9, two out, bases loaded, down one, full count': S({ inning: 9, half: 1, outs: 2, score: [3, 2], bases: [null, R, R, R], balls: 3, strikes: 2 }),
  'bottom 9, two out, bases loaded, down one, 0-0': S({ inning: 9, half: 1, outs: 2, score: [3, 2], bases: [null, R, R, R] }),
  'top 8, one out, runner on 2nd, tied': S({ inning: 8, half: 0, outs: 1, score: [4, 4], bases: [null, null, R, null] }),
  'top 1, nobody on, nobody out, 0-0': S({}),
  'top 4, nobody on, 9-0': S({ inning: 4, half: 0, outs: 0, score: [0, 9] }),
};
const scores = Object.fromEntries(Object.entries(known).map(([k, s]) => [k, tensionOf(s)]));
const v = Object.values(scores);
for (let k = 1; k < v.length; k++) if (v[k] > v[k - 1]) bad(`known situations out of order: ${JSON.stringify(scores)}`);
if (scores['bottom 9, two out, bases loaded, down one, full count'] < 90) bad('the biggest moment scores under 90');
if (scores['top 4, nobody on, 9-0'] > 5) bad('a 9-0 game in the fourth scores over 5');

for (const [k, t] of Object.entries(scores)) console.log(`${String(t).padStart(3)}  ${k}`);
console.log(`${GAMES} games: mean tension ${(sum / n).toFixed(1)}, highest ${top}`);
if (problems.length) { console.error(`\nFAILED: ${problems.length} problem(s)`); for (const p of problems) console.error('  ' + p); process.exit(1); }
console.log('OK: tension is deterministic, causal, in range, tracks the engine bases, and ranks known situations.');
