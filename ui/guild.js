/* Guild page (guild.html, #800 part 1): found a guild (name + base team), see its page. Same account as agent.html: the random key kept in
 * localStorage, sent as a Bearer header; the server judges every choice again (functions/lib/guild.js). No answer = 「還沒開放」. */
const KEY_NAME = 'cloudball.agentKey';
const POS = { C: '捕手', '1B': '一壘手', '2B': '二壘手', '3B': '三壘手', SS: '游擊手', LF: '左外野', CF: '中外野', RF: '右外野', DH: '指定打擊', SP: '先發投手', MR: '中繼投手', RP: '後援投手', CL: '終結投手' };
const WHY = { already: '你已經有一支球團了。', name: '這個團名已經有人用了，換一個。', full: '這支球團的位置滿了。', none: '找不到這支球團。', leader: '領隊不能離團。', member: '找不到這位隊員。', limit: '今天換太多次了，明天再試。', invalid: '團名或球隊有誤，請重新選。', key: '帳號有問題，請回自創球員頁重新開始。', unknown: '找不到你的帳號，請先到自創球員頁。' };
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const say = (text, err) => { const s = $('status'); s.textContent = text; s.hidden = !text; s.classList.toggle('err', !!err); };
const getKey = () => { try { return localStorage.getItem(KEY_NAME); } catch (e) { return null; } };

async function api(method, body, path = '') {
  try {
    const headers = { authorization: `Bearer ${getKey()}` }; if (body) headers['content-type'] = 'application/json';
    const res = await fetch('/api/guild' + path, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    const json = await res.json().catch(() => null);
    return { status: res.status, body: json && typeof json === 'object' ? json : null };
  } catch (e) { return { status: 0, body: null }; }
}
const isClosed = r => !r.body || [0, 405, 501].includes(r.status) || (r.status === 404 && !r.body.why) || r.body.why === 'closed';

const joinCode = () => { const c = new URLSearchParams(location.search).get('join'); return c && /^[0-9a-f]{12}$/.test(c) ? c : ''; };
const inviteUrl = g => `${location.origin}${location.pathname}?join=${g.id}`;
const fail = r => say(isClosed(r) ? '還沒開放。' : (WHY[r.body.why] || '沒成功，等一下再試。'), true);

function showGuild(g, seats = 10) {
  const iAmLeader = g.members.some(m => m.leader && m.me);
  const s = $('mine'); s.replaceChildren(el('h2', null, g.name));
  s.appendChild(el('p', 'left', `基地球隊：${g.base.name}（球團用這支球隊的名單，隊員加入後取代他的位置）`));
  const roles = el('dl', 'r');
  const who = role => g.members.find(m => m[role]);
  const nameOf = m => (m && m.player ? m.player.name : '你');
  roles.append(el('dt', null, '領隊'), el('dd', null, nameOf(who('leader'))), el('dt', null, '總教練'), el('dd', null, nameOf(who('coach'))));
  s.appendChild(roles);
  s.appendChild(el('h3', null, '隊員'));
  const ul = el('ul', 'roster');
  for (const m of g.members) {
    const li = el('li', 'p'), p = m.player;
    li.appendChild(el('b', null, p ? `${p.name}（${POS[p.pos] || p.pos || ''}・綜合 ${p.ovr}）` : '（還沒有自己的球員）'));
    if (iAmLeader && !m.leader) {
      const x = el('button', 'btn', '移除'); x.type = 'button';
      x.onclick = async () => { x.disabled = true; const r = await api('POST', { ref: m.ref }, '/remove'); if (r.body && r.body.ok) { say(''); showGuild(r.body.guild); } else { x.disabled = false; fail(r); } };
      li.appendChild(x);
    }
    ul.appendChild(li);
  }
  s.appendChild(ul);
  s.appendChild(el('p', 'left', `其他位置由電腦球員補上（最多 ${seats} 位隊員）。排打序之後開放。`));
  const link = el('input'); link.type = 'text'; link.readOnly = true; link.value = inviteUrl(g); link.setAttribute('aria-label', '邀請連結');
  const copy = el('button', 'btn', '複製邀請連結'); copy.type = 'button';
  copy.onclick = async () => { link.select(); try { await navigator.clipboard.writeText(link.value); say('已複製，貼到 LINE 給隊友。'); } catch (e) { say('長按連結複製。'); } };
  s.append(el('h3', null, '邀請隊友'), link, copy);
  if (!iAmLeader) {
    const out = el('button', 'btn', '離團'); out.type = 'button';
    out.onclick = async () => { out.disabled = true; const r = await api('POST', {}, '/leave'); if (r.body && r.body.ok) { say('你已離團，隨時可以再加入或創團。'); start(); } else { out.disabled = false; fail(r); } };
    s.appendChild(out);
  }
  s.hidden = false; $('maker').hidden = true;
}

function buildMaker(bases, nameMax) {
  const m = $('maker'); m.replaceChildren(el('h2', null, '成立球團'));
  const label = el('label', null, `團名（最多 ${nameMax} 個字）`), input = el('input'); input.type = 'text'; input.maxLength = nameMax; input.autocomplete = 'off';
  label.appendChild(input); m.appendChild(label);
  let base = bases[0].id;
  const seg = el('div', 'seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', '基地球隊');
  const draw = () => { seg.replaceChildren(); for (const b of bases) { const x = el('button', null, b.name); x.type = 'button'; x.setAttribute('aria-pressed', String(b.id === base)); x.onclick = () => { base = b.id; draw(); }; seg.appendChild(x); } };
  draw(); m.append(el('p', 'left', '基地球隊：球團先用這支球隊的名單。'), seg);
  const go = el('button', 'btn', '創團'); go.type = 'button';
  go.onclick = async () => {
    const name = input.value.trim(); if (!name) { say('先取一個團名。', true); return; }
    go.disabled = true; const r = await api('POST', { name, base });
    if (r.body && r.body.ok) { say(''); showGuild(r.body.guild, r.body.seats); return; }
    go.disabled = false; say(isClosed(r) ? '還沒開放。' : (WHY[r.body.why] || '創團失敗，等一下再試。'), true);
  };
  m.appendChild(go); m.hidden = false;
}

function buildJoin(inv) {
  const m = $('maker'); m.replaceChildren(el('h2', null, `加入「${inv.name}」`));
  m.appendChild(el('p', 'left', `基地球隊：${inv.base}。目前 ${inv.taken} / ${inv.seats} 位隊員。加入後你的球員取代他那個位置的電腦球員。每人一次只能在一支球團，隨時可以離團。`));
  const go = el('button', 'btn', '加入'); go.type = 'button';
  go.onclick = async () => {
    go.disabled = true; const r = await api('POST', { guild: inv.id }, '/join');
    if (r.body && r.body.ok) { say(''); history.replaceState(null, '', location.pathname); showGuild(r.body.guild); return; }
    go.disabled = false; fail(r);
  };
  m.appendChild(go); m.hidden = false;
}

async function start() {
  if (!getKey()) { say('先到自創球員頁建立帳號，再回來創團。', true); return; }
  const code = joinCode(), r = await api('GET', null, code ? `?join=${code}` : '');
  if (isClosed(r)) { say('還沒開放。'); return; }
  if (!r.body.ok) { say(WHY[r.body.why] || '讀不到你的球團，等一下再試。', true); return; }
  say(''); $('mine').hidden = true; $('maker').hidden = true;
  if (r.body.guild) showGuild(r.body.guild, r.body.seats); else if (r.body.invite) buildJoin(r.body.invite); else buildMaker(r.body.bases, r.body.nameMax);
}
start();
