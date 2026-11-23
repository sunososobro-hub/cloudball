/* 二軍 tab (#335, split in #344, cards in #353): the tier-2 players of each team as roster cards; empty until players are placed there. Pure: data in, HTML string out.
 * Hash: #minors/<filter>/<player id>. One filter row on top serves every team's section. */
import { esc, empty, teamOf, tierRows, rosterCards, filterRow, filterOf } from './shared.js';
export function view(d, myId, filter, cardId) {
  const withPlayers = d.teams.map(t => [t, tierRows(d, 2, t.id)]);
  const orphans = tierRows(d, 2).filter(([, p]) => !teamOf(d, p.team));
  if (!withPlayers.some(([, r]) => r.length) && !orphans.length) return empty('二軍目前沒有人。球員被安排進二軍後會出現在這裡。') + d.teams.map(t => `<section class="team"><h2><span>${esc(t.name)}</span></h2>${empty('二軍沒有人。')}</section>`).join('');
  const f = filterOf(filter), base = '#minors', list = rows => rows.length ? rosterCards(rows, { base, filter: f, openId: cardId }) || empty('這個位置沒有人。') : empty('二軍沒有人。');
  return filterRow(base, f) + withPlayers.map(([t, rows]) => `<section class="team"><h2><span>${esc(t.name)}</span><em class="num">${rows.length} 人</em></h2>${list(rows)}</section>`).join('') + (orphans.length ? `<section class="team"><h2><span>未分配</span></h2>${list(orphans)}</section>` : '');
}
