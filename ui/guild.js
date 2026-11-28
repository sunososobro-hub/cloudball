/* Guild page (guild.html, #800 part 1): found a guild (name + base team), see its page. Same account as agent.html: the random key kept in
 * localStorage, sent as a Bearer header; the server judges every choice again (functions/lib/guild.js). No answer = 「還沒開放」. */
const KEY_NAME = 'cloudball.agentKey';
const POS = { C: '捕手', '1B': '一壘手', '2B': '二壘手', '3B': '三壘手', SS: '游擊手', LF: '左外野', CF: '中外野', RF: '右外野', DH: '指定打擊', SP: '先發投手', MR: '中繼投手', RP: '後援投手', CL: '終結投手' };
const WHY = { already: '你已經有一支球團了。', name: '這個團名已經有人用了，換一個。', invalid: '團名或球隊有誤，請重新選。', key: '帳號有問題，請回自創球員頁重新開始。', unknown: '找不到你的帳號，請先到自創球員頁。' };
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const say = (text, err) => { const s = $('status'); s.textContent = text; s.hidden = !text; s.classList.toggle('err', !!err); };
const getKey = () => { try { return localStorage.getItem(KEY_NAME); } catch (e) { return null; } };

async function api(method, body) {
  try {
    const headers = { authorization: `Bearer ${getKey()}` }; if (body) headers['content-type'] = 'application/json';
    const res = await fetch('/api/guild', { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    const json = await res.json().catch(() => null);
    return { status: res.status, body: json && typeof json === 'object' ? json : null };
  } catch (e) { return { status: 0, body: null }; }
}
const isClosed = r => !r.body || [0, 404, 405, 501].includes(r.status) || r.body.why === 'closed';

function showGuild(g) {
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
    li.appendChild(el('b', null, p ? `${p.name}（${POS[p.pos] || p.pos || ''}・綜合 ${p.ovr}）` : '你（還沒有自己的球員）'));
    ul.appendChild(li);
  }
  s.appendChild(ul);
  s.appendChild(el('p', 'left', '其他位置由電腦球員補上。邀請隊友和排打序之後開放。'));
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
    if (r.body && r.body.ok) { say(''); showGuild(r.body.guild); return; }
    go.disabled = false; say(isClosed(r) ? '還沒開放。' : (WHY[r.body.why] || '創團失敗，等一下再試。'), true);
  };
  m.appendChild(go); m.hidden = false;
}

async function start() {
  if (!getKey()) { say('先到自創球員頁建立帳號，再回來創團。', true); return; }
  const r = await api('GET');
  if (isClosed(r)) { say('還沒開放。'); return; }
  if (!r.body.ok) { say(WHY[r.body.why] || '讀不到你的球團，等一下再試。', true); return; }
  say(''); if (r.body.guild) showGuild(r.body.guild); else buildMaker(r.body.bases, r.body.nameMax);
}
start();
