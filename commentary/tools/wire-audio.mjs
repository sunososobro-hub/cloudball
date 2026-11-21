/* Wire the recorded voice files into a per-game script (#96).
 *
 * For every line of the script (pregame part and game lines) it looks for the file of the line's
 * synthesis id (line-id.mjs, the same id as in the sheet) in commentary/audio/<script name>/:
 *   file there   -> `audio` = "audio/<name>/<id>.mp3" and `dur` = its length in seconds
 *   no file      -> `audio` and `dur` are removed, so the viewer never asks for a missing mp3
 * A game whose script has any recorded line is played with recorded voice only (player.js).
 *
 * Usage: node commentary/tools/wire-audio.mjs commentary/scripts/<name>.json [--check] [--report [N]] [--dir <folder>]
 *   --check       write nothing; exit 1 if the script and the folder disagree
 *   --dir         look for the files in this folder instead (tests); `audio` still says audio/<name>/
 *   --report [N]  print how the first N game lines (default 25) are timed by their clip lengths:
 *                 when each starts, and which ones are dropped or cut (estimated length when no file)
 * Rerun it after synth.mjs has made new files, and after every edit of the script. */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lineId } from './line-id.mjs';
import { mp3Duration } from './mp3-duration.mjs';
import { formatScript, planRecorded, estimateDur } from '../player.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DUR_DECIMALS = 2;
const DEFAULT_REPORT = 25;

const args = process.argv.slice(2);
const file = args[0] && !args[0].startsWith('--') ? args[0] : null;
if (!file) { console.error('usage: node commentary/tools/wire-audio.mjs <script.json> [--check] [--report [N]]'); process.exit(2); }
const check = args.includes('--check');
const ri = args.indexOf('--report'), report = ri < 0 ? 0 : Number(args[ri + 1]) || DEFAULT_REPORT;

const name = path.basename(file, '.json');
const rel = `audio/${name}`, dir = args.includes('--dir') ? args[args.indexOf('--dir') + 1] : path.join(ROOT, rel);
const files = new Set(dir && existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.mp3')) : []);
const before = readFileSync(file, 'utf8'), script = JSON.parse(before);

const used = new Set();
let wired = 0;
const wire = l => {
  const id = lineId(l, script.guest), f = `${id}.mp3`, { audio, dur, ...rest } = l;
  if (!files.has(f)) return rest;
  used.add(f); wired++;
  return { ...rest, audio: `${rel}/${f}`, dur: Number(mp3Duration(path.join(dir, f)).toFixed(DUR_DECIMALS)) };
};
const out = { ...script, ...(script.pregame ? { pregame: script.pregame.map(wire) } : {}), lines: script.lines.map(wire) };
const text = formatScript(out);
const total = script.lines.length + (script.pregame || []).length;
console.log(`${wired} of ${total} lines have a recorded file in commentary/${rel}/ (${files.size} mp3 there)`);
const orphans = [...files].filter(f => !used.has(f));
if (orphans.length) console.log(`mp3 no line uses (stale or orphaned):\n  ${orphans.join('\n  ')}`);

if (report) {
  const { simGame } = await import('../../engine/index.js');
  const stream = simGame(script.seed, {}).stream;
  /* every reported line as if it had a file: its real length when it has one, else an estimate */
  const lines = out.lines.slice(0, report).map(l => ({ ...l, audio: l.audio || 'estimate', dur: l.dur || estimateDur(l.text), est: !l.dur }));
  const fmt = x => x.toFixed(1).padStart(6);
  console.log(`\nfirst ${lines.length} game lines: due = event time + delay, start/end with clip lengths (* = estimated length)`);
  for (const [n, l] of planRecorded(lines, stream).entries()) {
    const what = l.drop ? `DROPPED (${l.drop === 'late' ? 'would start after the next call' : 'would run into the next call'})` : `${fmt(l.time)} ${fmt(l.end)}${l.reply ? '  (answer)' : l.time - l.due > 0.05 ? `  +${(l.time - l.due).toFixed(1)}s late` : ''}${l.cut ? '  CUT by the next call' : ''}`;
    console.log(`${String(n).padStart(3)} @${String(l.at).padStart(4)} ${fmt(l.due)} ${l.dur.toFixed(1).padStart(4)}${lines[n].est ? '*' : ' '} ${l.speaker.padEnd(5)} ${what}  ${l.text}`);
  }
}

if (check) {
  const same = before === text;
  console.log(same ? `${path.basename(file)} matches the audio folder` : `${path.basename(file)} and commentary/${rel}/ disagree: run without --check`);
  process.exit(same ? 0 : 1);
}
if (before !== text) { writeFileSync(file, text); console.log(`wrote ${path.relative(process.cwd(), file)}`); }
else console.log(`${path.basename(file)} already matches the audio folder`);
