/* Free post-processing A/B (#140): rework clips that are already paid for, no API call of any kind.
 *
 *   node commentary/tools/post-trial.mjs [--out dir]
 *
 * For the three exchanges of tools/converse-trial.json (the `old` clips of audio/preseason-opening/)
 * it writes, per exchange, ab-<at>.mp3: the current version (each clip as it is, the player's reply
 * gap between them), a beep, then the new version:
 *   1. dynamics: a gain per line from its emotion (GAIN_DB), then one limiter over the whole file;
 *   2. pace: silences inside a line longer than MAX_INNER_SILENCE are cut down to it, the edges to
 *      EDGE_PAD; excited emotions are sped up without changing pitch (TEMPO, ffmpeg atempo);
 *   3. turn-taking: a reply starts TURN_GAP after the previous line ends; a line in INTERRUPTS starts
 *      INTERRUPT_OVERLAP before the previous line ends.
 * It prints the measured numbers (speech level spread, characters per second) before and after.
 * Output (default commentary/audio/_trial/post/): ab-<at>.mp3 and measure.json. Nothing is wired. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const RATE = 24000;
const FRAME = 0.01;                 /* seconds per analysis frame */
const SILENCE_DB = -40;             /* a frame below this RMS (dBFS) is silence */
const MAX_INNER_SILENCE = 0.18;     /* longest silence kept inside a line, seconds */
const EDGE_PAD = 0.03;              /* silence kept before and after a line, seconds */
const TURN_GAP = 0.08;              /* a reply starts this long after the previous line ends */
const INTERRUPT_OVERLAP = 0.15;     /* an interruption starts this long before the previous line ends */
const REPLY_GAP = 0.35;             /* current player (player.js REPLY_GAP): the A side */
const BEEP = { hz: 880, sec: 0.4, gap: 0.8, volume: 0.25 };   /* between A and B, as converse.mjs */
const LIMIT = 0.89;                 /* limiter ceiling (linear, about -1 dBFS) */
/* gain per emotion, dB: shouted calls up, asides and dry remarks down (spread 8 dB) */
const GAIN_DB = { thrilled: 4, excited: 2, calm: 0, tense: -2, disappointed: -3, amused: -4 };
/* speed-up per emotion, pitch kept; tense and dry lines untouched */
const TEMPO = { excited: 1.12, thrilled: 1.08 };
/* lines that cut in on the one before (sheet ids) */
const INTERRUPTS = new Set(['fan_owls-005c137878', 'fan_owls-fd4e11ecf0']);

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const outDir = opt('--out') || join(root, 'audio', '_trial', 'post');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

const trial = JSON.parse(readFileSync(join(root, 'tools', 'converse-trial.json'), 'utf8'));
const sheet = new Map(JSON.parse(readFileSync(join(root, trial.sheet), 'utf8')).map(r => [r.id, r]));

function decode(file, tempo) {
  const af = tempo && tempo !== 1 ? ['-af', `atempo=${tempo}`] : [];
  const p = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-i', file, ...af, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'],
    { maxBuffer: 1 << 28 });
  if (p.status !== 0) throw new Error(`decode ${file}: ${p.stderr}`);
  return new Float32Array(p.stdout.buffer, p.stdout.byteOffset, p.stdout.length / 4).slice();
}

function encode(pcm, file, limit) {
  const af = limit ? ['-af', `alimiter=limit=${LIMIT}:attack=2:release=50:level=disabled`] : [];
  const p = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'f32le', '-ar', String(RATE), '-ac', '1', '-i', '-',
    ...af, '-c:a', 'libmp3lame', '-q:a', '2', file], { input: Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength) });
  if (p.status !== 0) throw new Error(`encode ${file}: ${p.stderr}`);
}

const n = FRAME * RATE;
const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));
/* per frame: is it speech? */
function frames(pcm) {
  const out = [];
  for (let i = 0; i < pcm.length; i += n) {
    let s = 0; const e = Math.min(pcm.length, i + n);
    for (let j = i; j < e; j++) s += pcm[j] * pcm[j];
    out.push({ i, e, rms: Math.sqrt(s / (e - i)), speech: db(Math.sqrt(s / (e - i))) > SILENCE_DB });
  }
  return out;
}

/* speech level (RMS of speech frames, dBFS), speech seconds (pauses removed), total seconds */
function measure(pcm) {
  const f = frames(pcm).filter(x => x.speech);
  const sq = f.reduce((a, x) => a + x.rms * x.rms, 0) / Math.max(f.length, 1);
  return { level: db(Math.sqrt(sq)), speech: f.length * FRAME, total: pcm.length / RATE };
}

/* cut inner silences longer than MAX_INNER_SILENCE down to it; edges down to EDGE_PAD */
function trim(pcm) {
  const f = frames(pcm), first = f.findIndex(x => x.speech);
  if (first < 0) return pcm;
  let last = f.length - 1; while (!f[last].speech) last--;
  const keep = [], maxRun = Math.round(MAX_INNER_SILENCE / FRAME), pad = Math.round(EDGE_PAD / FRAME);
  for (let k = Math.max(0, first - pad); k <= Math.min(f.length - 1, last + pad); k++) {
    if (f[k].speech || k < first || k > last) { keep.push(k); continue; }
    let run = k; while (!f[run].speech) run++;
    const len = run - k;   /* silent frames from k to run-1 */
    const half = Math.min(len, maxRun) / 2;
    for (let j = k; j < run; j++) if (j - k < Math.ceil(half) || run - 1 - j < Math.floor(half)) keep.push(j);
    k = run - 1;
  }
  const out = new Float32Array(keep.reduce((a, k) => a + f[k].e - f[k].i, 0));
  let o = 0; for (const k of keep) { out.set(pcm.subarray(f[k].i, f[k].e), o); o += f[k].e - f[k].i; }
  return out;
}

const gain = (pcm, dB) => { const g = 10 ** (dB / 20); return pcm.map(x => x * g); };
const silence = (sec) => new Float32Array(Math.round(sec * RATE));
/* place clips: each starts at `start` seconds; overlapping parts are summed */
function mix(parts) {
  const len = Math.max(...parts.map(p => Math.round(p.start * RATE) + p.pcm.length));
  const out = new Float32Array(len);
  for (const p of parts) { const o = Math.round(p.start * RATE); for (let j = 0; j < p.pcm.length; j++) out[o + j] += p.pcm[j]; }
  return out;
}
const concat = (arrs) => { const out = new Float32Array(arrs.reduce((a, x) => a + x.length, 0)); let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; } return out; };
const chars = (text) => [...String(text).replace(/[\s，。、！？「」—…：；（）,.!?]/g, '')].length;
const sd = (xs) => { const m = xs.reduce((a, x) => a + x, 0) / xs.length; return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length); };
const r2 = (x) => Math.round(x * 100) / 100;

mkdirSync(outDir, { recursive: true });
const rows = [], files = [];
for (const ex of trial.exchanges) {
  const a = [], b = [];
  let t = 0, prevEnd = 0;
  for (const l of ex.lines) {
    const row = sheet.get(l.old), file = join(root, trial.audio, `${l.old}.mp3`);
    const orig = decode(file), before = measure(orig);
    const tempo = TEMPO[row.emotion] || 1, gdB = GAIN_DB[row.emotion] ?? 0;
    const made = gain(trim(decode(file, tempo)), gdB), after = measure(made);
    a.push(orig, silence(REPLY_GAP));
    const start = b.length === 0 ? 0 : INTERRUPTS.has(l.old) ? Math.max(0, prevEnd - INTERRUPT_OVERLAP) : prevEnd + TURN_GAP;
    b.push({ start, pcm: made }); prevEnd = start + made.length / RATE;
    const c = chars(row.text);
    rows.push({ at: ex.at, id: l.old, role: row.role, emotion: row.emotion, chars: c, gainDb: gdB, tempo,
      before: { level: r2(before.level), cps: r2(c / before.speech), sec: r2(before.total) },
      after: { level: r2(after.level), cps: r2(c / after.speech), sec: r2(after.total) } });
  }
  const aPcm = concat(a.slice(0, -1)), bPcm = mix(b);
  const beep = new Float32Array(Math.round(BEEP.sec * RATE)).map((_, j) => BEEP.volume * Math.sin(2 * Math.PI * BEEP.hz * j / RATE));
  const out = join(outDir, `ab-${ex.at}.mp3`);
  encode(concat([aPcm, silence(BEEP.gap), beep, silence(BEEP.gap), bPcm]), out, true);
  files.push({ at: ex.at, file: out, aSec: r2(aPcm.length / RATE), bSec: r2(bPcm.length / RATE) });
}

const sum = (k) => ({
  levelSpreadDb: r2(Math.max(...rows.map(r => r[k].level)) - Math.min(...rows.map(r => r[k].level))),
  levelSdDb: r2(sd(rows.map(r => r[k].level))),
  cps: r2(rows.reduce((a, r) => a + r.chars, 0) / rows.reduce((a, r) => a + r.chars / r[k].cps, 0)),
  cpsSd: r2(sd(rows.map(r => r[k].cps))),
});
const report = { lines: rows, files: files.map(f => ({ ...f, file: f.file.slice(root.length + 1) })), before: sum('before'), after: sum('after') };
writeFileSync(join(outDir, 'measure.json'), JSON.stringify(report, null, 2) + '\n');
for (const r of rows) console.log(`${r.at}\t${r.id}\t${r.emotion}\t${r.gainDb}dB x${r.tempo}\tlevel ${r.before.level} -> ${r.after.level}\tcps ${r.before.cps} -> ${r.after.cps}\tsec ${r.before.sec} -> ${r.after.sec}`);
for (const f of files) console.log(`ab-${f.at}.mp3\tA ${f.aSec}s\tB ${f.bSec}s`);
console.log('before', JSON.stringify(report.before));
console.log('after ', JSON.stringify(report.after));
