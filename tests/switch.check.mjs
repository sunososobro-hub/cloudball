/* #435 part 2: 我的球員 has 換球員 / 解約 and the warning; the click calls POST /api/player/release with the stored key, forgets
 * the player, remembers his id for 取回, and 換球員 then goes to agent.html. Fake DOM, fake fetch, fake storage. Usage: node tests/switch.check.mjs */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { view, SWITCH_WARN } from '../ui/site/me.js';
const bad = []; const t = (c, m) => { if (!c) bad.push(m); };
const d = { teams: {}, players: { p1: { name: 'X', tier: 3, team: null, overall: 50, age: 20 } } };
const html = view(d, 'p1');
t(html.includes('data-act="switch"') && html.includes('>換球員<'), 'no 換球員 button'); t(html.includes('data-act="release"') && html.includes('>解約<'), 'no 解約 button');
t(html.includes(SWITCH_WARN.slice(0, 8)), 'no warning'); t(!view(d, '').includes('data-act'), 'buttons shown with no player');
/* the page script under fakes */
const store = { 'cloudball.agentKey': 'KEY', 'cloudball.myPlayerId': 'p1' }, calls = []; let handler = null, loc = { hash: '', href: '' };
const els = {}; const elOf = id => els[id] || (els[id] = { innerHTML: '', textContent: '', hidden: true, addEventListener(ev, f) { if (ev === 'click') handler = f; }, querySelector: () => msg });
const msg = { textContent: '', hidden: true };
const src = readFileSync(new URL('../ui/site-page.js', import.meta.url), 'utf8').replace(/^import .*$/gm, '').replace(/^/, "const TRAIN_FILE = '', mountTrain = () => {}, DATA_FILES = {}, MY_PLAYER_KEY = 'cloudball.myPlayerId', TABS = [['me', 'x']], combine = () => ({ players: {} }), mergeCreated = d => d, render = () => '', seasonLabel = () => '';");
const ctx = { document: { getElementById: elOf }, localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } },
  location: loc, addEventListener() {}, JSON, Promise, Object, Array, console,
  fetch: async (u, o = {}) => { calls.push([u, o.method, o.headers && o.headers.authorization]); return u.startsWith('/api/player/release') ? { status: 200, json: async () => ({ ok: true, released: 'p1' }) } : { ok: false, json: async () => null }; } };
vm.runInNewContext(src.replace(/Promise\.all\(\[[\s\S]*$/, ''), ctx);
const btn = act => ({ target: { closest: () => ({ dataset: { act } }) } });
await handler(btn('switch'));
t(calls.some(c => c[0] === '/api/player/release' && c[1] === 'POST' && c[2] === 'Bearer KEY'), 'release not posted with the key');
t(store['cloudball.myPlayerId'] === undefined, 'my player id not cleared'); t(JSON.parse(store['cloudball.releasedIds']).includes('p1'), 'released id not remembered');
t(loc.href === 'agent.html', '換球員 does not open agent.html');
if (bad.length) { console.error('switch.check FAIL:\n- ' + bad.join('\n- ')); process.exit(1); }
console.log('switch.check OK');
