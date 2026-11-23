/* Text-first data site (#335). Pure view functions: data files in, HTML strings out. No DOM, no network, no game maths (rule 10):
 * everything shown is read from league/site/{teams,players,games}.json (contract: issue #336). Publishing = replacing those files.
 * tests/sitedata.check.mjs renders every view with fixtures, with the real files when present, and with empty lists. */
export const DATA_FILES = { teams: 'league/site/teams.json', players: 'league/site/players.json', games: 'league/site/games.json' };
export const MY_PLAYER_KEY = 'cloudball.myPlayerId';
export const TIER_LABEL = { 1: '一軍', 2: '二軍', 3: '自由市場' };
export const ABILITY_LABEL = { con: '打擊', pow: '長打', eye: '選球', spd: '速度', arm: '傳球', stuff: '球威', ctrl: '控球' };
export const ROLE_LABEL = { P: '投手', B: '野手' };
export const TABS = [['teams', '球團'], ['games', '比賽影片'], ['me', '我的球員'], ['minors', '二軍'], ['fa', '自由市場']];

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/* a link target from a data file: only relative paths and http(s) are allowed, anything else (javascript:, data:) is dropped */
export const safeUrl = u => { const s = String(u ?? '').trim(); return /^(https?:\/\/|\.{0,2}\/|[\w.-]+(\/|\?|#|$))/i.test(s) && !/^[a-z][a-z0-9+.-]*:/i.test(s.replace(/^https?:/i, '')) ? s : ''; };

/* teams.json is an array, or { season, teams } (the contract adds a top-level season); both are read */
export function normalize(raw) {
  const teams = Array.isArray(raw) ? raw : raw && Array.isArray(raw.teams) ? raw.teams : [];
  return { season: raw && !Array.isArray(raw) && raw.season != null ? String(raw.season) : '', teams };
}
export function combine({ teams, players, games } = {}) {
  const n = normalize(teams);
  return { season: n.season, teams: n.teams, players: players && typeof players === 'object' && !Array.isArray(players) ? players : {}, games: Array.isArray(games) ? games : [] };
}

const empty = msg => `<p class="empty">${esc(msg)}</p>`;
const teamOf = (d, id) => d.teams.find(t => t.id === id);
const teamName = (d, id) => (teamOf(d, id) || {}).name || (id == null ? '—' : String(id));
const abil = (p, k) => (p.abilities && p.abilities[k] != null ? esc(p.abilities[k]) : '–');
const pos = p => esc((p.role ? ROLE_LABEL[p.role] || p.role : '') + (p.pos ? '・' + p.pos : ''));
const abilityText = p => Object.entries(p.abilities || {}).map(([k, v]) => `${esc(ABILITY_LABEL[k] || k)} ${esc(v)}`).join('　');

/* one player table: columns are the same on every tab (name, position, age, overall, abilities) */
export function playerTable(d, rows, { withTeam = false } = {}) {
  if (!rows.length) return '';
  const keys = [...new Set(rows.flatMap(([, p]) => Object.keys(p.abilities || {})))];
  const head = `<tr><th>姓名</th>${withTeam ? '<th>球隊</th>' : ''}<th>位置</th><th>年齡</th><th>綜合</th>${keys.map(k => `<th>${esc(ABILITY_LABEL[k] || k)}</th>`).join('')}</tr>`;
  const body = rows.map(([id, p]) => `<tr data-id="${esc(id)}"><td><b>${esc(p.name)}</b></td>${withTeam ? `<td>${esc(teamName(d, p.team))}</td>` : ''}<td>${pos(p)}</td><td>${esc(p.age)}</td><td class="ov num">${esc(p.overall)}</td>${keys.map(k => `<td class="num">${abil(p, k)}</td>`).join('')}</tr>`).join('');
  return `<div class="tblscroll"><table class="dt"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}
const byOverall = rows => rows.slice().sort((a, b) => (b[1].overall || 0) - (a[1].overall || 0) || String(a[1].name).localeCompare(String(b[1].name)));
const tierRows = (d, tier, team) => byOverall(Object.entries(d.players).filter(([, p]) => p && p.tier === tier && (team === undefined || p.team === team)));

export function teamsView(d) {
  if (!d.teams.length) return empty('還沒有球團資料。');
  return d.teams.map(t => {
    const rows = byOverall((t.roster || []).filter(id => d.players[id]).map(id => [id, d.players[id]]));
    const rec = t.record ? `${esc(t.record.w)} 勝 ${esc(t.record.l)} 敗` : '';
    const logo = safeUrl(t.logo) ? `<img class="lg" src="${esc(safeUrl(t.logo))}" alt="" width="40" height="40">` : '';
    return `<section class="team"><h2>${logo}<span>${esc(t.name)}</span><small>${esc(t.city || '')}</small><em class="num">${rec}</em></h2>${rows.length ? `<p class="cnt">一軍 ${rows.length} 人</p>${playerTable(d, rows)}` : empty('一軍名單是空的。')}</section>`;
  }).join('');
}
export function gamesView(d) {
  if (!d.games.length) return empty('還沒有比賽影片。');
  const rows = d.games.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).map(g => {
    const [h, a] = Array.isArray(g.score) ? g.score : ['', ''], link = safeUrl(g.replay);
    return `<tr><td class="num">${esc(g.date)}</td><td>${esc(teamName(d, g.away))} <b class="num">${esc(a)}</b> : <b class="num">${esc(h)}</b> ${esc(teamName(d, g.home))}</td><td>${link ? `<a href="${esc(link)}">看重播</a>` : '—'}</td></tr>`;
  }).join('');
  return `<div class="tblscroll"><table class="dt"><thead><tr><th>日期</th><th>客隊 : 主隊</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
export function myPlayerView(d, id) {
  const p = id != null && id !== '' ? d.players[id] : null;
  if (!id) return empty('你還沒有自己的球員。');
  if (!p) return empty('找不到這位球員，他可能還沒登錄進名單。');
  const where = p.tier === 3 || p.team == null ? TIER_LABEL[3] : `${esc(teamName(d, p.team))}　${esc(TIER_LABEL[p.tier] || '')}`;
  return `<section class="me"><h2>${esc(p.name)}</h2><dl><dt>位置</dt><dd>${pos(p)}</dd><dt>年齡</dt><dd>${esc(p.age)}</dd><dt>綜合</dt><dd class="num">${esc(p.overall)}</dd><dt>目前</dt><dd>${where}</dd><dt>能力</dt><dd>${abilityText(p) || '—'}</dd></dl></section>`;
}
export function minorsView(d) {
  const withPlayers = d.teams.map(t => [t, tierRows(d, 2, t.id)]);
  const orphans = tierRows(d, 2).filter(([, p]) => !teamOf(d, p.team));
  if (!withPlayers.some(([, r]) => r.length) && !orphans.length) return empty('二軍目前沒有人。球員被安排進二軍後會出現在這裡。') + d.teams.map(t => `<section class="team"><h2><span>${esc(t.name)}</span></h2>${empty('二軍沒有人。')}</section>`).join('');
  return withPlayers.map(([t, rows]) => `<section class="team"><h2><span>${esc(t.name)}</span><em class="num">${rows.length} 人</em></h2>${rows.length ? playerTable(d, rows) : empty('二軍沒有人。')}</section>`).join('') + (orphans.length ? `<section class="team"><h2><span>未分配</span></h2>${playerTable(d, orphans)}</section>` : '');
}
export function freeAgentsView(d) {
  const rows = tierRows(d, 3);
  return rows.length ? playerTable(d, rows) : empty('自由市場目前沒有人。');
}
export const VIEWS = { teams: teamsView, games: gamesView, minors: minorsView, fa: freeAgentsView };
export function render(tab, d, myId) { return tab === 'me' ? myPlayerView(d, myId) : (VIEWS[tab] || teamsView)(d); }
export const seasonLabel = d => (d.season !== '' && d.season != null ? `第 ${esc(d.season)} 季` : '');
