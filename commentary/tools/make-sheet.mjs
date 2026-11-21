/* Build the synthesis input of one per-game script for tools/synth.mjs.
 *
 * Every line of the script (pregame part first, then the game lines) becomes one row
 * { id, role, tone, text, ... } in the input format of synth.mjs: whole sentences, no cut clips.
 *   role  pbp / color as is; fan -> the guest's fixed voice in voices.json (fan_<guest team id>)
 *   tone  from the line's `emotion` (EMOTION_TONE below); every speaker keeps its fixed persona
 *   id    <role>-<10 hex of sha1(role, tone, text)>: fixed for the same words, independent of the
 *         line's position, so inserting or re-running add-lineup.mjs never renames a file, and a
 *         reworded line gets a new id (stale audio is never played for new text).
 * The same words said twice by the same voice with the same emotion are one row (one mp3).
 * Extra fields (`part`, `seg`, `at`, `uses`) are for people; synth.mjs ignores them.
 *
 * It also prints a rough reuse count (#94: a voice made once should serve many games): rows that
 * name nobody and carry no count or score of this game fit any game; rows that name people but no
 * game facts (lineup intros) come back whenever those people are in that spot again; the rest
 * belong to this game. Text rules only (names from league/, numerals 二-十 before 局/分/支/...).
 *
 * Usage: node commentary/tools/make-sheet.mjs commentary/scripts/<name>.json [--check] [--audio <dir>]
 *   writes commentary/scripts/<name>.tts.json
 *   --check        write nothing; exit 1 if the sheet is missing or out of date
 *   --audio <dir>  also list mp3 files in <dir> that no row uses any more (orphans) */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { ROSTERS } = await import('../../league/players.js');
const { STAFF, UMPIRES } = await import('../../league/staff.js');
const { TEAMS } = await import('../../league/teams.js');
const EMOTION_TONE = {
  calm: '平穩清楚，正常播報',
  excited: '興奮，音量拉高、語速加快',
  tense: '緊張，聲音壓低、一字一字講',
  thrilled: '非常激動，大聲、尾音拉長',
  disappointed: '失望，語氣往下沉、慢一點',
  amused: '覺得好笑，帶點調侃',
};
const DEFAULT_EMOTION = 'calm';

const args = process.argv.slice(2);
const file = args[0] && !args[0].startsWith('--') ? args[0] : null;
const check = args.includes('--check');
const audioDir = args.includes('--audio') ? args[args.indexOf('--audio') + 1] : null;
if (!file) { console.error('usage: node commentary/tools/make-sheet.mjs <script.json> [--check] [--audio <dir>]'); process.exit(2); }

const script = JSON.parse(readFileSync(file, 'utf8'));
const roles = JSON.parse(readFileSync(path.join(ROOT, 'voices.json'), 'utf8')).roles;
const fanRole = `fan_${script.guest}`;
const roleOf = s => (s === 'fan' ? fanRole : s);

const errs = [];
const all = [
  ...(script.pregame || []).map(l => ({ ...l, part: 'pregame' })),
  ...script.lines.map(l => ({ ...l, part: 'game' })),
];
const rows = new Map();
all.forEach((l, n) => {
  const role = roleOf(l.speaker), emotion = l.emotion || DEFAULT_EMOTION, tone = EMOTION_TONE[emotion];
  if (!roles[role]) errs.push(`line ${n}: speaker "${l.speaker}" has no voice in voices.json (${role})`);
  if (!tone) errs.push(`line ${n}: unknown emotion "${emotion}"`);
  if (typeof l.text !== 'string' || !l.text.trim()) errs.push(`line ${n}: empty text`);
  const id = `${role}-${createHash('sha1').update(JSON.stringify([role, tone, l.text])).digest('hex').slice(0, 10)}`;
  const where = l.part === 'pregame' ? `${l.seg}+${l.t ?? 0}s` : `event ${l.at}`;
  if (rows.has(id)) { rows.get(id).uses.push(where); return; }
  rows.set(id, { id, role, tone, text: l.text, emotion, part: l.part, ...(l.seg ? { seg: l.seg } : {}), uses: [where] });
});
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }

const sheet = [...rows.values()];
const out = file.replace(/\.json$/, '.tts.json');
const text = '[\n' + sheet.map(r => JSON.stringify(r)).join(',\n') + '\n]\n';
const chars = {};
for (const r of sheet) chars[r.role] = (chars[r.role] || 0) + [...r.text].length;
console.log(`${all.length} lines (${all.length - script.lines.length} pregame, ${script.lines.length} game) -> ${sheet.length} files to synthesize`);
console.log(`characters per voice: ${Object.entries(chars).map(([k, v]) => `${k} ${v}`).join(', ')}`);

const bankGuests = JSON.parse(readFileSync(path.join(ROOT, 'lines.json'), 'utf8')).guests || {};
const people = [...ROSTERS.flatMap(t => [...t.bat, ...t.pit]), ...STAFF, ...UMPIRES].map(p => p.name);
const names = [...people, ...people.map(n => n.slice(1)), ...people.map(n => n[0] + '教練'), ...TEAMS.flatMap(t => [t.name, t.short]),
  ...Object.values(bankGuests).flatMap(g => [g.name, g.nick, '阿' + g.name.slice(-1)])];
const GAME_FACT = /[0-9]|[二三四五六七八九十兩]+(局|分|支|次|打數|公尺|公里|歲|任|發|個打者|個人|個三振|個殘壘)|(?<!第)[二三四五六七八九十]+球/;
const reuse = { any: 0, people: 0, game: 0 };
for (const r of sheet) reuse[GAME_FACT.test(r.text) ? 'game' : names.some(n => r.text.includes(n)) ? 'people' : 'any']++;
console.log(`reuse (rough): ${reuse.any} rows fit any game, ${reuse.people} name people but no game facts, ${reuse.game} belong to this game`);

if (audioDir && existsSync(audioDir)) {
  const used = new Set(sheet.map(r => `${r.id}.mp3`));
  const orphans = readdirSync(audioDir).filter(f => f.endsWith('.mp3') && !used.has(f));
  console.log(orphans.length ? `orphaned mp3 (no line uses them any more):\n  ${orphans.join('\n  ')}` : 'no orphaned mp3');
}
if (check) {
  const same = existsSync(out) && readFileSync(out, 'utf8') === text;
  console.log(same ? `${path.basename(out)} is up to date` : `${path.basename(out)} is missing or out of date: run without --check`);
  process.exit(same ? 0 : 1);
}
writeFileSync(out, text);
console.log(`wrote ${path.relative(process.cwd(), out)}`);
