/* Pitch mix by pitcher (#378): a pitcher's optional `pitches` list (league/freeagents.js) decides which of the engine's
 * PITCH_TYPES he throws (engine/sim/game.js mixOf). Fails when
 *   - a pitcher with a list throws a pitch that is not on it,
 *   - a list does not keep the factory shares among its own pitches (fastball share off by more than TOL),
 *   - giving every pitcher a list changes anything but pitch names and km/h (outcomes come from the engine RNG only),
 *   - a list holding all PITCH_TYPES, or no known name, does not play exactly the factory game,
 *   - the same seed and rosters give two different games.
 * static.mjs runs this file.
 * Usage: node tests/pitchmix.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { simGame, ROSTERS } = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const { PITCH_TYPES } = await import(pathToFileURL(path.join(ROOT, 'engine/constants.js')));
const GAMES = 40, TOL = 0.03;
const NAMES = PITCH_TYPES.map(t => t[0]), FB = NAMES[0];
const LIST = [FB, NAMES[2]];                                   /* fastball + curve: factory shares 0.5 and 0.12 */
const WANT_FB = PITCH_TYPES[0][1] / (PITCH_TYPES[0][1] + PITCH_TYPES[2][1] - PITCH_TYPES[1][1]);
const withList = list => ROSTERS.map(t => ({ ...t, pit: t.pit.map(p => ({ ...p, pitches: list })) }));
const play = (s, rosters) => simGame(s, {}, { teams: [s % 4, (s + 1) % 4], ...(rosters ? { rosters } : {}) });
const pitches = g => g.stream.filter(e => e.type === 'pitch');
/* the stream with the looks-only fields blanked: what must not move when only the pitch mix changes */
const outcome = g => JSON.stringify(g.stream.map(e => e.type === 'pitch' ? { ...e, pitchType: 0, kmh: 0 } : e));
const same = (a, b) => JSON.stringify(a.stream) === JSON.stringify(b.stream);

const problems = [], TWO = withList(Object.fromEntries(LIST.map(n => [n, 60]))), ALL = withList(NAMES), NONE = withList({ 魔球: 70 });
let n = 0, fb = 0;
for (let s = 1; s <= GAMES; s++) {
  const base = play(s), g = play(s, TWO);
  for (const e of pitches(g)) { n++; if (e.pitchType === FB) fb++; else if (!LIST.includes(e.pitchType)) { problems.push(`seed ${s}: ${e.pitchType} thrown, the list is ${LIST.join(', ')}`); break; } }
  if (outcome(base) !== outcome(g)) problems.push(`seed ${s}: a pitch list changed more than pitch names and km/h`);
  if (s <= 15 && !same(base, play(s, ALL))) problems.push(`seed ${s}: a list of all PITCH_TYPES differs from the factory game`);
  if (s <= 15 && !same(base, play(s, NONE))) problems.push(`seed ${s}: a list with no known pitch differs from the factory game`);
  if (s <= 10 && !same(g, play(s, TWO))) problems.push(`seed ${s}: same seed and rosters, two games`);
}
const share = fb / n;
if (Math.abs(share - WANT_FB) > TOL) problems.push(`fastball share ${share.toFixed(3)} with ${LIST.join('+')}, factory ratio gives ${WANT_FB.toFixed(3)}`);
console.log(`pitchmix: ${GAMES} games, ${n} pitches with ${LIST.join('+')}, fastball ${share.toFixed(3)} (want ${WANT_FB.toFixed(3)})`);
if (problems.length) { for (const p of problems.slice(0, 20)) console.error(`FAIL ${p}`); process.exit(1); }
console.log('pitchmix check: OK');
