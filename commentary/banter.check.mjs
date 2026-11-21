/* Checks for the banter score (plain Node): node commentary/banter.check.mjs
 *   - deterministic: same script, same scores and same top list
 *   - every listed exchange exists in the script: first..last are real lines, `at` is the event of
 *     its last line, the set-up lines come before it, no reusable intro is counted
 *   - listed exchanges never overlap and are at least the minimum gap apart in game time
 *   - one voice alone scores zero; a two-voice exchange scores more than zero
 * Runs on every registered script and on bank drafts of GAMES seeds. Prints the frozen game's top list. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { simGame, TEAMS } from '../engine/index.js';
import { createBooth } from './player.js';
import { banterScores, topBanter, exchangesOf, MIN_GAP_SEC, TOP_DEFAULT } from './banter.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const GAMES = Number(process.env.GAMES || 20), problems = [], bad = m => { if (problems.length < 30) problems.push(m); };
const bank = JSON.parse(readFileSync(path.join(DIR, 'lines.json'), 'utf8'));

function check(name, script, stream) {
  const L = script.lines, opts = { bank, stream };
  const all = banterScores(script, opts), top = topBanter(script, opts);
  if (JSON.stringify(all) !== JSON.stringify(banterScores(script, opts))) bad(`${name}: scores are not deterministic`);
  if (JSON.stringify(top) !== JSON.stringify(topBanter(script, opts))) bad(`${name}: top list is not deterministic`);
  if (top.length > TOP_DEFAULT) bad(`${name}: top list has ${top.length} entries`);
  const ex = exchangesOf(script);
  for (const x of ex) {
    const speakers = new Set(x.lines.map(k => L[k].speaker)), s = all.find(y => y.first === x.first && y.last === x.last);
    if (!s) { bad(`${name} @${x.at}: exchange has no score`); continue; }
    if (speakers.size < 2 && s.score !== 0) bad(`${name} @${x.at}: one voice scores ${s.score}`);
    if (speakers.size >= 2 && !(s.score > 0)) bad(`${name} @${x.at}: ${speakers.size} voices score ${s.score}`);
  }
  for (const x of top) {
    if (!(Number.isInteger(x.first) && Number.isInteger(x.last) && x.first >= 0 && x.last < L.length && x.first <= x.last)) { bad(`${name}: listed exchange ${x.first}..${x.last} is not in the script`); continue; }
    if (L[x.last].at !== x.at) bad(`${name}: listed exchange @${x.at} does not end on a line of that event`);
    if (L[x.first].at > x.at || L[x.first].src || L[x.last].src) bad(`${name} @${x.at}: listed exchange starts after its event or on an intro`);
    if (!(x.score > 0)) bad(`${name} @${x.at}: listed with score ${x.score}`);
    if (!ex.some(y => y.first === x.first && y.last === x.last && y.at === x.at)) bad(`${name} @${x.at}: listed exchange is not one of the script's exchanges`);
  }
  for (let a = 0; a < top.length; a++) for (let b = a + 1; b < top.length; b++) {
    const x = top[a], y = top[b];
    if (!(x.last < y.first || y.last < x.first)) bad(`${name}: listed exchanges @${x.at} and @${y.at} overlap`);
    if (stream && Math.abs(stream[x.at].t - stream[y.at].t) < MIN_GAP_SEC) bad(`${name}: @${x.at} and @${y.at} are under ${MIN_GAP_SEC} s apart`);
  }
  for (let a = 1; a < top.length; a++) if (top[a].score > top[a - 1].score) bad(`${name}: top list is not best first`);
  return top;
}

/* registered scripts (the frozen game first) */
const index = JSON.parse(readFileSync(path.join(DIR, 'scripts', 'index.json'), 'utf8')).scripts;
let frozen = null;
for (const [seed, file] of Object.entries(index)) {
  const script = JSON.parse(readFileSync(path.join(DIR, 'scripts', file), 'utf8')), g = simGame(Number(seed), {});
  const top = check(file, script, g.stream);
  if (!frozen) frozen = { file, script, top, g };
}
/* bank drafts: the viewer's own scripts for games without one */
let drafted = 0;
for (let seed = 1; seed <= GAMES; seed++) {
  const g = simGame(seed, {}), teams = g.teams.map(i => TEAMS[i]), describe = x => g.ev[x.f].desc;
  const lines = createBooth({ stream: g.stream, seed, bank, teams, describe }).lines;
  drafted += topBanter({ lines }, { bank, stream: g.stream }).length;
  check(`draft ${seed}`, { lines }, g.stream);
}

if (frozen) {
  console.log(`${frozen.file}: top ${frozen.top.length} banter exchanges`);
  for (const x of frozen.top) {
    const L = frozen.script.lines.slice(x.first, x.last + 1).filter(l => !l.src);
    console.log(`${String(x.score).padStart(4)}  @${x.at} (${Math.round(frozen.g.stream[x.at].t)} s) lines ${x.first}-${x.last}  ${L.map(l => l.speaker).join('/')}  ${JSON.stringify(x.parts)}`);
  }
}
console.log(`${GAMES} bank drafts: ${drafted} listed exchanges`);
if (problems.length) { console.error(`\nFAILED: ${problems.length} problem(s)`); for (const p of problems) console.error('  ' + p); process.exit(1); }
console.log('OK: banter scores are deterministic, listed exchanges exist, never overlap, keep their gap, and one voice scores zero.');
