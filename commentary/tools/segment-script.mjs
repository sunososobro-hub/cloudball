/* Cut a per-game script into reusable segments, so voice clips can be made once and recombined.
 *
 * A line becomes a list of segments:
 *   text   fixed words ("三局上結束")          -> one clip, reusable in every game that says it
 *   team   a team name, as a role              -> away / home, full or short name; swap the team, keep the clip set
 *   player a player name                       -> one clip per player
 *   score  "1比0"                              -> one clip per score
 *   pause  a punctuation mark, kept as a pause -> no clip, only silence (weak , 、 … ; strong 。！？)
 * Joining the segments gives back the original text exactly; the tool checks that for every line.
 *
 * Usage: node commentary/tools/segment-script.mjs commentary/scripts/<name>.json <out dir>
 * Writes <name>.segments.json (for programs), <name>.segments.md (to read) and <name>.clips.tsv
 * (the clips to generate: speaker, emotion, kind, text, uses). */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { simGame, TEAMS, ROSTERS } from '../../engine/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WEAK = new Set(['，', '、', '；', '：']), STRONG = new Set(['。', '！', '？']);
const SCORE = /\d+比\d+/;

const [file, outDir] = process.argv.slice(2);
if (!file || !outDir) { console.error('usage: node commentary/tools/segment-script.mjs <script.json> <out dir>'); process.exit(2); }
const script = JSON.parse(readFileSync(file, 'utf8'));
const bank = JSON.parse(readFileSync(path.join(ROOT, 'commentary/lines.json'), 'utf8'));
const g = simGame(script.seed, {}), teams = g.teams.map(i => TEAMS[i]);
const SPEAKER = { pbp: '游振宇', color: '周國棟', fan: ((bank.guests || {})[script.guest] || {}).name || '來賓' };

/* every name the script may say, longest first so a full name wins over a short one */
const roles = ['away', 'home'], entities = new Map();
teams.forEach((t, i) => { entities.set(t.name, { kind: 'team', role: roles[i], form: 'name' }); entities.set(t.short, { kind: 'team', role: roles[i], form: 'short' }); });
g.teams.forEach((id, i) => { for (const p of [...ROSTERS[id].bat, ...ROSTERS[id].pit]) entities.set(p.name, { kind: 'player', side: roles[i] }); });
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pattern = new RegExp(`(${[...entities.keys()].sort((a, b) => b.length - a.length).map(esc).join('|')}|${SCORE.source})`);

/* plain words into text and pause segments */
function wordsToSegments(s) {
  const out = []; let buf = '';
  const flush = () => { if (buf) out.push({ t: 'text', v: buf }); buf = ''; };
  for (const ch of s) {
    if (WEAK.has(ch) || STRONG.has(ch)) { flush(); out.push({ t: 'pause', v: ch, strength: STRONG.has(ch) ? 'strong' : 'weak' }); } else buf += ch;
  }
  flush(); return out;
}
function segment(text) {
  const segs = [];
  for (const part of text.split(pattern)) {
    if (!part) continue;
    const e = entities.get(part);
    if (e) segs.push({ t: e.kind, v: part, ...(e.kind === 'team' ? { role: e.role, form: e.form } : { side: e.side }) });
    else if (SCORE.test(part) && part.match(SCORE)[0] === part) segs.push({ t: 'score', v: part });
    else segs.push(...wordsToSegments(part));
  }
  return segs;
}

const lines = script.lines.map((l, n) => ({ n, at: l.at, speaker: l.speaker, emotion: l.emotion || '', segments: segment(l.text), text: l.text }));
let bad = 0; for (const l of lines) if (l.segments.map(s => s.v).join('') !== l.text) { bad++; console.error('round trip failed:', l.n, l.text); }
if (bad) process.exit(1);

/* readable form: ｜ between segments, 〔隊／球員／比數〕 around slots, ‧ for a pause */
const show = s => s.t === 'team' ? `〔隊:${s.role === 'away' ? '客' : '主'}${s.form === 'name' ? '全名' : '簡稱'}=${s.v}〕` : s.t === 'player' ? `〔球員=${s.v}〕` : s.t === 'score' ? `〔比數=${s.v}〕` : s.t === 'pause' ? `‧${s.v}` : s.v;
const stream = g.stream; let inn = 0, half = 0; const where = stream.map(e => { if (e.type === 'half_start') { inn = e.inning; half = e.half; } return inn ? `${inn}局${half ? '下' : '上'}` : '賽前'; });
const ordered = [...lines].sort((a, b) => (stream[a.at].t + (script.lines[a.n].delay || 0)) - (stream[b.at].t + (script.lines[b.n].delay || 0)) || a.n - b.n);
let md = `# ${path.basename(file, '.json')} 分段講稿（seed ${script.seed}，${lines.length} 句）\n\n記號：｜ = 分段（每段一個語音檔）；〔隊:客簡稱=帝雉〕 = 隊名欄位，換隊只換這格；〔球員=…〕 = 球員欄位；〔比數=…〕 = 比數欄位；‧， ‧。 = 停頓（不用生成語音）。\n`, cur = '';
for (const l of ordered) { const w = where[l.at]; if (w !== cur) { md += `\n## ${w}\n`; cur = w; } md += `- ${SPEAKER[l.speaker]}：${l.segments.map(show).join('｜').replace(/｜‧/g, '‧').replace(/‧([，。！？、；：])｜/g, '‧$1｜')}\n`; }

/* the clips to generate: one per (speaker, emotion, kind, text) */
const clips = new Map();
for (const l of lines) for (const s of l.segments) { if (s.t === 'pause') continue; const k = [l.speaker, l.emotion, s.t, s.v].join('\t'); clips.set(k, (clips.get(k) || 0) + 1); }
const KIND = { text: '固定句', team: '隊名', player: '球員', score: '比數' };
const tsv = 'speaker\temotion\tkind\ttext\tuses\n' + [...clips].sort((a, b) => b[1] - a[1]).map(([k, n]) => { const [sp, em, kind, text] = k.split('\t'); return [SPEAKER[sp], em, KIND[kind], text, n].join('\t'); }).join('\n') + '\n';

mkdirSync(outDir, { recursive: true });
const base = path.join(outDir, path.basename(file, '.json'));
writeFileSync(base + '.segments.json', JSON.stringify({ seed: script.seed, lines: lines.map(({ text, ...l }) => l) }, null, 1) + '\n');
writeFileSync(base + '.segments.md', md); writeFileSync(base + '.clips.tsv', tsv);
const by = {}; for (const k of clips.keys()) { const kind = k.split('\t')[2]; by[kind] = (by[kind] || 0) + 1; }
console.log(`${lines.length} lines, all round-trip OK; clips to generate: ${clips.size} (${Object.entries(by).map(([k, v]) => `${KIND[k]} ${v}`).join(', ')})`);
