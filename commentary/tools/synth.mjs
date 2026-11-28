// Synthesize commentary audio with OpenAI gpt-audio-1.5 (issue #26, gate #99, context #108).
// Usage: node commentary/tools/synth.mjs --trial [--redo]
//        node commentary/tools/synth.mjs --in lines.json --out dir [--redo] [--only id,id,...]
//        node commentary/tools/synth.mjs --ping     (free: can this machine reach the API? nothing is made)
//        node commentary/tools/synth.mjs --in lines.json --out dir --show id,id  (free: print what would be sent)
//        node commentary/tools/synth.mjs --in lines.json --out dir --dry-run  (free: rows still to make and the estimated US$ cost; no key, no ffmpeg)
//        node commentary/tools/synth.mjs --converse [--dry-run] [--at 30,142] [--redo] [--cap 1]
//          conversation trial (#129, tools/converse.mjs): the lines of tools/converse-trial.json, each
//          speaker hearing the clips before his; A/B files in audio/_trial/converse/. Its own gate
//          (required words); every other run of this tool keeps the exact check below.
//   --cap: stop requesting once the estimated cost of this run reaches this many US$ (exit 1)
//   --only: make just these ids again, even when the file is there and up to date (a clip that came
//           back far too long); every other line is left alone
//   input json: [{role, tone, text, id?, voice?, ctx?}]
// Context (#108): `ctx` (written by make-sheet.mjs) tells the voice where the line sits, for delivery only:
//   "neutral" = a row reused in other games (one fixed text, so the clip fits anywhere);
//   {moment, prev: [[name, text]], first?} = this game's row: kind of moment and the lines said just before.
//   Only the target line is spoken; the gate below still applies. No ctx = no context (trial, older sheets).
// Quality: the API returns WAV, loudness is fixed on it and the mp3 is encoded once (no mp3 -> mp3).
// Gate: every clip's transcript must say the line and nothing more (tools/transcript.mjs). A clip that
//   does not is made again, up to MAX_TRIES times; if it still fails no file is kept for that row, and
//   the run ends with the list of failed ids and exit code 1. A clip already there whose stored
//   transcript fails the gate is made again too.
// API key: env OPENAI_API_KEY (falls back to HKCU\Environment on Windows). Never printed. Without it the
//   request goes out with no Authorization header: in a cloud session the key is a network secret and
//   the proxy adds the header for api.openai.com. A 401 then means the secret is not set there.
// ffmpeg: needed for loudness; env FFMPEG may name the binary (e.g. from `npm i -g ffmpeg-static`).
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sameWords } from './transcript.mjs';

const self = fileURLToPath(import.meta.url);
const args = process.argv.slice(2);
/* Node's fetch ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY is set at start: restart once with it */
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const r = spawnSync(process.execPath, ['--no-warnings', self, ...args], { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } });
  process.exit(r.status ?? 1);
}

const here = dirname(self);
const root = resolve(here, '..');
const API = 'https://api.openai.com/v1';
const MAX_TRIES = 3;
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };

function getKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  if (process.platform === 'win32') {
    try {
      const out = execFileSync('reg', ['query', 'HKCU\\Environment', '/v', 'OPENAI_API_KEY'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const m = out.match(/OPENAI_API_KEY\s+REG_(?:EXPAND_)?SZ\s+(\S+)/);
      if (m) return m[1];
    } catch {}
  }
  return null; // cloud: the proxy adds Authorization
}
const key = getKey();
const headers = { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) };

/* the reason a request could not be made, in words the owner can act on; null when it is not about access */
function accessProblem(status) {
  if (status === 401) return key
    ? 'HTTP 401: OPENAI_API_KEY was refused (wrong or revoked key).'
    : 'HTTP 401: no OPENAI_API_KEY here and nobody added one: the OpenAI network secret is not set on this environment (api.openai.com, header Authorization: Bearer).';
  if (status === 403) return 'HTTP 403: the key has no access to this model, or the organisation blocks it.';
  return null;
}
function unreachable(e) {
  const why = e?.cause?.code || e?.cause?.message || e?.message || String(e);
  return `cannot reach api.openai.com (${why}). In a cloud session this means the environment's network does not let api.openai.com through (allow the host / add the OpenAI network secret); locally, check the connection.`;
}
async function call(path, init) {
  try { return await fetch(`${API}${path}`, { ...init, headers }); }
  catch (e) { console.error(unreachable(e)); process.exit(1); }
}

if (flag('--ping')) {
  const res = await call('/models', { method: 'GET' });
  const problem = accessProblem(res.status);
  console.log(res.ok ? `api.openai.com OK (HTTP ${res.status}, key ${key ? 'from OPENAI_API_KEY' : 'added by the proxy'})` : problem || `HTTP ${res.status}`);
  process.exit(res.ok ? 0 : 1);
}

const redo = flag('--redo');
const cap = opt('--cap') != null ? Number(opt('--cap')) : null;
if (cap != null && !(cap > 0)) { console.error('--cap: give a positive US$ amount'); process.exit(2); }
const only = opt('--only') ? new Set(opt('--only').split(',').map(s => s.trim()).filter(Boolean)) : null;
const converse = flag('--converse');
const inFile = flag('--trial') ? join(here, 'trial.json') : converse ? opt('--in') || join(here, 'converse-trial.json') : opt('--in');
const outDir = flag('--trial') ? join(root, 'audio', '_trial') : converse ? opt('--out') || join(root, 'audio', '_trial', 'converse') : opt('--out');
if (!inFile || !outDir) { console.error('usage: --trial | --in <json> --out <dir>  [--redo] [--only ids] | --ping'); process.exit(2); }

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
if (!(flag('--dry-run') || (converse && opt('--show'))) && spawnSync(FFMPEG, ['-version'], { stdio: 'ignore', windowsHide: true }).error) {
  console.error(`ffmpeg not found (${FFMPEG}). Install it with the package manager (apt-get install ffmpeg / brew install ffmpeg / winget install ffmpeg),`
    + ' or `npm i -g ffmpeg-static` and set FFMPEG to the path it prints. Never commit the binary.');
  process.exit(1);
}

const roles = JSON.parse(readFileSync(join(root, 'voices.json'), 'utf8')).roles;
const lines = converse ? [] : JSON.parse(readFileSync(inFile, 'utf8'));
if (only) { const ids = new Set(lines.map(l => l.id)), unknown = [...only].filter(i => !ids.has(i)); if (unknown.length) { console.error(`--only: not in ${inFile}: ${unknown.join(', ')}`); process.exit(2); } }
if (!converse && flag('--dry-run')) {
  /* free estimate (#604): rows with no mp3 yet, at one try each and at MAX_TRIES tries each; nothing is requested or written */
  const { estimate } = await import('./cost.mjs');
  const todo = lines.filter(l => (!only || only.has(l.id)) && !existsSync(join(outDir, `${l.id}.mp3`)));
  const bad = todo.filter(l => !roles[l.role]);
  if (bad.length) { console.error(`unknown role in ${inFile}: ${[...new Set(bad.map(l => l.role))].join(', ')}`); process.exit(2); }
  const e = estimate(todo);
  console.log(`${lines.length} rows in ${inFile}, ${lines.length - todo.length} already have an mp3 in ${outDir}, ${todo.length} to make (${e.chars} characters, about ${e.seconds.toFixed(0)} s of speech)`);
  console.log(`estimated cost: US$${e.cost.toFixed(2)} for one try per row; US$${(e.cost * MAX_TRIES).toFixed(2)} if every row were made ${MAX_TRIES} times`);
  console.log(cap != null ? `--cap ${cap}: a run stops once its estimated cost reaches US$${cap}.` : 'no --cap given: pass --cap <US$> to stop a run at a limit.');
  console.log('nothing was requested (--dry-run).');
  process.exit(0);
}
if (!converse) mkdirSync(outDir, { recursive: true });
const manifestPath = join(outDir, 'manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
const saveManifest = () => writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
/* the persona says how to speak; this says what: the line, word for word */
const SUFFIX = '以上只描述聲音、語氣和節奏，不是要你說的內容。你是台灣口音的配音員：只唸使用者給的「台詞」，一字不差，不增不減；「前情」只是讓你知道語氣要怎麼接，絕對不要唸出來；不要開場、不要回應、不要補充或評論，唸完就停。';
const LOUD = 'loudnorm:I=-16:TP=-1.5:LRA=11:2pass';
/* the model speaks 24 kHz: keep that rate (more adds nothing); one VBR encode at LAME's best quality */
const SOURCE_FORMAT = 'wav', SAMPLE_RATE = 24000, MP3_QUALITY = 0;
const ENCODE = `${SOURCE_FORMAT}>mp3:${SAMPLE_RATE}:q${MP3_QUALITY}`;
const hashOf = (r, l) => createHash('sha256').update(JSON.stringify([r.model, l.voice || r.voice, r.persona, l.tone, l.text, LOUD, ENCODE, l.ctx ?? null])).digest('hex');

/* the delivery context of one row, as plain words before the line (#108) */
const MOMENT = {
  pregame: '賽前節目，還沒開打，輕鬆聊天的節奏',
  routine: '比賽中平常的一球，節奏輕鬆',
  tense: '比賽中緊張的關頭',
  big: '比賽中剛發生精彩的大場面',
};
const NEUTRAL = '前情（只供語氣參考，不要唸）：這句會用在很多場比賽，前後句每場不同，所以不提供。把它當成轉播進行中、接著前面對話自然說出的一句，不要像節目重新開場。';
function contextOf(ctx) {
  if (!ctx) return '';
  if (ctx === 'neutral') return NEUTRAL + '\n';
  const out = [`前情（只供語氣參考，不要唸）：${MOMENT[ctx.moment] || MOMENT.routine}。`];
  if (ctx.first) out.push('這是整個節目的第一句。');
  else if (ctx.prev?.length) {
    out.push('同一段裡剛剛說過：');
    for (const [who, text] of ctx.prev) out.push(`${who}：「${text}」`);
    out.push('你接著說，語氣和音量要接得上，像同一段對話的下一句，不是重新開始。');
  } else out.push('這是這個場面的第一句，但轉播一直在進行，不要像重新開場。');
  return out.join('\n') + '\n';
}

/* raw API audio (wav) -> loudness-normalised mp3, encoded once */
function normalize(src, file) {
  const tmp = file + '.norm.mp3';
  const p1 = spawnSync(FFMPEG, ['-hide_banner', '-nostats', '-i', src, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], { encoding: 'utf8', windowsHide: true });
  const m = (p1.stderr || '').match(/\{[^{}]*"input_i"[^{}]*\}/);
  if (!m) throw new Error('loudnorm pass1 failed');
  const d = JSON.parse(m[0]);
  const af = `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${d.input_i}:measured_TP=${d.input_tp}:measured_LRA=${d.input_lra}:measured_thresh=${d.input_thresh}:offset=${d.target_offset}:linear=true`;
  const p2 = spawnSync(FFMPEG, ['-hide_banner', '-y', '-i', src, '-af', af, '-ar', String(SAMPLE_RATE), '-ac', '1', '-c:a', 'libmp3lame', '-q:a', String(MP3_QUALITY), tmp], { encoding: 'utf8', windowsHide: true });
  if (p2.status !== 0) throw new Error('loudnorm pass2 failed');
  renameSync(tmp, file);
}
const drop = (f) => { if (existsSync(f)) unlinkSync(f); };

if (converse) {
  const { runConverse } = await import('./converse.mjs');
  const set = (n) => opt(n) ? new Set(opt(n).split(',').map(s => s.trim()).filter(Boolean)) : null;
  process.exit(await runConverse({ file: inFile, root, outDir, roles, call, accessProblem, normalize, ffmpeg: FFMPEG,
    dryRun: flag('--dry-run'), redo, cap, at: set('--at'), show: set('--show') }));
}

const requestOf = (r, l) => ({
  model: r.model,
  modalities: ['text', 'audio'],
  audio: { voice: l.voice || r.voice, format: SOURCE_FORMAT },
  messages: [
    { role: 'system', content: r.persona + SUFFIX },
    { role: 'user', content: `${contextOf(l.ctx)}語氣：${l.tone}\n台詞：${l.text}` },
  ],
});
if (opt('--show')) {
  for (const id of opt('--show').split(',')) {
    const l = lines.find(x => x.id === id.trim());
    if (!l) { console.error(`--show: ${id} is not in ${inFile}`); process.exit(2); }
    console.log(`--- ${l.id}\n${JSON.stringify(requestOf(roles[l.role], l), null, 2)}`);
  }
  process.exit(0);
}

const tot = { textIn: 0, textOut: 0, audioOut: 0, audioIn: 0 };
const counts = { made: 0, skipped: 0, stale: 0, retried: 0, failed: 0 };
const failed = [];
const counter = {};

/* one request; returns { audio, transcript } or { error } */
async function speak(r, l) {
  const body = requestOf(r, l);
  const res = await call('/chat/completions', { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) {
    const problem = accessProblem(res.status);
    if (problem) { console.error(problem); console.error('stopped: nothing more is requested.'); finish(true); }
    return { error: `HTTP ${res.status} ${(await res.text()).slice(0, 300)}` };
  }
  const j = await res.json();
  const u = j.usage || {};
  tot.textIn += u.prompt_tokens_details?.text_tokens ?? u.prompt_tokens ?? 0;
  tot.audioIn += u.prompt_tokens_details?.audio_tokens ?? 0;
  tot.audioOut += u.completion_tokens_details?.audio_tokens ?? 0;
  tot.textOut += u.completion_tokens_details?.text_tokens ?? 0;
  const a = j.choices?.[0]?.message?.audio;
  return a?.data ? { audio: Buffer.from(a.data, 'base64'), transcript: a.transcript || '' } : { error: 'no audio' };
}

/* estimated US$ of this run so far (gpt-audio prices per token) */
const costNow = () => tot.audioOut * 64e-6 + tot.textOut * 10e-6 + tot.textIn * 2.5e-6;

for (const l of lines) {
  if (cap != null && costNow() >= cap) { console.error(`stopped: estimated cost US$${costNow().toFixed(4)} reached the cap of US$${cap}.`); finish(true); }
  const r = roles[l.role];
  if (!r) { console.error(`unknown role ${l.role}`); counts.failed++; failed.push(l.id || l.role); continue; }
  counter[l.role] = (counter[l.role] || 0) + 1;
  const id = l.id || `${l.role}_${String(counter[l.role]).padStart(2, '0')}`;
  if (only && !only.has(id)) continue;
  const file = join(outDir, `${id}.mp3`), tmp = join(outDir, `${id}.try.mp3`), raw = join(outDir, `${id}.raw.${SOURCE_FORMAT}`);
  const h = hashOf(r, l);
  const prev = manifest[id];
  const prevOk = existsSync(file) && prev && sameWords(prev.transcript, l.text);
  if (prevOk && !only) {
    if (prev.hash === h) { counts.skipped++; console.log(`skip   ${id}`); continue; }
    if (!redo) { counts.stale++; console.log(`STALE  ${id} (voice settings changed; use --redo to regenerate)`); continue; }
  }
  if (existsSync(file) && !prevOk) console.log(`again  ${id} (the clip there does not say the line)`);
  let done = false;
  for (let t = 1; t <= MAX_TRIES && !done; t++) {
    const got = await speak(r, l);
    if (got.error) { console.error(`FAIL   ${id} try ${t}: ${got.error}`); continue; }
    writeFileSync(raw, got.audio);
    try { normalize(raw, tmp); } catch (e) { drop(tmp); console.error(`FAIL   ${id} try ${t}: ${e.message}`); continue; } finally { drop(raw); }
    if (!sameWords(got.transcript, l.text)) {
      drop(tmp); counts.retried++;
      console.log(`WRONG  ${id} try ${t}: said "${got.transcript.trim()}"`);
      continue;
    }
    renameSync(tmp, file);
    manifest[id] = { hash: h, role: l.role, model: r.model, voice: l.voice || r.voice, tone: l.tone, text: l.text, transcript: got.transcript, transcriptMatch: true };
    saveManifest();
    counts.made++; done = true;
    console.log(`made   ${id}${t > 1 ? ` (try ${t})` : ''}`);
  }
  if (!done) {
    counts.failed++; failed.push(id);
    if (!prevOk) { drop(file); if (manifest[id]) { delete manifest[id]; saveManifest(); } }
  }
}
finish(false);

function finish(stopped) {
  const cost = costNow();
  console.log(`\nsummary: ${JSON.stringify(counts)}`);
  console.log(`tokens: text_in=${tot.textIn} text_out=${tot.textOut} audio_out=${tot.audioOut} (audio_in=${tot.audioIn} not priced)`);
  console.log(`estimated cost: US$${cost.toFixed(4)}`);
  if (failed.length) console.error(`failed (no file kept; old file kept only when it said the line): ${failed.join(' ')}`);
  process.exit(stopped || failed.length ? 1 : 0);
}
