/* Add batter introductions to a hand-written per-game script.
 *
 * A usable script replaces the fallback bank for the whole game, so a hand-written script has no
 * "batter steps in" lines unless it carries them. This tool drafts the bank for the game, keeps
 * only the `batter_up` exchanges, drops any that would talk over a hand-written line, and merges
 * the rest into the script. Re-running it replaces its own lines (tagged `"src":"batter_up"`) and
 * never touches the others.
 *
 * Usage: node commentary/tools/add-intros.mjs commentary/scripts/<name>.json [--check]
 *   --check  write nothing; exit 1 if the file would change (for a pre-push check). */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { simGame, TEAMS } from '../../engine/index.js';
import { draftFromBank, validateScript } from '../player.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = 'batter_up';
const CLEAR_BEFORE_SEC = 4;   /* no intro starts within this long after a hand-written line starts... */
const CLEAR_AFTER_SEC = 6;    /* ...or within this long before one starts */

const [file, flag] = process.argv.slice(2);
if (!file) { console.error('usage: node commentary/tools/add-intros.mjs <script.json> [--check]'); process.exit(2); }
const raw = readFileSync(file, 'utf8');
const script = JSON.parse(raw);
const bank = JSON.parse(readFileSync(path.join(ROOT, 'commentary/lines.json'), 'utf8'));
const g = simGame(script.seed, {}), stream = g.stream, teams = g.teams.map(i => TEAMS[i]), describe = x => g.ev[x.f].desc;

const own = script.lines.filter(l => l.src !== SRC);
const timeOf = l => stream[l.at].t + (l.delay || 0);
const ownTimes = own.map(timeOf);
/* a running gag (sets/needs) leans on lines from other moments that the script may not have, so it is left out */
const T = bank.triggers[SRC], plain = { ...bank, triggers: { ...bank.triggers, [SRC]: { ...T, exchanges: T.exchanges.filter(e => !e.gag && !e.needs && !e.sets) } } };
const intros = draftFromBank(stream, plain, { seed: script.seed, teams, describe })
  .filter(l => stream[l.at].type === 'pitch' && stream[l.at].count[0] === 0 && stream[l.at].count[1] === 0 && (l.speaker === 'pbp' || l.speaker === 'color'))
  .filter(l => !ownTimes.some(t => t > timeOf(l) - CLEAR_BEFORE_SEC && t < timeOf(l) + CLEAR_AFTER_SEC))
  .map(l => ({ at: l.at, speaker: l.speaker, text: l.text, emotion: 'calm', delay: l.delay, aside: true, src: SRC }));

/* stable merge by event index: hand-written lines first, then the intros bound to the same event */
const merged = [...own, ...intros].map((l, n) => [l, n]).sort((a, b) => a[0].at - b[0].at || a[1] - b[1]).map(x => x[0]);
const next = { ...script, lines: merged };
const errs = validateScript(next, stream);
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }

/* same layout as the hand-written file: one line per entry */
const head = JSON.stringify({ ...next, lines: undefined }).slice(0, -1).replace(/,?$/, '');
const out = head + ',"lines":[\n' + merged.map(l => JSON.stringify(l)).join(',\n') + '\n]}\n';
console.log(`${own.length} hand-written lines kept, ${intros.length} batter intros ${intros.length ? 'merged' : 'none fit'}`);
if (flag === '--check') process.exit(out === raw ? 0 : 1);
writeFileSync(file, out);
