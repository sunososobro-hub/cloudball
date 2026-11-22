/* Checks of the recorded voice wiring and timing (#96). Plain Node: node commentary/audio.check.mjs
 *   1. every registered script matches its audio folder (tools/wire-audio.mjs --check);
 *   2. wiring: a file in the folder gives its line `audio` + `dur`, a removed file clears them
 *      (fake clips made in a temporary folder, the real script is never written);
 *   3. timing of a recorded game (every line of the frozen game given a file): only lines with a
 *      file are spoken, no two lines overlap, no line starts before its event, priority-2 calls are
 *      never moved or dropped, no line holds the next call back more than CALL_GRACE. */
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { simGame, TEAMS } from '../engine/index.js';
import { OPENING_ROSTERS } from '../league/preseason/rosters-opening.js';
import { createBooth, CALL_GRACE } from './player.js';
import { lineId } from './tools/line-id.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url)), TOOL = path.join(DIR, 'tools', 'wire-audio.mjs');
const EPS = 1e-6;
/* the demonstration game was recorded against the rosters of its day (#171) */
const openingSeed = JSON.parse(readFileSync(path.join(DIR, '../league/preseason/opening.json'), 'utf8')).seed;
const errs = [];
const bad = m => errs.push(m);
const run = a => spawnSync(process.execPath, [TOOL, ...a], { encoding: 'utf8' });

/* a valid mp3 of n silent MPEG-2 Layer III frames (24 kHz, 8 kbit/s, 24 bytes, 0.024 s each) */
const FRAME = Buffer.concat([Buffer.from([0xff, 0xf3, 0x14, 0xc4]), Buffer.alloc(20)]), FRAME_SEC = 576 / 24000;
const fakeMp3 = sec => Buffer.concat(Array.from({ length: Math.round(sec / FRAME_SEC) }, () => FRAME));

const index = JSON.parse(readFileSync(path.join(DIR, 'scripts', 'index.json'), 'utf8')).scripts;
for (const file of Object.values(index)) {
  const r = run([path.join(DIR, 'scripts', file), '--check']);
  if (r.status !== 0) bad(`scripts/${file} does not match its audio folder: run node commentary/tools/wire-audio.mjs commentary/scripts/${file}\n${r.stdout}${r.stderr}`);
}

const [seed, file] = Object.entries(index)[0];
const tmp = mkdtempSync(path.join(tmpdir(), 'cloudball-audio-'));
try {
  const copy = path.join(tmp, file), audio = path.join(tmp, 'clips');
  const original = readFileSync(path.join(DIR, 'scripts', file), 'utf8'), script = JSON.parse(original);
  writeFileSync(copy, original);
  mkdirSync(audio);
  const a = script.lines[1], b = script.lines[2], ida = lineId(a, script.guest), idb = lineId(b, script.guest);
  writeFileSync(path.join(audio, `${ida}.mp3`), fakeMp3(2.4)); writeFileSync(path.join(audio, `${idb}.mp3`), fakeMp3(1.2));
  let r = run([copy, '--dir', audio]);
  if (r.status !== 0) bad(`wire-audio failed: ${r.stderr}`);
  let wired = JSON.parse(readFileSync(copy, 'utf8'));
  const name = path.basename(file, '.json'), la = wired.lines[1];
  if (la.audio !== `audio/${name}/${ida}.mp3`) bad(`wired line has audio "${la.audio}", expected audio/${name}/${ida}.mp3`);
  if (Math.abs((la.dur || 0) - 2.4) > 0.03) bad(`wired line has dur ${la.dur}, expected 2.4`);
  if (run([copy, '--check', '--dir', audio]).status !== 0) bad('--check fails right after wiring');
  unlinkSync(path.join(audio, `${idb}.mp3`));
  if (run([copy, '--check', '--dir', audio]).status === 0) bad('--check passes although a wired file was removed');
  run([copy, '--dir', audio]);
  wired = JSON.parse(readFileSync(copy, 'utf8'));
  if (wired.lines[2].audio || wired.lines[2].dur) bad('a removed file is still wired');
  if (readFileSync(path.join(DIR, 'scripts', file), 'utf8') !== original) bad('the real script was written by the check');

  /* gate (#99): with a synth manifest, a clip whose transcript adds words is refused; a reading difference is not */
  writeFileSync(path.join(audio, `${idb}.mp3`), fakeMp3(1.2));
  const said = { [ida]: { transcript: `${a.text.replace(/[，。！？]/g, ' ')}\n` }, [idb]: { transcript: `${b.text}這樣講連你阿嬤都聽得懂。` } };
  writeFileSync(path.join(audio, 'manifest.json'), JSON.stringify(said));
  const kept = readFileSync(copy, 'utf8');
  r = run([copy, '--dir', audio]);
  if (r.status === 0) bad('a clip that adds words to its line is wired');
  if (readFileSync(copy, 'utf8') !== kept) bad('the script was written although a clip was refused');
  said[idb].transcript = b.text.replace(/[，。！？]/g, '');
  writeFileSync(path.join(audio, 'manifest.json'), JSON.stringify(said));
  if (run([copy, '--dir', audio]).status !== 0) bad('clips that say their line (punctuation aside) are refused');
  if (!JSON.parse(readFileSync(copy, 'utf8')).lines[2].audio) bad('a clip that says its line is not wired');
  const { sameWords } = await import('./tools/transcript.mjs');
  for (const [said2, line, same] of [['背號五十九', '背號59', true], ['一比零', '1比0', true], ['兩出局。', '二出局', true], ['好的，我來準備囉！第一棒。', '第一棒', false]])
    if (sameWords(said2, line) !== same) bad(`transcript "${said2}" vs line "${line}" should be ${same ? 'the same' : 'different'}`);

  /* 3: the whole frozen game recorded, every other line without a file */
  const g = simGame(Number(seed), {}, Number(seed) === openingSeed ? { rosters: OPENING_ROSTERS } : {}), teams = g.teams.map(i => TEAMS[i]), bank = JSON.parse(readFileSync(path.join(DIR, 'lines.json'), 'utf8'));
  const rec = { ...script, lines: script.lines.map((l, n) => (n % 7 === 3 ? l : { ...l, audio: `audio/${name}/${n}.mp3`, dur: 1 + (n % 5) * 0.9 })) };
  const booth = createBooth({ stream: g.stream, seed: g.seed, bank, script: rec, teams, describe: x => g.ev[x.f].desc });
  if (!booth.recorded) bad('a script with audio is not seen as recorded');
  let prev = null;
  for (const l of booth.lines) {
    if (!l.audio) bad(`line without a file is spoken in a recorded game: ${l.text}`);
    if (l.time < l.due - EPS) bad(`line starts before its event: ${l.text}`);
    const urgent = l.speaker === 'pbp' && (l.priority || 0) >= 2;
    if (urgent && Math.abs(l.time - l.due) > EPS) bad(`priority-2 call moved: ${l.text}`);
    if (prev && !urgent && l.time < prev.end - EPS) bad(`lines overlap: "${prev.text}" / "${l.text}"`);
    if (!urgent && l.end > l.nextCall + CALL_GRACE + EPS) bad(`line holds the next call back too long: ${l.text}`);
    prev = l;
  }
  for (const l of booth.plan) if (l.speaker === 'pbp' && (l.priority || 0) >= 2 && l.audio && l.drop) bad(`priority-2 call dropped: ${l.text}`);
  /* the real script may already be wired: take every file away for the "no recorded audio" case */
  const bare = ({ audio: _a, dur: _d, ...l }) => l;
  const silent = { ...script, ...(script.pregame ? { pregame: script.pregame.map(bare) } : {}), lines: script.lines.map(bare) };
  const plain = createBooth({ stream: g.stream, seed: g.seed, bank, script: silent, teams, describe: x => g.ev[x.f].desc });
  if (plain.recorded || plain.plan) bad('a script without audio is timed as recorded');
  const dropped = booth.plan.filter(l => l.drop && l.drop !== 'no audio').length;
  if (!errs.length) console.log(`OK: scripts match their audio folders, wiring adds and clears files, recorded timing holds (${booth.lines.length} spoken, ${dropped} dropped for room in the test game).`);
} finally { rmSync(tmp, { recursive: true, force: true }); }

if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
