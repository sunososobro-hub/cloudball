/* 球團 tab (#335, split in #344): the four teams with logo, record and the 一軍 roster. Pure: data in, HTML string out. */
import { esc, safeUrl, empty, byOverall, playerTable } from './shared.js';
export function view(d) {
  if (!d.teams.length) return empty('還沒有球團資料。');
  return d.teams.map(t => {
    const rows = byOverall((t.roster || []).filter(id => d.players[id]).map(id => [id, d.players[id]]));
    const rec = t.record ? `${esc(t.record.w)} 勝 ${esc(t.record.l)} 敗` : '';
    const logo = safeUrl(t.logo) ? `<img class="lg" src="${esc(safeUrl(t.logo))}" alt="" width="40" height="40">` : '';
    return `<section class="team"><h2>${logo}<span>${esc(t.name)}</span><small>${esc(t.city || '')}</small><em class="num">${rec}</em></h2>${rows.length ? `<p class="cnt">一軍 ${rows.length} 人</p>${playerTable(d, rows)}` : empty('一軍名單是空的。')}</section>`;
  }).join('');
}
