/* 二軍 tab (#335, split in #344): one table per team of the tier-2 players; empty until players are placed there. Pure: data in, HTML string out. */
import { esc, empty, teamOf, tierRows, playerTable } from './shared.js';
export function view(d) {
  const withPlayers = d.teams.map(t => [t, tierRows(d, 2, t.id)]);
  const orphans = tierRows(d, 2).filter(([, p]) => !teamOf(d, p.team));
  if (!withPlayers.some(([, r]) => r.length) && !orphans.length) return empty('二軍目前沒有人。球員被安排進二軍後會出現在這裡。') + d.teams.map(t => `<section class="team"><h2><span>${esc(t.name)}</span></h2>${empty('二軍沒有人。')}</section>`).join('');
  return withPlayers.map(([t, rows]) => `<section class="team"><h2><span>${esc(t.name)}</span><em class="num">${rows.length} 人</em></h2>${rows.length ? playerTable(d, rows) : empty('二軍沒有人。')}</section>`).join('') + (orphans.length ? `<section class="team"><h2><span>未分配</span></h2>${playerTable(d, orphans)}</section>` : '');
}
