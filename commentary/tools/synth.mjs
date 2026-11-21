// Synthesize commentary audio with OpenAI gpt-audio-1.5 (issue #26).
// Usage: node commentary/tools/synth.mjs --trial [--redo]
//        node commentary/tools/synth.mjs --in lines.json --out dir [--redo]
//   input json: [{role, tone, text, id?, voice?}]
// API key: env OPENAI_API_KEY only (falls back to HKCU\Environment on Windows). Never printed.
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const redo = flag('--redo');
const inFile = flag('--trial') ? join(here, 'trial.json') : opt('--in');
const outDir = flag('--trial') ? join(root, 'audio', '_trial') : opt('--out');
if (!inFile || !outDir) { console.error('usage: --trial | --in <json> --out <dir>  [--redo]'); process.exit(2); }

function getKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  if (process.platform === 'win32') {
    try {
      const out = execFileSync('reg', ['query', 'HKCU\\Environment', '/v', 'OPENAI_API_KEY'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const m = out.match(/OPENAI_API_KEY\s+REG_(?:EXPAND_)?SZ\s+(\S+)/);
      if (m) return m[1];
    } catch {}
  }
  console.error('OPENAI_API_KEY not set'); process.exit(1);
}

const roles = JSON.parse(readFileSync(join(root, 'voices.json'), 'utf8')).roles;
const lines = JSON.parse(readFileSync(inFile, 'utf8'));
mkdirSync(outDir, { recursive: true });
const manifestPath = join(outDir, 'manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
const SUFFIX = '你是台灣口音的配音員，逐字照唸使用者給的台詞，不增不減。';
const norm = (s) => s.replace(/[\s，。、！？!?,.…—\-「」『』"'：:；;（）()]/g, '');
const LOUD = 'loudnorm:I=-16:TP=-1.5:LRA=11:2pass';
const hashOf = (r, l) => createHash('sha256').update(JSON.stringify([r.model, l.voice || r.voice, r.persona, l.tone, l.text, LOUD])).digest('hex');
function normalize(file) {
  const tmp = file + '.norm.mp3';
  const p1 = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], { encoding: 'utf8', windowsHide: true });
  const m = (p1.stderr || '').match(/\{[^{}]*"input_i"[^{}]*\}/);
  if (!m) throw new Error('loudnorm pass1 failed');
  const d = JSON.parse(m[0]);
  const af = `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${d.input_i}:measured_TP=${d.input_tp}:measured_LRA=${d.input_lra}:measured_thresh=${d.input_thresh}:offset=${d.target_offset}:linear=true`;
  const p2 = spawnSync('ffmpeg', ['-hide_banner', '-y', '-i', file, '-af', af, '-ar', '24000', '-c:a', 'libmp3lame', '-q:a', '2', tmp], { encoding: 'utf8', windowsHide: true });
  if (p2.status !== 0) throw new Error('loudnorm pass2 failed');
  renameSync(tmp, file);
}

const tot = { textIn: 0, textOut: 0, audioOut: 0, audioIn: 0 };
const counts = { made: 0, skipped: 0, stale: 0, mismatch: 0, failed: 0 };
const counter = {};
let key;

for (const l of lines) {
  const r = roles[l.role];
  if (!r) { console.error(`unknown role ${l.role}`); counts.failed++; continue; }
  counter[l.role] = (counter[l.role] || 0) + 1;
  const id = l.id || `${l.role}_${String(counter[l.role]).padStart(2, '0')}`;
  const file = join(outDir, `${id}.mp3`);
  const h = hashOf(r, l);
  const prev = manifest[id];
  if (existsSync(file) && prev) {
    if (prev.hash === h) { counts.skipped++; console.log(`skip   ${id}`); continue; }
    if (!redo) { counts.stale++; console.log(`STALE  ${id} (hash changed; use --redo to regenerate)`); continue; }
  }
  key ??= getKey();
  const body = {
    model: r.model,
    modalities: ['text', 'audio'],
    audio: { voice: l.voice || r.voice, format: 'mp3' },
    messages: [
      { role: 'system', content: r.persona + SUFFIX },
      { role: 'user', content: `語氣：${l.tone}\n台詞：${l.text}` },
    ],
  };
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) { counts.failed++; console.error(`FAIL   ${id} HTTP ${res.status} ${(await res.text()).slice(0, 300)}`); continue; }
  const j = await res.json();
  const a = j.choices?.[0]?.message?.audio;
  if (!a?.data) { counts.failed++; console.error(`FAIL   ${id} no audio`); continue; }
  writeFileSync(file, Buffer.from(a.data, 'base64'));
  try { normalize(file); } catch (e) { counts.failed++; console.error(`FAIL   ${id} ${e.message}`); continue; }
  const u = j.usage || {};
  tot.textIn += u.prompt_tokens_details?.text_tokens ?? u.prompt_tokens ?? 0;
  tot.audioIn += u.prompt_tokens_details?.audio_tokens ?? 0;
  tot.audioOut += u.completion_tokens_details?.audio_tokens ?? 0;
  tot.textOut += u.completion_tokens_details?.text_tokens ?? 0;
  const ok = norm(a.transcript || '') === norm(l.text);
  if (!ok) counts.mismatch++;
  manifest[id] = { hash: h, role: l.role, model: r.model, voice: l.voice || r.voice, tone: l.tone, text: l.text, transcript: a.transcript || '', transcriptMatch: ok };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  counts.made++;
  console.log(`made   ${id}${ok ? '' : `  MISMATCH: "${a.transcript}"`}`);
}

const cost = tot.audioOut * 64e-6 + tot.textOut * 10e-6 + tot.textIn * 2.5e-6;
console.log(`\nsummary: ${JSON.stringify(counts)}`);
console.log(`tokens: text_in=${tot.textIn} text_out=${tot.textOut} audio_out=${tot.audioOut} (audio_in=${tot.audioIn} not priced)`);
console.log(`estimated cost: US$${cost.toFixed(4)}`);
