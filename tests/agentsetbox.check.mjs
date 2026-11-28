/* Guard for the 經紀人 box (ui/agentset-box.js, #795 part 5). Runs the real module against a small fake DOM and a fake API.
 * Fails when
 *   - a step can leave LEVEL_MIN..LEVEL_MAX or the points pool, or a raise is allowed with no points left;
 *   - a step on a row other than 一般 does not set that row only, or a step on 一般 does not move the rows that follow it;
 *   - the box does not draw 4 situations x 3 frequencies of the player's kind after GET /api/player/agentset;
 *   - an edit is not kept as a local draft, a reload does not restore it, or the draft is POSTed before 儲存 is pressed;
 *   - 儲存 does not POST a valid canonical set, or a closed / limited answer is not shown.
 * Usage: node tests/agentsetbox.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [], bad = m => problems.push(m);
const A = await import(pathToFileURL(path.join(ROOT, 'league/agentset.js')).href);
const B = await import(pathToFileURL(path.join(ROOT, 'ui/agentset-box.js')).href);

/* ---- pure steps ---- */
for (const kind of A.KINDS) {
  const d = A.defaultSet(kind), [s0, s1] = A.SITUATIONS[kind], [f0, f1] = A.FREQS[kind];
  if (B.stepCell(d, s0, f0, 1) !== null) bad(`${kind}: a raise on the all-neutral grid (no points left) was allowed`);
  const cut = B.stepCell(d, s1, f0, -1);
  if (!cut || A.levelOf(cut, s1, f0) !== A.LEVEL_NEUTRAL - 1 || A.levelOf(cut, s0, f0) !== A.LEVEL_NEUTRAL) bad(`${kind}: a cut on ${s1} did not change ${s1} only`);
  if (cut && A.pointsLeft(cut) !== 1) bad(`${kind}: a cut did not free one point`);
  const raise = cut && B.stepCell(cut, s1, f1, 1);
  if (!raise || A.validateSet(raise).length || A.pointsLeft(raise) !== 0) bad(`${kind}: the freed point could not be spent elsewhere`);
  const normalCut = B.stepCell(d, s0, f0, -1);
  if (!normalCut || A.SITUATIONS[kind].some(s => A.levelOf(normalCut, s, f0) !== A.LEVEL_NEUTRAL - 1)) bad(`${kind}: a cut on 一般 did not move the rows that follow it`);
  let low = d; for (let i = 0; i < A.LEVEL_NEUTRAL; i++) low = B.stepCell(low, s1, f0, -1);
  if (!low || B.stepCell(low, s1, f0, -1) !== null) bad(`${kind}: a step below LEVEL_MIN was allowed`);
  let high = low; for (let i = 0; high && i < A.LEVEL_MAX - A.LEVEL_NEUTRAL; i++) high = B.stepCell(high, s1, f1, 1);
  if (high && A.LEVEL_MAX - A.LEVEL_NEUTRAL <= A.LEVEL_NEUTRAL && B.stepCell(high, s1, f1, 1) !== null) bad(`${kind}: a step above LEVEL_MAX was allowed`);
}
if (B.LEVEL_WORDS.length !== A.LEVEL_MAX - A.LEVEL_MIN + 1) bad('LEVEL_WORDS does not name every level');

/* ---- fake DOM ---- */
class El {
  constructor(tag) { this.tag = tag; this.children = []; this.className = ''; this.dataset = {}; this.attrs = {}; this._text = ''; this.disabled = false;
    this.classList = { add: c => { if (!this.className.split(' ').includes(c)) this.className = (this.className + ' ' + c).trim(); }, remove: c => { this.className = this.className.split(' ').filter(x => x && x !== c).join(' '); } }; }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
  append(...n) { for (const c of n) this.children.push(c); }
  appendChild(c) { this.children.push(c); return c; }
  replaceChildren(...n) { this.children = []; this.append(...n); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  all(test, out = []) { if (test(this)) out.push(this); for (const c of this.children) c.all(test, out); return out; }
}
globalThis.document = { createElement: t => new El(t) };
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise(r => setImmediate(r)); };
const memStore = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: k => void m.delete(k), m }; };
const isClosed = r => !r.body || r.status === 0 || r.body.why === 'closed';

async function mount({ kind = 'pit', storage = memStore(), get = 'ok', post = 'ok', stored = null }) {
  const calls = [];
  const api = async (url, { method = 'GET', body } = {}) => {
    calls.push({ method, url, body });
    if (method === 'GET') return get === 'ok' ? { status: 200, body: { ok: true, kind, set: stored || A.defaultSet(kind), pool: A.AGENT_POOL[kind] } } : { status: 404, body: { ok: false, why: 'closed' } };
    if (post === 'limit') return { status: 429, body: { ok: false, why: 'limit' } };
    if (A.validateSet(body.set).length) return { status: 400, body: { ok: false, why: 'invalid' } };
    return { status: 200, body: { ok: true, kind, set: A.freezeSet(body.set), saved: true } };
  };
  const box = B.agentSetBox({ api, key: 'k', pid: 7, kind, storage, isClosed });
  await settle();
  return { box, calls, storage };
}
const cell = (box, id) => box.all(e => e.dataset.cell === id)[0];
const btn = (box, text) => box.all(e => e.tag === 'button' && e.textContent === text)[0];

/* drawn grid */
for (const kind of A.KINDS) {
  const { box } = await mount({ kind });
  const cells = box.all(e => e.dataset.cell);
  if (cells.length !== A.SITUATIONS[kind].length * A.FREQS[kind].length) bad(`${kind}: ${cells.length} cells drawn, want ${A.SITUATIONS[kind].length * A.FREQS[kind].length}`);
  if (!A.SITUATIONS[kind].every(s => box.textContent.includes(A.LABELS[s])) || !A.FREQS[kind].every(f => box.textContent.includes(A.LABELS[f]))) bad(`${kind}: a situation or frequency label is missing`);
  if (!box.textContent.includes(`剩 0 點`)) bad(`${kind}: the default grid does not show 0 points left`);
}

/* draft, reload, save */
{
  const kind = 'pit', [, s1] = A.SITUATIONS[kind], [f0, f1] = A.FREQS[kind];
  const { box, calls, storage } = await mount({ kind });
  const [minus] = cell(box, `${s1}.${f0}`).children; minus.onclick();
  if (!box.textContent.includes('剩 1 點')) bad('a cut does not show 1 point left');
  const plus = cell(box, `${s1}.${f1}`).children[2]; if (plus.disabled) bad('with a point left, + is still disabled'); plus.onclick();
  if (calls.some(c => c.method === 'POST')) bad('an edit was POSTed before 儲存');
  const draft = B.readDraft(storage, 7, kind);
  if (!draft || A.levelOf(draft, s1, f0) !== A.LEVEL_NEUTRAL - 1 || A.levelOf(draft, s1, f1) !== A.LEVEL_NEUTRAL + 1) bad('the edit was not kept as a local draft');
  const again = await mount({ kind, storage });
  if (!again.box.textContent.includes('草稿')) bad('a reload with an unsaved draft does not say so');
  const lv = cell(again.box, `${s1}.${f1}`).children[1].textContent;
  if (lv !== B.LEVEL_WORDS[A.LEVEL_NEUTRAL + 1]) bad(`a reload shows ${lv}, not the draft level`);
  await btn(again.box, '儲存').onclick(); await settle();
  const sent = again.calls.find(c => c.method === 'POST');
  if (!sent || sent.url !== '/api/player/agentset' || A.validateSet(sent.body.set).length || JSON.stringify(sent.body.set) !== JSON.stringify(A.freezeSet(sent.body.set))) bad('儲存 did not POST a valid canonical set');
  if (B.readDraft(storage, 7, kind)) bad('the draft stays after a save');
  if (!btn(again.box, '已儲存')) bad('after a save the button does not say 已儲存');
}

/* closed and limited */
{
  const { box } = await mount({ get: 'closed' });
  if (!box.textContent.includes('還沒開放') || box.all(e => e.dataset.cell).length) bad('a closed API still draws the grid');
  const lim = await mount({ post: 'limit' });
  cell(lim.box, `${A.SITUATIONS.pit[1]}.${A.FREQS.pit[0]}`).children[0].onclick();
  await btn(lim.box, '儲存').onclick(); await settle();
  if (!lim.box.textContent.includes('儲存次數用完')) bad('a 429 limit is not shown');
}

if (problems.length) { console.error('agentsetbox check FAILED:\n- ' + problems.join('\n- ')); process.exit(1); }
console.log('agentsetbox check ok');
