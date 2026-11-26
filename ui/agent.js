/* Fan agent page (agent.html, #179): sign up silently on load (#350), draw a name, choose, spend the points, create one player, see the
 * free-agent list. No free text anywhere: every choice is a button, a chip or a slider, and the server judges it again.
 * The account is a random 32-byte key kept in localStorage; the server stores only its SHA-256 (functions/lib/agents.js).
 * Every call that is not answered ok (no binding, production, offline, a static server) reads as 「還沒開放」. */
import { CREATE, validateCreate, pointKeys, budgetOf, positionFit, presetBody, presetHt } from '../league/freeagents.js';
import { makePreview } from './agent-preview.js';
import { ratingRow } from './bars.js';
import { attachCompare } from './compare.js';
import { specOfChoice, specOfRow } from './preview-spec.js';
import { needsOf, slotLine, abilityTag, compareLine, RBI_NOTE, WORD } from '../league/needs.js';

const KEY_NAME = 'cloudball.agentKey';
const POS = { C: '捕手', '1B': '一壘手', '2B': '二壘手', '3B': '三壘手', SS: '游擊手', LF: '左外野', CF: '中外野', RF: '右外野', DH: '指定打擊' };
const ROLE = { SP: '先發投手', MR: '中繼投手', RP: '後援投手', CL: '終結投手' };
const HAND = { L: '左', R: '右' };
const BODY = { slim: '精瘦', power: '力量', heavy: '壯碩' };
const BUILD = { normal: '標準', slim: '精瘦', power: '力量型', heavy: '壯碩' };
const BAT_RATINGS = { con: '打擊', pow: '長打', eye: '選球', spd: '速度', arm: '傳球', def: '守備' };
const PIT_RATINGS = { stuff: '球威', ctrl: '控球', arm: '臂力' };
const KIND = { bat: '打者', pit: '投手' };
const WHY = { limit: '今天的新帳號名額滿了，明天再來。', already: '你已經有一位球員了。', name: '這個名字剛被別人用掉，換一個。', invalid: '選項有誤，請重新選。', key: '帳號資料不對。', unknown: '伺服器找不到這個帳號。' };

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const store = {
  get() { try { return localStorage.getItem(KEY_NAME); } catch (e) { return null; } },
  set(v) { try { localStorage.setItem(KEY_NAME, v); return localStorage.getItem(KEY_NAME) === v; } catch (e) { return false; } },
};
const newKey = () => [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('');

/* one call: { status, body }; status 0 = no answer; anything but a JSON body reads as closed */
async function api(path, { method = 'GET', body, key } = {}) {
  try {
    const headers = {}; if (key) headers.authorization = `Bearer ${key}`; if (body) headers['content-type'] = 'application/json';
    const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    const json = await res.json().catch(() => null);
    return { status: res.status, body: json && typeof json === 'object' ? json : null };
  } catch (e) { return { status: 0, body: null }; }
}
const isClosed = r => !r.body || r.status === 0 || r.status === 404 || r.status === 405 || r.status === 501 || r.body.why === 'closed';
/* the live preview (#189): sticky box at the top; it shows the choice being made, or a player picked from a list */
const preview = makePreview($('stage'));
const showPreview = (spec, caption) => { $('stage').hidden = false; $('stageCap').textContent = caption; preview.show(spec); };
const say = (text, err) => { const s = $('status'); s.textContent = text; s.hidden = !text; s.classList.toggle('err', !!err); };

/* ---- team needs (#431): display only, read once from the data site's roster file; no answer = no needs lines ---- */
const rosterData = (async () => {
  try { const r = await fetch('league/site/players.json'), j = await r.json(), needs = needsOf(j); return needs.teams.length ? { players: j, needs } : null; } catch (e) { return null; }
})();

/* ---- player rows (same look as the guide page) ---- */
function playerRow(row) {
  const p = row.player, R = row.ratings, pit = row.kind === 'pit', li = el('li', 'p'), who = el('div', 'who'), r = el('dl', 'r');
  const meta = pit ? `${ROLE[p.role] || p.role}・${HAND[p.throws] || ''}投` : `${POS[p.pos] || p.pos}・${HAND[p.hand] || ''}打`;
  who.append(el('b', null, p.name), el('span', 'no num', `#${p.num}`), el('span', null, meta), el('span', null, `${p.age} 歲`));
  r.appendChild(ratingRow('綜合', R.ovr, 'ovr'));
  for (const [k, label] of Object.entries(pit ? PIT_RATINGS : BAT_RATINGS)) if (R[k] !== undefined) r.appendChild(ratingRow(label, R[k]));
  if (!pit) who.appendChild(el('span', 'fit', `守位適性：${positionFit(p.pos, R)}`));
  const see = el('button', 'see', '看他'); see.type = 'button'; see.setAttribute('aria-label', `看 ${p.name} 的樣子`); who.appendChild(see);
  li.onclick = () => { for (const o of document.querySelectorAll('li.p[aria-current]')) o.removeAttribute('aria-current'); li.setAttribute('aria-current', 'true'); showPreview(specOfRow(row), `${p.name} #${p.num}`); };
  li.append(who, r);
  attachCompare(li, { id: `fa:${p.id ?? p.name}`, name: p.name, num: p.num, meta, kind: row.kind, R: { ...R, pot: undefined }, hidePot: true });/* #384: potential is hidden for created players */
  return li;
}

/* ---- free-agent list ---- */
const list = { sort: 'ovr', page: 0 };
async function loadList(reset) {
  if (reset) { list.page = 0; $('faList').replaceChildren(); }
  const r = await api(`/api/freeagents?sort=${list.sort}&page=${list.page}`);
  if (!r.body || !r.body.ok) { if (!isClosed(r)) say('名單暫時讀不到。', true); return r; }
  for (const row of r.body.players) $('faList').appendChild(playerRow(row));
  $('faEmpty').hidden = $('faList').children.length > 0;
  $('faMore').hidden = !r.body.more; list.page = r.body.page + 1;
  return r;
}
function buildSortBar() {
  const bar = $('sortBar'); bar.replaceChildren();
  for (const [sort, label] of [['ovr', '綜合最高'], ['con', '打擊'], ['pow', '長打'], ['eye', '選球'], ['spd', '速度'], ['arm', '臂力'], ['stuff', '球威'], ['ctrl', '控球'], ['new', '最新']]) {
    const b = el('button', null, label); b.type = 'button'; b.setAttribute('aria-pressed', String(list.sort === sort));
    b.onclick = () => { list.sort = sort; buildSortBar(); loadList(true); }; bar.appendChild(b);
  }
}

/* ---- your player ---- */
function showMine(row) {
  const pid = row.id ?? (row.player && row.player.id); try { if (pid != null) localStorage.setItem('cloudball.myPlayerId', String(pid)); } catch (e) { /* storage blocked: the data site cannot find him */ }  /* #399: the data site's 我的球員 looks him up by this id */
  const s = $('mine'); s.replaceChildren(el('h2', null, '你的球員'));
  const ul = el('ul', 'roster me'); ul.appendChild(playerRow(row)); s.append(ul, el('p', 'left', '每個人只能有一位。之後經紀人要怎麼幫他，等開放再說。'));
  s.hidden = false; $('maker').hidden = true; showPreview(specOfRow(row), `${row.player.name} #${row.player.num}`);
  if (list.page) loadList(true);
}

/* ---- the maker ---- */
function chipGroup(legend, options, current, onPick, cls) {
  const f = el('fieldset', 'field'), box = el('div', 'chips' + (cls ? ' ' + cls : '')); f.appendChild(el('legend', null, legend));
  const set = v => { for (const b of box.children) b.setAttribute('aria-pressed', String(b.dataset.v === String(v))); };
  for (const [v, label] of options) { const b = el('button', 'chip', label); b.type = 'button'; b.dataset.v = String(v); b.onclick = () => { set(v); onPick(v); }; box.appendChild(b); }
  set(current); f.appendChild(box); return f;
}
/* a batter always gets the defence slider (#378 part 6): his points hold def, so the pool is budget + defBudget */
const evenPoints = kind => { const c = { kind, points: kind === 'bat' ? { [CREATE.defKey]: 0 } : {} }, keys = pointKeys(c);
  return Object.fromEntries(keys.map(k => [k, budgetOf(c) / keys.length])); };
const defaults = kind => ({ kind, [kind === 'bat' ? 'pos' : 'role']: kind === 'bat' ? 'SS' : 'SP', [kind === 'bat' ? 'bats' : 'throws']: 'R', body: presetBody('normal'), ht: presetHt('normal'),
  look: { head: 0, skin: 0, hair: 0 }, points: evenPoints(kind) });

function buildMaker(key, state) {
  const s = $('maker'); s.replaceChildren(el('h2', null, '建立你的球員'));
  const draw = { n: 0, name: '', busy: false };
  const form = el('div'), nameBox = el('div', 'namebox'), nameText = el('b', null, '…'), again = el('button', 'btn ghost', '換一個名字');
  again.type = 'button'; nameBox.append(nameText, again);
  const nameField = el('fieldset', 'field'); nameField.append(el('legend', null, '名字（抽的，不能自己取）'), nameBox);
  const left = el('p', 'left'), make = el('button', 'btn', '建立球員'); make.type = 'button';
  const msg = el('p', 'status'); msg.setAttribute('role', 'status');
  const fit = el('p', 'left fit'), slotNeed = el('p', 'left need'), cmp = $('stageNeed') || el('p', 'left need'), tags = {};
  let data = null; rosterData.then(d => { data = d; showNeeds(); });
  const showNeeds = () => {   /* the same state the form posts; nothing here is sent anywhere */
    if (!data) return;
    const slot = state.kind === 'bat' ? state.pos : state.role;
    slotNeed.textContent = slotLine(data.needs, slot);
    for (const [k, t] of Object.entries(tags)) t.textContent = abilityTag(data.needs, k);
    cmp.textContent = compareLine(data.players, state); cmp.hidden = false;
  };
  const choice = () => ({ ...state, nameDraw: draw.n });
  const look = () => showPreview(specOfChoice(choice()), draw.name ? `${draw.name}（還沒建立）` : '你正在捏的球員');   /* the same object that is posted */
  const refresh = () => {
    const keys = pointKeys(state), free = budgetOf(state) - keys.reduce((t, k) => t + state.points[k], 0);
    left.textContent = free ? `還有 ${free} 點沒分配。分完才能建立。` : '點數分配完了。'; left.classList.toggle('ok', !free);
    if (state.kind === 'bat') fit.textContent = `守位適性：${positionFit(state.pos, { def: state.points.def, arm: state.points.arm })}`;   /* display points = his ratings (freeagents.check) */
    make.disabled = !!validateCreate(choice()).length || !draw.name || draw.busy;
    showNeeds();
  };
  const edit = fn => v => { fn(v); look(); };   /* every pick that can change the body redraws it at once */
  /* the draw: the server knows the seed; a name already taken is skipped by drawing on, up to the cap */
  const drawName = async n => {
    draw.busy = true; again.disabled = true; refresh();
    for (; n <= CREATE.maxNameDraw; n++) {
      const r = await api(`/api/agent/draw?n=${n}`, { key });
      if (!r.body || !r.body.ok) { msg.textContent = r.body && r.body.why === 'cap' ? '名字換不動了，就用這個吧。' : '抽不到名字，等一下再試。'; break; }
      draw.n = r.body.n; draw.cap = r.body.cap;
      if (!r.body.taken) { draw.name = r.body.name; break; }
    }
    nameText.textContent = draw.name || '…'; draw.busy = false; look();
    again.disabled = draw.n >= (draw.cap ?? 0); again.textContent = `換一個名字（還能換 ${Math.max(0, (draw.cap ?? 0) - draw.n)} 次）`; refresh();
  };
  again.onclick = () => drawName(draw.n + 1);

  const kindRow = chipGroup('位置類型', Object.entries(KIND), state.kind, v => { for (const k of Object.keys(state)) delete state[k]; Object.assign(state, defaults(v)); buildFields(); refresh(); look(); });
  const fields = el('div');
  /* #442: body mix (whole percents, sum <= CREATE.bodyMax) and height (whole cm) sliders; presets above fill them */
  function bodyFields() {
    const box = el('fieldset', 'field'), grid = el('div', 'pts'), keys = CREATE.bodyKeys, [lo, hi] = CREATE.htRange.map(h => Math.round(h * 100));
    box.appendChild(el('legend', null, `身形（瘦、壯、重加起來不超過 ${CREATE.bodyMax}%，身高 ${lo} 到 ${hi} 公分）`));
    const slider = (label, min, max, value, aria, onset, unit) => {
      const row = el('div', 'pt'), input = el('input'), out = el('output', 'num', value + unit);
      input.type = 'range'; input.min = min; input.max = max; input.step = 1; input.value = value; input.setAttribute('aria-label', aria);
      input.oninput = () => { const v = onset(Number(input.value)); input.value = v; out.textContent = v + unit; look(); refresh(); };
      row.append(el('span', null, label), input, out); grid.appendChild(row);
    };
    for (const k of keys) slider(BODY[k], 0, CREATE.bodyMax, state.body[k], BODY[k], v => {   /* stops where the other two leave room */
      const others = keys.reduce((t, o) => t + (o === k ? 0 : state.body[o]), 0); return (state.body[k] = Math.min(v, CREATE.bodyMax - others)); }, '%');
    slider('身高', lo, hi, Math.round(state.ht * 100), '身高（公分）', v => { state.ht = v / 100; return v; }, ' cm');
    box.appendChild(grid); return box;
  }
  function buildFields() {
    const bat = state.kind === 'bat'; fields.replaceChildren(); for (const k of Object.keys(tags)) delete tags[k];
    kindRow.querySelectorAll('.chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === state.kind)));
    fields.append(
      chipGroup(bat ? '守備位置' : '投手角色', Object.entries(bat ? POS : ROLE).filter(([v]) => (bat ? CREATE.positions : CREATE.roles).includes(v)), bat ? state.pos : state.role, edit(v => { state[bat ? 'pos' : 'role'] = v; refresh(); })),
      slotNeed,
      chipGroup(bat ? '打擊方向' : '投球方向', CREATE.hands.map(h => [h, HAND[h]]), bat ? state.bats : state.throws, edit(v => { state[bat ? 'bats' : 'throws'] = v; })),
      chipGroup('體型預設', Object.keys(CREATE.builds).map(b => [b, BUILD[b]]), null, v => { state.body = presetBody(v); state.ht = presetHt(v); buildFields(); refresh(); look(); }),
      bodyFields());
    /* 外觀 chips (head, skin, hair) are hidden until #151 lands a real look mapping: they draw nothing yet. `state.look` keeps its defaults (0) so the posted choice is unchanged. */
    const pts = el('fieldset', 'field'), grid = el('div', 'pts'), cap = CREATE.cap[state.kind], budget = budgetOf(state), keys = pointKeys(state);
    pts.appendChild(el('legend', null, `能力點數（共 ${budget} 點，每項 ${CREATE.floor} 到 ${cap}）`));
    for (const k of keys) {
      const row = el('div', 'pt'), input = el('input'), out = el('output', 'num', state.points[k]);
      input.type = 'range'; input.min = CREATE.floor; input.max = cap; input.step = 1; input.value = state.points[k]; input.setAttribute('aria-label', (bat ? BAT_RATINGS : PIT_RATINGS)[k]);
      input.oninput = () => {   /* cannot go over the budget: it stops where the other abilities leave room */
        const others = keys.reduce((t, o) => t + (o === k ? 0 : state.points[o]), 0);
        const v = Math.min(Number(input.value), cap, budget - others); input.value = v; state.points[k] = v; out.textContent = v; refresh();
      };
      row.append(el('span', null, (bat ? BAT_RATINGS : PIT_RATINGS)[k]), input, out); grid.appendChild(row);
      if (WORD[k]) { const tag = el('span', 'left need'); tags[k] = tag; grid.appendChild(tag); }
    }
    if (bat) pts.appendChild(el('p', 'left', RBI_NOTE));
    pts.append(grid, left); if (bat) pts.appendChild(fit); fields.appendChild(pts);
  }
  buildFields();
  make.onclick = async () => {
    make.disabled = true; msg.textContent = '建立中…'; msg.classList.remove('err');
    const r = await api('/api/player', { method: 'POST', key, body: choice() });
    if (r.body && r.body.ok) { showMine(r.body.player); return; }
    msg.classList.add('err'); msg.textContent = isClosed(r) ? '還沒開放。' : (WHY[r.body.why] || '建立失敗，等一下再試。');
    if (r.body && r.body.why === 'already') { const m = await api('/api/player', { key }); if (m.body && m.body.player) showMine(m.body.player); }
    else if (r.body && r.body.why === 'name') drawName(draw.n + 1); else refresh();
  };
  form.append(nameField, kindRow, fields, make, msg, el('p', 'left', KEY_WARN)); s.appendChild(form); s.hidden = false; refresh(); drawName(0);
}

/* ---- account (#350): no button, no heading. A browser without a key makes one and signs up by itself, then shows the maker. ---- */
const KEY_WARN = '不用密碼、不用信箱。這個瀏覽器會留一把隨機的鑰匙，伺服器只記它的雜湊。換瀏覽器或清掉資料就找不回來。';
async function register(key0) {
  const key = key0 || newKey();
  if (!store.set(key)) { say('這個瀏覽器不讓我們存資料（無痕視窗？），暫時不能建立帳號。', true); return; }
  const r = await api('/api/agent', { method: 'POST', key });
  if (r.body && r.body.ok) { say(''); buildMaker(key, defaults('bat')); return; }
  say(isClosed(r) ? '還沒開放。' : (WHY[r.body.why] || '註冊失敗，等一下再試。'), true);
}

async function start() {
  const first = await loadList(true);
  if (isClosed(first)) { say('還沒開放。'); return; }
  $('market').hidden = false; buildSortBar(); say('');
  const key = store.get();
  if (!key) { await register(null); return; }
  const me = await api('/api/player', { key });
  if (me.body && me.body.ok) { if (me.body.player) showMine(me.body.player); else buildMaker(key, defaults('bat')); }
  else if (me.body && me.body.why === 'unknown') await register(key);
  else say(isClosed(me) ? '還沒開放。' : '讀不到你的球員，等一下再試。', !isClosed(me));
}
$('faMore').onclick = () => loadList(false);
start();
