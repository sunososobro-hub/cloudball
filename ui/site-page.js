/* Text-first data site (#335): tabs in the URL hash, data fetched from league/site/*.json, drawn by ui/site-data.js.
 * A missing or broken file is an empty list (the views have empty states), never an error screen. */
import { DATA_FILES, MY_PLAYER_KEY, TABS, combine, mergeCreated, render, seasonLabel } from './site-data.js';
import { TRAIN_FILE, mountTrain } from './site/train.js';
const $ = id => document.getElementById(id);
const get = async url => { try { const r = await fetch(url, { cache: 'no-cache' }); return r.ok ? await r.json() : null; } catch (e) { return null; } };
let myId = ''; try { myId = localStorage.getItem(MY_PLAYER_KEY) || ''; } catch (e) { /* storage blocked: no player yet */ }
const parts = () => location.hash.slice(1).split('/').map(decodeURIComponent);
const tabOf = () => { const h = parts()[0]; return TABS.some(t => t[0] === h) ? h : TABS[0][0]; };
let data = combine({}), trainTable = null;
const store = { load: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, save: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked: the split is kept for this page only */ } } };
function draw() {
  const tab = tabOf();
  $('tabs').innerHTML = TABS.map(([k, label]) => `<a role="tab" href="#${k}" aria-selected="${k === tab}">${label}</a>`).join('');
  $('view').innerHTML = render(tab, data, myId, ...parts().slice(1));
  $('season').innerHTML = seasonLabel(data);
  const root = $('train-root'); /* #me/train (#429) */
  if (root && data.players[myId]) mountTrain(root, { doc: document, player: data.players[myId], id: myId, table: trainTable, ...store, go: url => { location.href = url; } });
}
/* 換球員 / 解約 (#435): one POST with the browser's agent key; the player id is kept so the former agent can 取回 him on agent.html */
const AGENT_KEY = 'cloudball.agentKey', RELEASED_KEY = 'cloudball.releasedIds';
const WHY = { none: '你目前沒有球員。', key: '帳號資料不對。', unknown: '伺服器找不到這個帳號。' };
async function releaseMine(act, msg) {
  let key = null; try { key = localStorage.getItem(AGENT_KEY); } catch (e) { /* storage blocked */ }
  const say = t => { msg.textContent = t; msg.hidden = !t; };
  if (!key) return say('這個瀏覽器沒有你的帳號鑰匙。');
  let r; try { const res = await fetch('/api/player/release', { method: 'POST', headers: { authorization: `Bearer ${key}` }, cache: 'no-store' }); r = { s: res.status, b: await res.json().catch(() => null) }; } catch (e) { r = { s: 0, b: null }; }
  if (!r.b || !r.b.ok) return say(r.b && WHY[r.b.why] || '還沒開放，或現在連不上。');
  try {
    const old = JSON.parse(localStorage.getItem(RELEASED_KEY) || '[]'); localStorage.setItem(RELEASED_KEY, JSON.stringify([...old.filter(x => x !== r.b.released), r.b.released].slice(-20)));
    localStorage.removeItem(MY_PLAYER_KEY);
  } catch (e) { /* storage blocked: no 取回 button later */ }
  myId = '';
  if (act === 'switch') location.href = 'agent.html'; else draw();
}
$('view').addEventListener('click', e => { const b = e.target.closest && e.target.closest('button[data-act]'); return b ? releaseMine(b.dataset.act, $('view').querySelector('.switch-msg')) : undefined; });
addEventListener('hashchange', draw);
draw();
/* created players (#399): the D1 list, a few pages at most; no answer (closed, offline, no API on this host) = no rows, no error screen */
const FA_PAGES = 5;
async function created() { const rows = []; for (let pg = 0; pg < FA_PAGES; pg++) { const r = await get(`/api/freeagents?sort=new&page=${pg}`); if (!r || !r.ok || !Array.isArray(r.players)) break; rows.push(...r.players); if (!r.more) break; } return rows; }
Promise.all([...Object.values(DATA_FILES).map(get), created(), get(TRAIN_FILE)]).then(([teams, players, games, rows, train]) => { data = mergeCreated(combine({ teams, players, games }), rows); trainTable = train; draw(); });
