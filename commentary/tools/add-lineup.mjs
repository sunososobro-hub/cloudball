/* Add the lineup introductions to a hand-written per-game script.
 *
 * Nothing is typed by hand: batting order, position and number come from the game's own
 * lineups (stream event 0) and the rosters, so when the batting order changes, run the tool again.
 *   - before the first pitch: the two starting pitchers (one line)
 *   - at each starter's first plate appearance: batting-order slot, position, name (#94: short and
 *     the same sentence in every game, no inning and no number; the pregame reads the numbers)
 * The lines are tagged `"src":"lineup"`; re-running replaces them and nothing else. A first-PA
 * line replaces the generic "first plate appearance" line of add-intros.mjs on the same moment.
 * An intro goes on his first pitch; if that would talk over another line it goes earlier, while
 * he walks up (bound to the last event before the pitch). If neither has room it is dropped and
 * reported, never forced.
 *
 * Usage: node commentary/tools/add-lineup.mjs commentary/scripts/<name>.json [--check]
 *   --check  write nothing; exit 1 if the file would change.
 *   --text   print the full pre-game lineup read-out (tab separated: speaker, emotion, text) and exit. */
import { readFileSync, writeFileSync } from 'node:fs';
import { simGame, TEAMS, ROSTERS } from '../../engine/index.js';
import { validateScript, formatScript } from '../player.js';

const SRC = 'lineup', INTRO_SRC = 'batter_up';
const STARTERS_DELAY_SEC = 20;   /* after the booth opening (it ends at about 19 s); the first live call comes at about 21 s */
const INTRO_DELAY_SEC = 0.1;     /* after the first pitch, as the bank's batter_up lines */
const CLEAR_BEFORE_SEC = 4;      /* no intro starts within this long after another line starts... */
const CLEAR_AFTER_SEC = 3;       /* ...or within this long before one starts (the intro is about 2.5 s long) */
const WALKUP_MIN_SEC = 2;        /* a walk-up intro starts at least this long after the previous plate appearance ended */
const POSITION = { C: '捕手', '1B': '一壘手', '2B': '二壘手', '3B': '三壘手', SS: '游擊手', LF: '左外野手', CF: '中外野手', RF: '右外野手', DH: '指定打擊' };
const SLOT = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

const [file, flag] = process.argv.slice(2);
if (!file) { console.error('usage: node commentary/tools/add-lineup.mjs <script.json> [--check]'); process.exit(2); }
const raw = readFileSync(file, 'utf8'), script = JSON.parse(raw);
const g = simGame(script.seed, {}), stream = g.stream, teams = g.teams.map(i => TEAMS[i]);
const start = stream[0], bats = g.teams.map(i => ROSTERS[i].bat);

/* --text: print the whole pre-game lineup read-out (one line per batter) for voice generation; the script is not touched */
if (flag === '--text') {
  const out = [`pbp\tcalm\t先發投手，${teams[0].short}${start.starters[0]}，${teams[1].short}${start.starters[1]}。`];
  for (let t = 0; t < 2; t++) {
    out.push(`pbp\tcalm\t${t ? '主隊' : '客隊'}${teams[t].short}的先發打線。`);
    start.lineups[t].forEach((name, i) => { const p = bats[t].find(b => b.name === name); out.push(`pbp\tcalm\t第${SLOT[i]}棒，${p ? POSITION[p.pos] || '' : ''}${name}${p ? `，背號${p.num}` : ''}。`); });
  }
  console.log('speaker\temotion\ttext\n' + out.join('\n')); process.exit(0);
}

/* the lines to keep: everything except the old lineup lines */
let own = script.lines.filter(l => l.src !== SRC);
const timeOf = l => stream[l.at].t + (l.delay || 0);
const handTimes = own.filter(l => l.src !== INTRO_SRC).map(timeOf);

const lines = [];
/* 1. the starting pitchers, read once before the first pitch */
if (start.starters && start.starters.length === 2) {
  lines.push({ at: 0, speaker: 'pbp', text: `先發投手，${teams[0].short}${start.starters[0]}，${teams[1].short}${start.starters[1]}。`, emotion: 'calm', delay: STARTERS_DELAY_SEC, src: SRC });
  handTimes.push(STARTERS_DELAY_SEC);   /* an intro does not talk over the starters line either */
}
const room = t => !handTimes.some(h => h > t - CLEAR_BEFORE_SEC && h < t + CLEAR_AFTER_SEC);
/* where the intro of the batter whose first pitch is event x goes: on that pitch, else while he
 * walks up: the latest moment with room before the next line, but after the previous plate
 * appearance (or the half-inning) has ended, bound to the last event before that moment */
function place(x) {
  if (room(x.t + INTRO_DELAY_SEC)) return { at: x.i, delay: INTRO_DELAY_SEC };
  let from = x.i - 1;
  while (from > 0 && !['pa_end', 'half_start'].includes(stream[from].type)) from--;
  const next = Math.min(...handTimes.filter(h => h >= x.t), Infinity);
  const t = Math.min(x.t, next - CLEAR_AFTER_SEC);
  if (t < stream[from].t + WALKUP_MIN_SEC || !room(t)) return null;
  let at = from;
  while (at + 1 < x.i && stream[at + 1].t <= t) at++;
  return { at, delay: Math.round((t - stream[at].t) * 10) / 10 };
}
/* 2. each starter's first plate appearance: the first 0-0 pitch he sees */
const seen = new Set(), dropped = [], firsts = new Set();
for (const x of stream) {
  if (x.type !== 'pitch' || x.count[0] !== 0 || x.count[1] !== 0 || seen.has(x.batter)) continue;
  seen.add(x.batter);
  const player = bats[x.team].find(b => b.name === x.batter);
  if (!player || start.lineups[x.team][x.lineup] !== x.batter) continue;   /* a substitute: no slot to announce */
  const where = place(x);
  if (!where) { dropped.push(`${x.batter} (event ${x.i})`); continue; }
  lines.push({ at: where.at, speaker: 'pbp', text: `第${SLOT[x.lineup]}棒，${POSITION[player.pos] || ''}${x.batter}。`, emotion: 'calm', delay: where.delay, aside: true, src: SRC });
  firsts.add(x.i);
}

/* a first-PA line replaces the generic batter_up line on that batter's first pitch */
own = own.filter(l => !(l.src === INTRO_SRC && firsts.has(l.at)));
const merged = [...own, ...lines].map((l, n) => [l, n]).sort((a, b) => a[0].at - b[0].at || a[1] - b[1]).map(x => x[0]);
const next = { ...script, lines: merged }, errs = validateScript(next, stream);
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }

const out = formatScript(next);
const slots = lines.filter(l => l.at > 0).length;
console.log(`starters line: ${lines.some(l => l.at === 0) ? 'yes' : 'no'}; lineup intros: ${slots} of ${start.lineups.flat().length}${dropped.length ? `; dropped for room: ${dropped.join(', ')}` : ''}`);
if (flag === '--check') process.exit(out === raw ? 0 : 1);
writeFileSync(file, out);
