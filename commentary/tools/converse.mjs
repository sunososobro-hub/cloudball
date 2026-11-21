/* Conversation mode of synth.mjs (#129): run with `node commentary/tools/synth.mjs --converse`.
 *
 * The lines of one exchange are made in order, and each speaker is given the clips said before
 * his in that exchange as audio (Chat Completions `input_audio`, the clips he would hear in the
 * booth), then the meaning of his line and the words he must say. He is told to answer it as in a
 * live booth: short fillers, a breath, a laugh, small words dropped or bent are allowed.
 *
 * Gate (these lines only; every other line of the game keeps the exact check of synth.mjs):
 *   - every `must` word is in the transcript (transcript.mjs missingWords), and
 *   - the clip is not much longer than the line (MAX_STRETCH), so it cannot add a sentence or a fact.
 * A clip that fails is made again up to MAX_TRIES times; if it still fails, the rest of that
 * exchange is not made (the next speaker would answer a clip that is not there).
 *
 * Resumable: a clip is kept while its hash holds; the hash of a line includes the hash of the line
 * before it, so remaking a clip remakes the replies after it and nothing else.
 *
 * Output (outDir, default commentary/audio/_trial/converse/, git-ignored): <id>.mp3 per new line,
 * manifest.json, and ab-<at>.mp3 per exchange: the current clips, a beep, the new clips, joined
 * with the reply gap the player uses, so A and B are heard in one listen. Nothing is wired. */
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { words, missingWords } from './transcript.mjs';

const MAX_TRIES = 3;
const MAX_STRETCH = 1.6;          /* a clip may say at most this many times the words of its line */
const REPLY_GAP = 0.35;           /* seconds between a line and the answer to it (player.js REPLY_GAP) */
const BEEP = { hz: 880, sec: 0.4, gap: 0.8, volume: 0.25 };   /* between A and B: silence, beep, silence */
const RATE = 24000;
/* estimates for --dry-run only (gpt-audio prices per token; audio tokens per second of speech) */
const PRICE = { textIn: 2.5e-6, textOut: 10e-6, audioIn: 32e-6, audioOut: 64e-6 };
const AUDIO_TOKENS_IN_PER_SEC = 10, AUDIO_TOKENS_OUT_PER_SEC = 20;
const SPEECH_CPS = 4.5;           /* characters per second of speech (player.js SPEECH_CPS) */
const PROMPT_TOKENS = 450;        /* persona + instructions + line, text tokens per request */

const MOMENT = { routine: '比賽中平常的一球', tense: '比賽中緊張的關頭', big: '比賽中剛發生精彩的大場面' };
const LIVE = '以上描述你的聲音和個性。現在是現場直播，你坐在轉播台，跟搭檔和來賓即時聊這場球。'
  + '使用者會先給你同一段裡別人剛剛說的話（錄音），再告訴你這一句要說的意思。'
  + '你要像真的在現場接話：聽前面的人怎麼說、用什麼口氣，直接接下去回他，不要像在唸稿。'
  + '可以加很短的語助詞（欸、啦、喔、厚、蛤）、換一口氣、笑一下、說到一半改口，小字可以換掉或省掉。'
  + '但「一定要說到」裡的每個詞都要原字說出來（名字、數字、比數、笑點），意思不能變，不能多講別的事情，也不能多加一句。'
  + '只說你這一句，說完就停；不要唸出這些提示，不要替別人說話。';

const sha = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const b64 = (f) => readFileSync(f).toString('base64');

/* read and check the trial file; returns { exchanges, problems } */
export function loadTrial(file, root, roles) {
  const trial = JSON.parse(readFileSync(file, 'utf8'));
  const sheet = JSON.parse(readFileSync(join(root, trial.sheet), 'utf8'));
  const byId = new Map(sheet.map(r => [r.id, r]));
  const problems = [], ids = new Set();
  for (const ex of trial.exchanges) {
    if (!MOMENT[ex.moment]) problems.push(`at ${ex.at}: unknown moment ${ex.moment}`);
    for (const l of ex.lines) {
      if (ids.has(l.id)) problems.push(`${l.id}: id used twice`); ids.add(l.id);
      if (!roles[l.role]) problems.push(`${l.id}: unknown role ${l.role}`);
      const old = byId.get(l.old);
      if (!old) { problems.push(`${l.id}: old line ${l.old} is not in ${trial.sheet}`); continue; }
      if (old.role !== l.role) problems.push(`${l.id}: role ${l.role} but the old line is ${old.role}`);
      if (!(old.uses || []).includes(`event ${ex.at}`)) problems.push(`${l.id}: old line ${l.old} is not used at event ${ex.at}`);
      l.oldText = old.text; l.tone = l.tone || old.tone;
      l.oldAudio = join(root, trial.audio, `${l.old}.mp3`);
      if (!existsSync(l.oldAudio)) problems.push(`${l.id}: no clip for the old line (${l.oldAudio})`);
      if (!l.must?.length) problems.push(`${l.id}: no required words`);
      const gap = missingWords(l.text, l.must || []);
      if (gap.length) problems.push(`${l.id}: required words not in its own text: ${gap.join(' ')}`);
    }
  }
  return { exchanges: trial.exchanges, problems };
}

/* the request for line k of an exchange; `heard` = [{name, tone, file}] of the clips before it */
export function requestOf(r, l, ex, heard, k) {
  const content = [];
  for (const h of heard) {
    content.push({ type: 'text', text: `（${h.name}剛剛說，語氣：${h.tone}）` });
    content.push({ type: 'input_audio', input_audio: { data: h.file ? b64(h.file) : '<clip>', format: 'mp3' } });
  }
  content.push({ type: 'text', text: [
    `現場：${MOMENT[ex.moment]}。${k === 0 ? '這一段由你先開口。' : '輪到你接話。'}`,
    `語氣：${l.tone}`,
    `這一句的意思（照這個意思說，用你自己現場會講的說法）：${l.text}`,
    `一定要說到：${l.must.join('、')}`,
  ].join('\n') });
  return {
    model: r.model,
    modalities: ['text', 'audio'],
    audio: { voice: r.voice, format: 'wav' },
    messages: [{ role: 'system', content: r.persona + LIVE }, { role: 'user', content }],
  };
}

export async function runConverse({ file, root, outDir, roles, call, accessProblem, normalize, ffmpeg, dryRun, redo, cap, at, show }) {
  const { exchanges: all, problems } = loadTrial(file, root, roles);
  if (problems.length) { console.error(`converse: ${file}\n  ${problems.join('\n  ')}`); return 2; }
  const exchanges = at ? all.filter(ex => at.has(String(ex.at))) : all;
  if (at && exchanges.length !== at.size) { console.error(`--at: use one of ${all.map(e => e.at).join(', ')}`); return 2; }
  const nameOf = (l) => roles[l.role].name;

  if (show) {
    for (const ex of exchanges) ex.lines.forEach((l, k) => {
      if (!show.has(l.id)) return;
      const heard = ex.lines.slice(0, k).map(p => ({ name: nameOf(p), tone: p.tone, file: null }));
      console.log(`--- ${l.id}\n${JSON.stringify(requestOf(roles[l.role], l, ex, heard, k), null, 2)}`);
    });
    return 0;
  }

  if (dryRun) {
    let n = 0, chars = 0, secIn = 0, cost = 0;
    for (const ex of exchanges) {
      console.log(`at ${ex.at} (${ex.what})`);
      let before = 0;
      for (const l of ex.lines) {
        const sec = words(l.text).length / SPEECH_CPS;
        const c = PROMPT_TOKENS * PRICE.textIn + before * AUDIO_TOKENS_IN_PER_SEC * PRICE.audioIn
          + sec * AUDIO_TOKENS_OUT_PER_SEC * PRICE.audioOut + words(l.text).length * PRICE.textOut;
        console.log(`  ${l.id.padEnd(8)} ${nameOf(l)}\n    now: ${l.oldText}\n    new: ${l.text}\n    must: ${l.must.join(' ')}`);
        n++; chars += words(l.text).length; secIn += before; cost += c; before += sec;
      }
    }
    console.log(`\n${n} lines, ${chars} characters, about ${secIn.toFixed(0)} s of earlier clips heard as input`);
    console.log(`estimated cost per run: US$${cost.toFixed(3)}; with every line made ${MAX_TRIES} times: US$${(cost * MAX_TRIES).toFixed(3)}`);
    console.log('nothing was requested (--dry-run).');
    return 0;
  }

  mkdirSync(outDir, { recursive: true });
  const manifestPath = join(outDir, 'manifest.json');
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
  const save = () => writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const tot = { textIn: 0, textOut: 0, audioIn: 0, audioOut: 0 };
  const costNow = () => Object.keys(PRICE).reduce((s, k) => s + tot[k] * PRICE[k], 0);
  const counts = { made: 0, skipped: 0, retried: 0, failed: 0, ab: 0 };
  const failed = [];
  const pass = (transcript, l) => {
    const miss = missingWords(transcript, l.must);
    if (miss.length) return `missing ${miss.join(' ')}`;
    if (words(transcript).length > words(l.text).length * MAX_STRETCH) return 'too long';
    return null;
  };

  for (const ex of exchanges) {
    let chain = 'start', ok = true;
    const heard = [];
    for (const [k, l] of ex.lines.entries()) {
      const r = roles[l.role], out = join(outDir, `${l.id}.mp3`);
      const body = requestOf(r, l, ex, heard.map(h => ({ ...h, file: null })), k);
      const h = sha([chain, body, LIVE, MAX_STRETCH]);
      const prev = manifest[l.id];
      if (!redo && prev?.hash === h && existsSync(out) && !pass(prev.transcript, l)) {
        counts.skipped++; console.log(`skip   ${l.id}`);
      } else {
        if (cap != null && costNow() >= cap) { console.error(`stopped: estimated cost US$${costNow().toFixed(4)} reached the cap of US$${cap}.`); ok = false; break; }
        let done = false;
        for (let t = 1; t <= MAX_TRIES && !done; t++) {
          const res = await call('/chat/completions', { method: 'POST', body: JSON.stringify(requestOf(r, l, ex, heard, k)) });
          if (!res.ok) {
            const problem = accessProblem(res.status);
            if (problem) { console.error(problem); return 1; }
            console.error(`FAIL   ${l.id} try ${t}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`); continue;
          }
          const j = await res.json(), u = j.usage || {};
          tot.textIn += u.prompt_tokens_details?.text_tokens ?? 0;
          tot.audioIn += u.prompt_tokens_details?.audio_tokens ?? 0;
          tot.audioOut += u.completion_tokens_details?.audio_tokens ?? 0;
          tot.textOut += u.completion_tokens_details?.text_tokens ?? 0;
          const a = j.choices?.[0]?.message?.audio;
          if (!a?.data) { console.error(`FAIL   ${l.id} try ${t}: no audio`); continue; }
          const why = pass(a.transcript || '', l);
          if (why) { counts.retried++; console.log(`WRONG  ${l.id} try ${t} (${why}): said "${(a.transcript || '').trim()}"`); continue; }
          const raw = join(outDir, `${l.id}.raw.wav`);
          writeFileSync(raw, Buffer.from(a.data, 'base64'));
          try { normalize(raw, out); } catch (e) { console.error(`FAIL   ${l.id} try ${t}: ${e.message}`); continue; } finally { if (existsSync(raw)) unlinkSync(raw); }
          manifest[l.id] = { hash: h, role: l.role, voice: r.voice, model: r.model, text: l.text, must: l.must, transcript: a.transcript };
          save(); counts.made++; done = true;
          console.log(`made   ${l.id}${t > 1 ? ` (try ${t})` : ''}: "${a.transcript.trim()}"`);
        }
        if (!done) { counts.failed++; failed.push(l.id); ok = false; console.error(`at ${ex.at}: the lines after ${l.id} are not made (they answer it).`); break; }
      }
      heard.push({ name: r.name, tone: l.tone, file: out });
      chain = h;
    }
    if (ok) { abFile(ffmpeg, ex, outDir); counts.ab++; console.log(`A/B    ab-${ex.at}.mp3`); }
  }
  console.log(`\nsummary: ${JSON.stringify(counts)}`);
  console.log(`tokens: text_in=${tot.textIn} text_out=${tot.textOut} audio_in=${tot.audioIn} audio_out=${tot.audioOut}`);
  console.log(`estimated cost: US$${costNow().toFixed(4)}`);
  if (failed.length) console.error(`failed: ${failed.join(' ')}`);
  return failed.length || counts.ab < exchanges.length ? 1 : 0;
}

/* ab-<at>.mp3: the current clips, a beep, the new clips; each clip followed by the reply gap */
function abFile(ffmpeg, ex, outDir) {
  const a = ex.lines.map(l => l.oldAudio), b = ex.lines.map(l => join(outDir, `${l.id}.mp3`));
  const files = [...a, ...b], args = ['-hide_banner', '-loglevel', 'error', '-y'];
  for (const f of files) args.push('-i', f);
  args.push('-f', 'lavfi', '-i', `sine=frequency=${BEEP.hz}:duration=${BEEP.sec}:sample_rate=${RATE}`);
  const norm = (i, pad) => `[${i}:a]aresample=${RATE},aformat=channel_layouts=mono,apad=pad_dur=${pad}[s${i}]`;
  const parts = files.map((_, i) => norm(i, i === a.length - 1 ? BEEP.gap : REPLY_GAP));
  const beep = files.length;
  parts.push(`[${beep}:a]aformat=channel_layouts=mono,volume=${BEEP.volume},apad=pad_dur=${BEEP.gap}[s${beep}]`);
  const order = [...a.map((_, i) => i), beep, ...b.map((_, i) => a.length + i)];
  parts.push(`${order.map(i => `[s${i}]`).join('')}concat=n=${order.length}:v=0:a=1[out]`);
  args.push('-filter_complex', parts.join(';'), '-map', '[out]', '-ac', '1', '-ar', String(RATE), '-c:a', 'libmp3lame', '-q:a', '2', join(outDir, `ab-${ex.at}.mp3`));
  const p = spawnSync(ffmpeg, args, { encoding: 'utf8', windowsHide: true });
  if (p.status !== 0) throw new Error(`A/B file for at ${ex.at}: ${p.stderr.slice(0, 300)}`);
}
