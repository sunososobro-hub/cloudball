/* Checks for the play-by-play calls of events that end no plate appearance (#606 part 1): node commentary/calls.check.mjs
 *   - over SEEDS games, each of wild pitch, passed ball, balk, safe pickoff and the catcher's mound visit
 *     is called at least once (the drafted line sits on an event of that kind)
 *   - those lines are name-free: no player name, no {desc}, no unfilled slot
 *   - each call key has at least 2 wordings (3 where it fires more than once a game on average) */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { simGame, TEAMS } from '../engine/index.js';
import { createBooth } from './player.js';

const DIR = path.dirname(fileURLToPath(import.meta.url)), SEEDS = Number(process.env.SEEDS || 200);
const bank = JSON.parse(readFileSync(path.join(DIR, 'lines.json'), 'utf8'));
const KINDS = {
  wild_pitch: { is: x => x.type === 'runner_advance' && x.how === 'wild_pitch', min: 2 },
  passed_ball: { is: x => x.type === 'runner_advance' && x.how === 'passed_ball', min: 2 },
  balk: { is: x => x.type === 'balk', min: 2 },
  pickoff_safe: { is: x => x.type === 'pickoff' && x.safe === true, min: 3 },
  catcher_visit: { is: x => x.type === 'mound_visit' && x.staff === 'catcher', min: 3 },
};
const problems = [], bad = m => { if (problems.length < 20) problems.push(m); };
const called = Object.fromEntries(Object.keys(KINDS).map(k => [k, 0]));
for (const [k, { min }] of Object.entries(KINDS)) {
  const n = ((bank.triggers[k] || {}).exchanges || []).length;
  if (n < min) bad(`bank: ${k} has ${n} wording(s), needs ${min}`);
}
for (let seed = 1; seed <= SEEDS; seed++) {
  const g = simGame(seed, {}), teams = g.teams.map(i => TEAMS[i]), describe = x => g.ev[x.f].desc;
  const booth = createBooth({ stream: g.stream, seed, bank, teams, describe });
  const names = new Set([...(g.stream[0].lineups || []).flat(), ...(g.stream[0].starters || [])].filter(Boolean));
  for (const l of booth.lines) {
    const x = g.stream[l.at];
    for (const [k, { is }] of Object.entries(KINDS)) if (is(x)) {
      called[k]++;
      if (/\{\w+\}/.test(l.text)) bad(`seed ${seed}: ${k} line has an unfilled slot: "${l.text}"`);
      for (const n of names) if (l.text.includes(n)) bad(`seed ${seed}: ${k} line names ${n}: "${l.text}"`);
    }
  }
}
for (const [k, n] of Object.entries(called)) { console.log(`calls: ${k} called ${n} time(s) in ${SEEDS} games`); if (!n) bad(`${k} never called in ${SEEDS} games`); }
if (problems.length) { console.error('FAILED:\n  ' + problems.join('\n  ')); process.exit(1); }
console.log('OK: every non-PA event kind has a name-free call.');
