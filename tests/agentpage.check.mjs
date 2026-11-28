/* Guard for the agent page flow (ui/agent.js, #350). Loads the real page script against a small fake DOM and a fake API.
 * Fails when
 *   - a fresh load (no stored key) needs a click before the player maker shows, or does not sign up by itself exactly once;
 *   - the maker lacks the one-line warning about the key, or the page still has a 「一鍵開始」 button or an 「先成為經紀人」 heading;
 *   - a browser that refuses storage, or a failed sign-up, shows the maker instead of the same messages as before;
 *   - a returning browser (key + player, or key + unknown to the server) goes anywhere but its player or the maker.
 * Usage: node tests/agentpage.check.mjs */
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [], bad = m => problems.push(m);

/* ---- a fake DOM: just enough for ui/agent.js (and the modules it imports) ---- */
class El {
  constructor(tag) { this.tag = tag; this.children = []; this.hidden = false; this.className = ''; this.dataset = {}; this.attrs = {}; this._text = ''; this.style = { setProperty() {} };
    this.classList = { toggle: (c, on) => { const s = new Set(this.className.split(' ').filter(Boolean)); (on ? s.add(c) : s.delete(c)); this.className = [...s].join(' '); }, add: c => this.classList.toggle(c, true), remove: c => this.classList.toggle(c, false) }; }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
  append(...n) { for (const c of n) this.children.push(typeof c === 'string' ? Object.assign(new El('#text'), { _text: c }) : c); }
  appendChild(c) { this.children.push(c); return c; }
  replaceChildren(...n) { this.children = []; this._text = ''; this.append(...n); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  addEventListener() {}
  all(test, out = []) { if (test(this)) out.push(this); for (const c of this.children) c.all?.(test, out); return out; }
}
const IDS = ['account', 'status', 'stage', 'stageCap', 'maker', 'mine', 'market', 'faList', 'faEmpty', 'faMore', 'sortBar'];
const page = () => Object.fromEntries(IDS.map(id => [id, Object.assign(new El('div'), { hidden: id !== 'status' })]));

/* one run of the page: `mode` says what the browser and the server do */
async function run({ key = null, storage = true, agent = 'ok', mine = null }) {
  const dom = page(), calls = [], store = new Map(); if (key) store.set('cloudball.agentKey', key);
  globalThis.document = { getElementById: id => dom[id], createElement: t => new El(t), querySelectorAll: () => [], addEventListener() {}, hidden: false, body: new El('body') };
  globalThis.window = { requestIdleCallback() {} };   /* the 3D preview never boots here */
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage
    ? { getItem: k => store.get(k) ?? null, setItem: (k, v) => void store.set(k, String(v)) }
    : { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } } });
  const reply = body => ({ status: 200, json: async () => body });
  globalThis.fetch = async (url, opt = {}) => {
    const method = opt.method || 'GET'; calls.push(`${method} ${url}`);
    if (url.startsWith('/api/freeagents')) return reply({ ok: true, players: [], more: false, page: 0 });
    if (url.startsWith('/api/agent/draw')) return reply({ ok: true, n: 0, cap: 5, name: '測試', taken: false });
    if (url === '/api/agent' && method === 'POST') return agent === 'ok' ? reply({ ok: true, new: true }) : { status: 429, json: async () => ({ ok: false, why: 'limit' }) };
    if (url === '/api/player' && method === 'GET') return mine === 'unknown' ? reply({ ok: false, why: 'unknown' }) : reply({ ok: true, player: mine });
    return reply({ ok: false, why: 'closed' });
  };
  await import(pathToFileURL(path.join(ROOT, `ui/agent.js`)).href + `?run=${Math.random()}`);
  for (let i = 0; i < 50; i++) await new Promise(r => setImmediate(r));   /* let start() and its calls settle */
  return { dom, calls, store };
}
const shown = dom => !dom.maker.hidden && dom.maker.children.length > 0;
const buttons = dom => dom.maker.all(e => e.tag === 'button').map(b => b.textContent);

/* 1. a fresh load: no click, one sign-up, the maker, the one-line warning */
{
  const r = await run({});
  if (!shown(r.dom)) bad('fresh load: the player maker must show without a click');
  if (r.calls.filter(c => c === 'POST /api/agent').length !== 1) bad(`fresh load: expected exactly one sign-up call, saw ${JSON.stringify(r.calls)}`);
  const key = r.store.get('cloudball.agentKey'); if (!/^[0-9a-f]{64}$/.test(key || '')) bad('fresh load: the new key must be stored (64 hex)');
  if (!r.dom.maker.textContent.includes('不用密碼') || !r.dom.maker.textContent.includes('清掉資料就找不回來')) bad('the maker must carry the one-line warning (no password, key lives in this browser)');
  if (r.dom.maker.textContent.includes('先成為經紀人') || buttons(r.dom).includes('一鍵開始')) bad('the maker must not show the old register heading or button');
  if (r.dom.status.textContent && !r.dom.status.hidden) bad(`fresh load: no status line expected once signed up, saw 「${r.dom.status.textContent}」`);
}
/* 2. storage refused: the same message as before, no maker, no sign-up call */
{
  const r = await run({ storage: false });
  if (shown(r.dom) || !r.dom.status.textContent.includes('不讓我們存資料') || !r.dom.status.classList || !r.dom.status.className.includes('err')) bad('refused storage: show the old message as an error, not the maker');
  if (r.calls.includes('POST /api/agent')) bad('refused storage: must not sign up');
}
/* 3. sign-up refused by the server: the old message, no maker */
{
  const r = await run({ agent: 'limit' });
  if (shown(r.dom) || !r.dom.status.textContent.includes('名額滿了')) bad('failed sign-up: show the server reason, not the maker');
}
/* 4. a returning browser: key and no player -> maker with no second sign-up; key unknown to the server -> signs up quietly with the same key; key and player -> the player */
{
  const key = 'ab'.repeat(32);
  const a = await run({ key, mine: null });
  if (!shown(a.dom) || a.calls.includes('POST /api/agent')) bad('returning browser without a player: maker, no sign-up');
  const b = await run({ key, mine: 'unknown' });
  if (!shown(b.dom) || b.calls.filter(c => c === 'POST /api/agent').length !== 1 || b.store.get('cloudball.agentKey') !== key) bad('key unknown to the server: sign up again with the same key, then the maker');
  const row = { id: 'fa-abc', kind: 'bat', player: { id: 'fa-abc', name: '老球員', num: 7, pos: 'SS', bats: 'R', age: 22, ht: 180, wt: 80 }, ratings: { con: 60, pow: 60, eye: 60, spd: 60, arm: 60, ovr: 60, pot: 70 } };
  const c = await run({ key, mine: row });
  if (shown(c.dom) || c.dom.mine.hidden) bad('returning browser with a player: show the player, not the maker');
  if (c.store.get('cloudball.myPlayerId') !== 'fa-abc') bad('#399: showing the player must store his id under cloudball.myPlayerId for the data site');
  if (a.store.has('cloudball.myPlayerId')) bad('#399: no player, no myPlayerId');
  /* #384: a created player's potential is hidden: no 潛力 row in the card, no pot in the compare rows */
  if (c.dom.mine.textContent.includes('潛力') || c.dom.mine.textContent.includes('70')) bad('#384: the created player card must not show 潛力 or the pot value');
  const { compareKeys } = await import(pathToFileURL(path.join(ROOT, 'ui/compare.js')).href);
  const hid = { kind: 'bat', hidePot: true }, pub = { kind: 'bat' };
  if (compareKeys(hid, pub).some(([k]) => k === 'pot') || compareKeys(pub, hid).some(([k]) => k === 'pot')) bad('#384: compare rows of a created player must not include pot');
  if (!compareKeys(pub, pub).some(([k]) => k === 'pot')) bad('compare rows of factory players still show pot (guide page)');
}
/* 5. the page itself: no register section left in the markup */
const html = readFileSync(path.join(ROOT, 'agent.html'), 'utf8');
if (/id="account"|一鍵開始/.test(html)) bad('agent.html: the register section is gone, nothing may point at it');

console.log(problems.length ? problems.map(p => 'FAIL ' + p).join('\n') : 'OK agent page flow (fresh load reaches the maker without a click, 4 browser states)');
process.exit(problems.length ? 1 : 0);
