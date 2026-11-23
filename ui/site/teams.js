/* 球團 tab (#335, split in #344, cards in #343): four team cards at a glance (logo, record, 王牌, 主砲, strength); tap a card to open its 一軍 roster below, tap again to close.
 * Pure: data in, HTML string out. The open team comes from the URL hash (#teams/<id>), so a card is a plain link and no state lives here.
 * Ace, top bat and strength are display summaries of the published ratings (best `overall`, mean `overall`); nothing here decides a game (rule 10). */
import { esc, safeUrl, empty, byOverall, playerTable, teamName } from './shared.js';
const rosterOf = (d, t) => byOverall((t.roster || []).filter(id => d.players[id]).map(id => [id, d.players[id]]));
const star = (rows, role, label) => {
  const top = rows.find(([, p]) => p.role === role);
  return `<div><dt>${label}</dt><dd>${top ? `${esc(top[1].name)}${top[1].num != null ? ` <span class="no">#${esc(top[1].num)}</span>` : ''}` : '—'}</dd></div>`;
};
const strength = rows => (rows.length ? esc((rows.reduce((s, [, p]) => s + (Number(p.overall) || 0), 0) / rows.length).toFixed(1)) : '—');
function card(d, t, open) {
  const rows = rosterOf(d, t);
  const rec = t.record ? `${esc(t.record.w)} 勝 ${esc(t.record.l)} 敗` : '';
  const logo = safeUrl(t.logo) ? `<img class="lg" src="${esc(safeUrl(t.logo))}" alt="" width="48" height="48">` : '';
  /* the open card links back to #teams (tap again closes); the others link to their own roster */
  return `<a class="tc" href="#teams${open ? '' : '/' + encodeURIComponent(t.id)}" aria-expanded="${open}" data-team="${esc(t.id)}"><header>${logo}<span class="nm"><b>${esc(t.name)}</b><small>${esc(t.city || '')}</small></span></header><p class="rec num">${rec}</p><dl>${star(rows, 'P', '王牌')}${star(rows, 'B', '主砲')}<div><dt>戰力</dt><dd class="num">${strength(rows)}</dd></div></dl></a>`;
}
export function view(d, myId, openId) {
  if (!d.teams.length) return empty('還沒有球團資料。');
  const open = d.teams.find(t => t.id === openId);
  let roster = '';
  if (open) {
    const rows = rosterOf(d, open);
    roster = `<section class="team" aria-label="${esc(teamName(d, open.id))}一軍"><h2>${esc(open.name)} 一軍<small>${rows.length} 人</small></h2>${rows.length ? playerTable(d, rows) : empty('一軍名單是空的。')}</section>`;
  }
  return `<div class="cards">${d.teams.map(t => card(d, t, t === open)).join('')}</div>${roster}`;
}
