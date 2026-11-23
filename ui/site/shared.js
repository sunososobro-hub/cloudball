/* Text-first data site (#335, split by tab in #344): the helpers every tab file uses. Pure: no DOM, no network, no game maths (rule 10).
 * A tab file (ui/site/<tab>.js) imports this file and nothing else from ui/, so two windows can edit two tabs without touching one file. */
export const MY_PLAYER_KEY = 'cloudball.myPlayerId';
export const TIER_LABEL = { 1: '一軍', 2: '二軍', 3: '自由市場' };
export const ABILITY_LABEL = { con: '打擊', pow: '長打', eye: '選球', spd: '速度', arm: '傳球', stuff: '球威', ctrl: '控球' };
export const ROLE_LABEL = { P: '投手', B: '野手' };

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
export const seasonLabel = d => (d.season !== '' && d.season != null ? `第 ${esc(d.season)} 季` : '');

export const empty = msg => `<p class="empty">${esc(msg)}</p>`;
export const teamOf = (d, id) => d.teams.find(t => t.id === id);
export const teamName = (d, id) => (teamOf(d, id) || {}).name || (id == null ? '—' : String(id));
const abil = (p, k) => (p.abilities && p.abilities[k] != null ? esc(p.abilities[k]) : '–');
export const pos = p => esc((p.role ? ROLE_LABEL[p.role] || p.role : '') + (p.pos ? '・' + p.pos : ''));
export const abilityText = p => Object.entries(p.abilities || {}).map(([k, v]) => `${esc(ABILITY_LABEL[k] || k)} ${esc(v)}`).join('　');

/* one player table: columns are the same on every tab (name, position, age, overall, abilities) */
export function playerTable(d, rows, { withTeam = false } = {}) {
  if (!rows.length) return '';
  const keys = [...new Set(rows.flatMap(([, p]) => Object.keys(p.abilities || {})))];
  const head = `<tr><th>姓名</th>${withTeam ? '<th>球隊</th>' : ''}<th>位置</th><th>年齡</th><th>綜合</th>${keys.map(k => `<th>${esc(ABILITY_LABEL[k] || k)}</th>`).join('')}</tr>`;
  const body = rows.map(([id, p]) => `<tr data-id="${esc(id)}"><td><b>${esc(p.name)}</b></td>${withTeam ? `<td>${esc(teamName(d, p.team))}</td>` : ''}<td>${pos(p)}</td><td>${esc(p.age)}</td><td class="ov num">${esc(p.overall)}</td>${keys.map(k => `<td class="num">${abil(p, k)}</td>`).join('')}</tr>`).join('');
  return `<div class="tblscroll"><table class="dt"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}
export const byOverall = rows => rows.slice().sort((a, b) => (b[1].overall || 0) - (a[1].overall || 0) || String(a[1].name).localeCompare(String(b[1].name)));
export const tierRows = (d, tier, team) => byOverall(Object.entries(d.players).filter(([, p]) => p && p.tier === tier && (team === undefined || p.team === team)));
