/* 自由市場 tab (#335, split in #344, cards in #353): every tier-3 player as roster cards. Pure: data in, HTML string out. Hash: #fa/<filter>/<player id>. */
import { empty, tierRows, rosterCards, filterRow, filterOf } from './shared.js';
export function view(d, myId, filter, cardId) {
  const rows = tierRows(d, 3), f = filterOf(filter), base = '#fa';
  return rows.length ? filterRow(base, f) + (rosterCards(rows, { base, filter: f, openId: cardId }) || empty('這個位置沒有人。')) : empty('自由市場目前沒有人。');
}
