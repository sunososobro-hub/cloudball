/* Repetition budget of the fallback bank (#607), plain Node: node commentary/repeat.check.mjs
 * Drafts 15 consecutive seeds (season-0 length) with draftFromBank and counts how loud the booth is and how often a
 * colour or fan wording is heard. Asserts the volume (part 1); the repeat counts are printed and asserted at the
 * ceilings below, which come down as the bank grows (later parts of #607). */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { simGame, TEAMS } from '../engine/index.js';
import { draftFromBank, validateBank } from './player.js';

const DIR = path.dirname(fileURLToPath(import.meta.url)), SEEDS = 15, FIRST = Number(process.env.FIRST_SEED || 1);
const LIMITS = { colorPerGame: [40, 55], fanShare: [0.15, 0.25], perGameRepeat: 2, seasonRepeat: Infinity };
const bank = JSON.parse(readFileSync(path.join(DIR, 'lines.json'), 'utf8')), problems = [], bad = m => { if (problems.length < 30) problems.push(m); };
for (const e of validateBank(bank)) bad(`bank: ${e}`);

const season = { color: new Map(), fan: new Map() };
let color = 0, fan = 0, all = 0, worstGame = 0;
for (let seed = FIRST; seed < FIRST + SEEDS; seed++) {
  const g = simGame(seed, {}), teams = g.teams.map(i => TEAMS[i]), describe = x => g.ev[x.f].desc;
  const lines = draftFromBank(g.stream, bank, { seed, teams, describe }), game = { color: new Map(), fan: new Map() };
  all += lines.length;
  for (const l of lines) if (l.speaker === 'color' || l.speaker === 'fan') {
    for (const m of [game[l.speaker], season[l.speaker]]) m.set(l.text, (m.get(l.text) || 0) + 1);
    if (l.speaker === 'color') color++; else fan++;
  }
  for (const k of ['color', 'fan']) for (const n of game[k].values()) worstGame = Math.max(worstGame, n);
}
const top = k => Math.max(0, ...season[k].values()), heard = (k, n) => [...season[k].values()].filter(v => v >= n).length;
const perGame = color / SEEDS, fanPerGame = fan / SEEDS, fanShare = fan / all;
console.log(`${SEEDS} games from seed ${FIRST}: colour ${perGame.toFixed(1)} lines/game, fan ${fanPerGame.toFixed(1)} lines/game (${(fanShare * 100).toFixed(1)}% of all lines)`);
console.log(`repeats: worst wording inside one game ${worstGame}x; season: colour max ${top('color')}x (${heard('color', 4)} wordings > 3x), fan max ${top('fan')}x (${heard('fan', 4)} wordings > 3x)`);
if (!(perGame >= LIMITS.colorPerGame[0] && perGame <= LIMITS.colorPerGame[1])) bad(`colour ${perGame.toFixed(1)} lines/game is outside ${LIMITS.colorPerGame.join('..')}`);
if (!(fanShare >= LIMITS.fanShare[0] && fanShare <= LIMITS.fanShare[1])) bad(`fan share ${(fanShare * 100).toFixed(1)}% is outside ${LIMITS.fanShare.join('..')}`);
if (worstGame > LIMITS.perGameRepeat) bad(`a wording was said ${worstGame}x in one game (limit ${LIMITS.perGameRepeat})`);
if (Math.max(top('color'), top('fan')) > LIMITS.seasonRepeat) bad(`a wording was heard ${Math.max(top('color'), top('fan'))}x over the season (limit ${LIMITS.seasonRepeat})`);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log('repeat check OK');
