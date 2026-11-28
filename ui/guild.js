/* Guild page (guild.html, #800 part 1): found a guild (name + base team), see its page. Same account as agent.html: the random key kept in
 * localStorage, sent as a Bearer header; the server judges every choice again (functions/lib/guild.js). No answer = 「還沒開放」. */
import { seasonAt } from '../league/season_site.js';
import { guildPower } from '../league/guild_power.js';
import { siteRoster } from '../league/site_roster.js';
import { TEAMS } from '../league/teams.js';
import { ENGINE_PIN } from '../league/engine_pin.js';
import { practiceMembers, practiceLink } from '../league/practice_guild.js';
import { gamesLeft, takeGame, PRACTICE_PER_DAY } from './practice_limit.js';
import { memberKey, shardUrl, memberText, GUILD_NONE } from '../league/guild_lines.js';
import { guildRecord, recordText, STANDINGS_URL } from '../league/guild_record.js';
const KEY_NAME = 'cloudball.agentKey';
const POS = { C: '捕手', '1B': '一壘手', '2B': '二壘手', '3B': '三壘手', SS: '游擊手', LF: '左外野', CF: '中外野', RF: '右外野', DH: '指定打擊', SP: '先發投手', MR: '中繼投手', RP: '後援投手', CL: '終結投手' };
const WHY = { already: '你已經有一支球團了。', name: '這個團名已經有人用了，換一個。', full: '這支球團的位置滿了。', none: '找不到這支球團。', leader: '領隊不能離團。', coach: '只有總教練能排打序。', member: '找不到這位隊員。', limit: '今天換太多次了，明天再試。', invalid: '團名或球隊有誤，請重新選。', key: '帳號有問題，請回自創球員頁重新開始。', unknown: '找不到你的帳號，請先到自創球員頁。' };
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

/* #804 part 4: a member's 公會賽 season line, read from the published line shard of the current season (text only, no server call; a failed read = no record yet) */
let seasonNo;
const getJson = async url => { try { const r = await fetch(url, { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch (e) { return null; } };
async function lineFor(g, name) {
  if (seasonNo === undefined) { const st = seasonAt(await getJson('league/site/season.json'), new Date().toISOString().slice(0, 10)); seasonNo = st && st.state !== 'before' ? st.season : null; }
  if (seasonNo == null) return GUILD_NONE;
  const key = memberKey(g.id, name); return memberText(await getJson(shardUrl(seasonNo, key)), key);
}

/* #800 part 4: 戰力 (投球 / 打擊 / 守備, 1..100, display only) of the guild on its base team's 一軍 roster, from league/guild_power.js; players.json is the published site file */
const FIRST_TIER = 1;
async function powerBox(parent, g) {
  const box = el('p', 'left power', '戰力：…'); parent.appendChild(box);
  const players = await getJson('league/site/players.json');
  if (!players) { box.textContent = '戰力：讀不到球員資料。'; return; }
  try {
    const members = g.members.filter(m => m.player).map(m => ({ player: { name: m.player.name, kind: m.player.kind, ovr: m.player.ovr, pos: m.player.pos } }));
    const p = guildPower({ id: g.id, members }, siteRoster(players, g.base.id, FIRST_TIER));
    box.textContent = `戰力 ${p.all}（投球 ${p.pit}・打擊 ${p.bat}・守備 ${p.def}）。只是顯示，不影響比賽。`;
  } catch (e) { box.textContent = '戰力：算不出來。'; }
}

/* #800 part 8: the guild's 公會賽 record (W-L, runs, place) from the published standings file of the nightly run; no server call, never official (rule 24) */
async function recordBox(parent, g) {
  const box = el('p', 'left record', '公會賽戰績：…'); parent.appendChild(box);
  box.textContent = recordText(guildRecord(await getJson(STANDINGS_URL), g.id));
}

let palette = [];   /* the colour choices the server sent with the last GET */
function showGuild(g, seats = 10) {
  const iAmLeader = g.members.some(m => m.leader && m.me), iAmCoach = g.members.some(m => m.coach && m.me);
  const s = $('mine'); s.replaceChildren(el('h2', null, g.name));
  if (g.color && /^#[0-9a-f]{6}$/.test(g.color)) s.firstChild.style.borderLeft = `8px solid ${g.color}`;
  s.appendChild(el('p', 'left', `基地球隊：${g.base.name}（球團用這支球隊的名單，隊員加入後取代他的位置）`));
  const roles = el('dl', 'r');
  const who = role => g.members.find(m => m[role]);
  const nameOf = m => (m && m.player ? m.player.name : '你');
  roles.append(el('dt', null, '領隊'), el('dd', null, nameOf(who('leader'))), el('dt', null, '總教練'), el('dd', null, nameOf(who('coach'))));
  s.appendChild(roles);
  if (iAmLeader) styleBox(s, g);
  powerBox(s, g);
  recordBox(s, g);
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
    if (iAmLeader && !m.coach) {
      const c = el('button', 'btn', '交棒總教練'); c.type = 'button';
      c.onclick = async () => { c.disabled = true; const r = await api('POST', { ref: m.ref }, '/coach'); if (r.body && r.body.ok) { say('總教練已交棒。'); showGuild(r.body.guild); } else { c.disabled = false; fail(r); } };
      li.appendChild(c);
    }
    if (p) { const sl = el('p', 'left season-line', '…'); li.appendChild(sl); lineFor(g, p.name).then(t => { sl.textContent = t; }); }
    ul.appendChild(li);
  }
  s.appendChild(ul);
  s.appendChild(el('p', 'left', `其他位置由電腦球員補上（最多 ${seats} 位隊員）。`));
  lineupBox(s, g, iAmCoach);
  practiceBox(s, g);
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

/* #800 part 8: the 領隊 renames the guild and picks its colour (a fixed palette from the server); one explicit save button, counted as a daily save */
function styleBox(parent, g) {
  const box = el('div', 'style'); parent.append(el('h3', null, '團名與顏色'), box);
  const input = el('input'); input.type = 'text'; input.value = g.name; input.maxLength = 12; input.autocomplete = 'off'; input.setAttribute('aria-label', '團名');
  let color = g.color || null;
  const seg = el('div', 'seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', '球團顏色');
  const draw = () => {
    seg.replaceChildren();
    for (const c of [null, ...palette]) {
      const x = el('button', null, c ? '●' : '無'); x.type = 'button'; x.setAttribute('aria-pressed', String(c === color)); x.setAttribute('aria-label', c || '不選顏色');
      if (c) x.style.color = c;
      x.onclick = () => { color = c; draw(); }; seg.appendChild(x);
    }
  };
  draw();
  const save = el('button', 'btn', '儲存團名與顏色'); save.type = 'button';
  save.onclick = async () => {
    const name = input.value.trim(); if (!name) { say('團名不能空白。', true); return; }
    save.disabled = true; const r = await api('POST', { name, color }, '/style');
    if (r.body && r.body.ok) { say('團名與顏色已儲存。'); showGuild(r.body.guild); } else { save.disabled = false; fail(r); }
  };
  box.append(input, seg, save);
}

/* 練習賽 (#800 part 7, #810): any member plays his guild's lineup against an NPC team, computed in the browser by play.html from a link that carries the members.
 * Zero server calls, never counted (rule 24); the daily limit lives in this browser only (ui/practice_limit.js). The guild is the home side, its starter is the saved one. */
function practiceBox(parent, g) {
  const base = TEAMS.findIndex(t => t.id === g.base.id), box = el('div', 'practice');
  parent.append(el('h3', null, '練習賽'), box);
  let opp = TEAMS.findIndex((t, i) => i !== base);
  const draw = () => {
    box.replaceChildren(el('p', 'left', '對手：電腦球隊。用你們現在的打序和先發，在這個瀏覽器裡馬上算出來，不算戰績、不花錢。'));
    const seg = el('div', 'seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', '練習賽對手');
    TEAMS.forEach((t, i) => { if (i === base) return; const x = el('button', null, t.short); x.type = 'button'; x.setAttribute('aria-pressed', String(i === opp)); x.onclick = () => { opp = i; draw(); }; seg.appendChild(x); });
    const left = gamesLeft(), go = el('button', 'btn', '開始練習賽'); go.type = 'button'; go.disabled = base < 0 || left <= 0;
    go.onclick = () => {
      const seed = crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;
      const r = practiceLink({ members: practiceMembers(g), base, opp, sp: (g.lineup && g.lineup.sp) || 0, seed, commit: ENGINE_PIN.commit });
      if (!r.link) { say('這支球團放不進練習賽連結。', true); return; }
      if (!takeGame().ok) { draw(); return; }
      location.href = r.link;
    };
    box.append(seg, go, el('p', 'left', left > 0 ? `今天還能開 ${left} 場（每天 ${PRACTICE_PER_DAY} 場，只記在這個瀏覽器）。` : `今天的 ${PRACTICE_PER_DAY} 場用完了，明天再來。`));
  };
  draw();
}

/* 打序: the nine batting slots in batting order + the starting pitcher's rotation slot (#800 part 3); only the 總教練 edits, everyone sees it */
function lineupBox(parent, g, edit) {
  const lu = g.lineup || { batting: [0, 1, 2, 3, 4, 5, 6, 7, 8], sp: 0, saved: false };
  let order = lu.batting.slice(), sp = lu.sp;
  const box = el('div', 'lineup'); parent.append(el('h3', null, '打序與先發'), box);
  const draw = () => {
    box.replaceChildren(el('p', 'left', lu.saved ? '已儲存的打序。' : '還沒排打序，開打時由電腦自動排。'));
    const ol = el('ol', 'roster');
    order.forEach((slot, i) => {
      const li = el('li', 'p'); li.appendChild(el('b', null, `第 ${i + 1} 棒：位置 ${slot + 1}`));
      if (edit) for (const [label, d] of [['上移', -1], ['下移', 1]]) {
        const b = el('button', 'btn', label); b.type = 'button'; b.disabled = i + d < 0 || i + d >= order.length;
        b.onclick = () => { [order[i], order[i + d]] = [order[i + d], order[i]]; draw(); };
        li.appendChild(b);
      }
      ol.appendChild(li);
    });
    box.appendChild(ol);
    const sel = el('select'); sel.setAttribute('aria-label', '先發投手'); sel.disabled = !edit;
    for (let k = 0; k < 5; k++) { const o = el('option', null, `先發 ${k + 1} 號`); o.value = String(k); o.selected = k === sp; sel.appendChild(o); }
    sel.onchange = () => { sp = Number(sel.value); };
    box.append(el('label', null, '先發投手'), sel);
    if (edit) {
      const save = el('button', 'btn', '儲存打序'); save.type = 'button';
      save.onclick = async () => { save.disabled = true; const r = await api('POST', { order, sp }, '/lineup'); if (r.body && r.body.ok) { say('打序已儲存。'); showGuild(r.body.guild); } else { save.disabled = false; fail(r); } };
      box.appendChild(save);
    }
  };
  draw();
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
  palette = Array.isArray(r.body.colors) ? r.body.colors : []; say(''); $('mine').hidden = true; $('maker').hidden = true;
  if (r.body.guild) showGuild(r.body.guild, r.body.seats); else if (r.body.invite) buildJoin(r.body.invite); else buildMaker(r.body.bases, r.body.nameMax);
}
start();
