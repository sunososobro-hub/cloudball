/* Text-first data site (#335, split by tab in #344; roster cards in #353): the helpers every tab file uses. Pure: no DOM, no network, no game maths (rule 10).
 * A tab file (ui/site/<tab>.js) imports this file and nothing else from ui/, so two windows can edit two tabs without touching one file. */
import { TEAMS } from '../../league/teams.js'; /* rule 9: ui/ may read league/; only the team colour is taken from it */
export const MY_PLAYER_KEY = 'cloudball.myPlayerId';
export const TIER_LABEL = { 1: '一軍', 2: '二軍', 3: '自由市場' };
export const ABILITY_LABEL = { con: '打擊', pow: '長打', eye: '選球', spd: '速度', arm: '傳球', stuff: '球威', ctrl: '控球', pot: '潛力' };
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
/* season "0" is the pre-season: on screen it reads 熱身賽 (#343); the data key stays "0". Later seasons read 第 N 季. */
export const seasonLabel = d => (d.season === '' || d.season == null ? '' : String(d.season) === '0' ? '熱身賽' : `第 ${esc(d.season)} 季`);

export const empty = msg => `<p class="empty">${esc(msg)}</p>`;
export const teamOf = (d, id) => d.teams.find(t => t.id === id);
export const teamName = (d, id) => (teamOf(d, id) || {}).name || (id == null ? '—' : String(id));
const abil = (p, k) => (p.abilities && p.abilities[k] != null ? esc(p.abilities[k]) : '–');
export const pos = p => esc((p.role ? ROLE_LABEL[p.role] || p.role : '') + (p.pos ? '・' + p.pos : ''));
export const abilityText = p => Object.entries(p.abilities || {}).map(([k, v]) => `${esc(ABILITY_LABEL[k] || k)} ${esc(v)}`).join('　');

/* Roster cards (#353): one builder for 球團 (一軍), 二軍 and 自由市場. A filter row (全部, 投手, 捕手, 內野手, 外野手), then a grid of cards, grouped in 全部.
 * The chosen filter and the open card live in the URL hash next to the tab: `<base>/<filter>[/<player id>]`, so every filter and every card is a plain link.
 * The big number on a card is the 評價 (`overall`), the jersey number is small in the tile corner. No photo: the tile is a flat colour from the team (code-made). */
export const FILTERS = [['all', '全部'], ['p', '投手'], ['c', '捕手'], ['if', '內野手'], ['of', '外野手']];
/* 全部 lists these groups in this order; a position in none of them (DH, for one) is listed last under 其他 and has no filter of its own */
const GROUPS = [['p', '投手', ['SP', 'RP']], ['c', '捕手', ['C']], ['if', '內野手', ['1B', '2B', '3B', 'SS']], ['of', '外野手', ['LF', 'CF', 'RF']]];
const OTHER = '其他';
export const filterOf = f => (FILTERS.some(x => x[0] === f) ? f : 'all');
const groupKey = p => { const g = GROUPS.find(([, , ps]) => ps.includes(p.pos)) || (!p.pos && p.role === 'P' ? GROUPS[0] : null); return g ? g[0] : ''; };
/* Team mark (#361): the owner's own files assets/logos/<team id>_<px>.webp (128 small, 512 big), found by team id. A plain <img> with the team name as alt and a fixed size;
 * a team with no file shows nothing (the broken image removes itself). `eager` only for what is above the fold, the rest loads lazily. */
export const logoImg = (id, px, cls, name, eager) => (/^[\w-]+$/.test(String(id ?? ''))
  ? `<img class="${cls}" src="assets/logos/${esc(id)}_${px}.webp" alt="${esc(name)}" width="${px === 512 ? 72 : 28}" height="${px === 512 ? 72 : 28}"${eager ? '' : ' loading="lazy"'} onerror="this.remove()">` : '');
export const teamCss = id => { const t = TEAMS.find(x => x.id === id); return t && /^#[0-9a-f]{6}$/i.test(t.css) ? t.css : '#5b6479'; };
const SIDE = { L: '左', R: '右', S: '左右' };
const handText = p => (SIDE[p.hand] ? SIDE[p.hand] + (p.role === 'P' ? '投' : '打') : '');
export function filterRow(base, filter) {
  const f = filterOf(filter);
  return `<nav class="flt" aria-label="位置篩選">${FILTERS.map(([k, label]) => `<a href="${esc(base)}/${k}" aria-current="${k === f}">${label}</a>`).join('')}</nav>`;
}
function card(id, p, base, f, open) {
  const meta = [pos(p), handText(p), p.age != null ? `${esc(p.age)} 歲` : ''].filter(Boolean).join('　');
  const abilities = Object.entries(p.abilities || {}).filter(([, v]) => v != null);
  const panel = open ? `<dl class="ab">${abilities.map(([k, v]) => `<div><dt>${esc(ABILITY_LABEL[k] || k)}</dt><dd class="num">${esc(v)}</dd><span class="bar"><i style="width:${Math.max(0, Math.min(100, Number(v) || 0))}%"></i></span></div>`).join('') || `<div><dt>能力</dt><dd>—</dd></div>`}</dl>` : '';
  /* the open card links back to the list without it (tap again closes); the others link to themselves */
  return `<div class="pc${open ? ' open' : ''}" data-id="${esc(id)}"><a class="pt" href="${esc(base)}/${f}${open ? '' : '/' + encodeURIComponent(id)}" aria-expanded="${open}"><span class="tile" style="--tc:${teamCss(p.team)}">${p.num != null ? `<span class="no">#${esc(p.num)}</span>` : ''}<b class="ov num">${esc(p.overall)}</b><small>評價</small></span><span class="info"><b class="nm">${esc(p.name)}</b><span class="meta">${meta}</span></span></a>${panel}</div>`;
}
/* rows: [id, player] pairs; `filter` and `openId` come from the hash. Returns the groups (or the one filtered list); '' when nobody shows. */
export function rosterCards(rows, { base, filter, openId } = {}) {
  const f = filterOf(filter), grid = list => !list.length ? '' : `<div class="pgrid">${list.map(([id, p]) => card(id, p, base, f, id === openId)).join('')}</div>`;
  if (f !== 'all') return grid(byOverall(rows.filter(([, p]) => groupKey(p) === f)));
  const sp = ([, p]) => (p.pos === 'RP' ? 1 : 0);
  const out = GROUPS.map(([k, label]) => { const g = rows.filter(([, p]) => groupKey(p) === k); return [label, k === 'p' ? g.sort((a, b) => sp(a) - sp(b) || byOverallCmp(a, b)) : byOverall(g)]; });
  out.push([OTHER, byOverall(rows.filter(([, p]) => !groupKey(p)))]);
  return out.filter(([, g]) => g.length).map(([label, g]) => `<section class="grp" aria-label="${label}"><h3>${label}<small class="num">${g.length}</small></h3>${grid(g)}</section>`).join('');
}
const byOverallCmp = (a, b) => (b[1].overall || 0) - (a[1].overall || 0) || String(a[1].name).localeCompare(String(b[1].name));
export const byOverall = rows => rows.slice().sort(byOverallCmp);
export const tierRows = (d, tier, team) => byOverall(Object.entries(d.players).filter(([, p]) => p && p.tier === tier && (team === undefined || p.team === team)));
/* Front page summaries (#358): display only, read from the published ratings, nothing here decides a game (rule 10). */
export const tierOneRows = (d, t) => byOverall((t.roster || []).filter(id => d.players[id]).map(id => [id, d.players[id]]));
export const meanOverall = rows => (rows.length ? rows.reduce((s, [, p]) => s + (Number(p.overall) || 0), 0) / rows.length : null);
export const bestOf = (rows, role) => (rows.find(([, p]) => p.role === role) || [])[1] || null;
