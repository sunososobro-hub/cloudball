/* #379 part 13: rivalries, the season's grudge totals per player pair and per team pair, for the site text (宿敵).
 * Pure: no DOM, network, clock or randomness (rules 10, 11). The engine decides every grudge (simGame `grudges` rows with the
 * grudge record on, #379 part 3); this file only adds up the scores it returned. It never edits a result.
 *
 *   recordGrudges(book, teams, grudges)  a new book with one game's grudge rows added. `teams` = [away, home] team indexes
 *                                        (the pair the points count for); rows with no score skip. No rows = the same book.
 *   topGrudges(book, id, n)              the n players `id` holds the most grudge against: [{ id, points }], most first,
 *                                        ties by id (stable text).
 *   nemesisOf(book, team)                the opponent team index whose pair holds the most grudge points with `team` (both
 *                                        directions), or undefined below NEMESIS_MIN points (no 宿敵 label); ties -> lower index.
 *   nemesisLabel(name)                   the site text for a 宿敵 opponent name.
 * Data format (book): { players: { <from id>: { <to id>: points } }, teams: { 'a-b': points } }, plain JSON; pair keys as
 * league/grudges.js pairKey. The input book is never changed. */
import { pairKey } from './grudges.js';

export const RIVAL_TOP = 3;          /* grudges shown per player */
export const NEMESIS_MIN = 2;        /* team pair points for a 宿敵 label: two plain hit batters (GRUDGE_HBP 1 each); first guess */
export const emptyRivals = () => ({ players: {}, teams: {} });

export function recordGrudges(book, teams, grudges) {
  if (!grudges || !grudges.length) return book;
  const players = { ...book.players }, tm = { ...book.teams };
  for (const g of grudges) {
    if (!(g.score > 0)) continue;
    const row = players[g.from] = { ...(players[g.from] || {}) };
    row[g.to] = (row[g.to] || 0) + g.score;
    const key = pairKey(teams[0], teams[1]);
    tm[key] = (tm[key] || 0) + g.score;
  }
  return { players, teams: tm };
}

export function topGrudges(book, id, n = RIVAL_TOP) {
  const row = (book && book.players && book.players[id]) || {};
  return Object.entries(row).map(([to, points]) => ({ id: to, points }))
    .sort((a, b) => b.points - a.points || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, n);
}

export function nemesisOf(book, team) {
  let best, most = 0;
  for (const [key, points] of Object.entries((book && book.teams) || {})) {
    const [a, b] = key.split('-').map(Number);
    if (a !== team && b !== team) continue;
    const other = a === team ? b : a;
    if (points > most || (points === most && best !== undefined && other < best)) { best = other; most = points; }
  }
  return most >= NEMESIS_MIN ? best : undefined;
}

export const nemesisLabel = name => `宿敵：${name}`;
