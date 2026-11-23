/* 自由市場 tab (#335, split in #344): every tier-3 player in one table. Pure: data in, HTML string out. */
import { empty, tierRows, playerTable } from './shared.js';
export function view(d) {
  const rows = tierRows(d, 3);
  return rows.length ? playerTable(d, rows) : empty('自由市場目前沒有人。');
}
