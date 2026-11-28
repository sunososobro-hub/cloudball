/* Checks for the play-by-play calls of events that end no plate appearance (#606 parts 1-5): node commentary/calls.check.mjs
 *   - over SEEDS games, each of wild pitch, passed ball, balk, safe pickoff, the catcher's mound visit, pickoff out, rundown, catcher interference
 *     triple play, pinch hitter, pinch runner, defensive substitution, the extra-inning runner and the line-drive double play (triple play about 0.0003 a game: pinned seed 1131, teams [3, 0], as tests/tripleplay.check.mjs)
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
  pickoff_out: { is: x => x.type === 'pickoff' && !x.safe && !x.rundown, min: 2 },
  pickoff_rundown: { is: x => x.type === 'pickoff' && x.rundown === true, min: 2 },
  catcher_interference: { is: x => x.type === 'pa_end' && x.result === 'catcher_interference', min: 2 },
  triple_play: { is: x => x.type === 'pa_end' && x.result === 'triple_play', min: 2 },
  pinch_hitter: { is: x => x.type === 'substitution' && x.role === 'pinch_hitter', min: 3 },
  pinch_runner: { is: x => x.type === 'substitution' && x.role === 'pinch_runner', min: 2 },
  defensive_sub: { is: x => x.type === 'substitution' && x.role === 'defensive', min: 2 },
  line_double_play: { is: (x, ld) => x.type === 'pa_end' && x.result === 'lineout' && ld.get(x.f) === 1, min: 3 },
  runner_placed: { is: x => x.type === 'runner_placed', min: 2 },
};
const problems = [], bad = m => { if (problems.length < 20) problems.push(m); };
const called = Object.fromEntries(Object.keys(KINDS).map(k => [k, 0]));
for (const [k, { min }] of Object.entries(KINDS)) {
  const n = ((bank.triggers[k] || {}).exchanges || []).length;
  if (n < min) bad(`bank: ${k} has ${n} wording(s), needs ${min}`);
}
/* part 3: the plate-appearance result groups keep wordings only (a result with a run fires run_scores; rare ones need no firing): 3 where it fires > 1 a game, else 2 */
const WORDINGS = { groundout: 3, flyout: 3, single: 3, strikeout: 3, walk: 3, lineout: 2, popout: 2, infield_single: 2, bunt_single: 2, double: 2, triple: 2, home_run: 2, hit_by_pitch: 2,
  intentional_walk: 2, double_play: 2, fielders_choice: 2, sac_bunt: 2, sac_fly: 2, error: 2 };
for (const [k, min] of Object.entries(WORDINGS)) {
  const n = ((bank.triggers[k] || {}).exchanges || []).length;
  if (n < min) bad(`bank: ${k} has ${n} wording(s), needs ${min}`);
}
const GAMES = [...Array.from({ length: SEEDS }, (_, i) => ({ seed: i + 1 })), { seed: 1157, teams: [1, 2] }];
for (const { seed, teams: pin } of GAMES) {
  const g = simGame(seed, {}, pin ? { teams: pin } : undefined), teams = g.teams.map(i => TEAMS[i]), describe = x => g.ev[x.f].desc;
  const booth = createBooth({ stream: g.stream, seed, bank, teams, describe });
  const ld = new Map(); for (const y of g.stream) if (y.type === 'out' && y.reason === 'doubled_off') ld.set(y.f, (ld.get(y.f) || 0) + 1);   /* doubled-off outs per frame: a line drive doubled off once = line_double_play */
  const names = new Set([...(g.stream[0].lineups || []).flat(), ...(g.stream[0].starters || [])].filter(Boolean));
  for (const l of booth.lines) {
    const x = g.stream[l.at];
    for (const [k, { is }] of Object.entries(KINDS)) if (is(x, ld)) {
      called[k]++;
      if (/\{\w+\}/.test(l.text)) bad(`seed ${seed}: ${k} line has an unfilled slot: "${l.text}"`);
      for (const n of names) if (l.text.includes(n)) bad(`seed ${seed}: ${k} line names ${n}: "${l.text}"`);
    }
  }
}
for (const [k, n] of Object.entries(called)) { console.log(`calls: ${k} called ${n} time(s) in ${SEEDS} games`); if (!n) bad(`${k} never called in ${SEEDS} games`); }
if (problems.length) { console.error('FAILED:\n  ' + problems.join('\n  ')); process.exit(1); }
console.log('OK: every non-PA event kind has a name-free call.');
