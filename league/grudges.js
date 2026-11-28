/* #379 part 9: the league's grudge book, unsettled grudge points per team pair between scheduled games. Pure: no DOM,
 * network, clock or randomness (rules 10, 11). The engine decides every grudge, retaliation and carry; this file only keeps
 * the `owed` a game returned (engine simGame with the grudge record on, #379 part 8) until the same two teams meet again,
 * and hands it back as simGame opts.owed. It never edits a result.
 *
 *   pairKey(a, b)             'a-b' with the lower team index first, so both home/away orders share one entry.
 *   owedFor(book, teams)      opts.owed for a game of teams [away, home]: { <team index>: points } from their last
 *                             meeting, or undefined when they have not met (or nothing is owed): no opts.owed = no carry.
 *   recordOwed(book, teams, owed)  a new book with this pair's entry replaced by the game's `owed` (the engine's figure
 *                             already includes what it carried in), zero points dropped; a game with no `owed` (record
 *                             off) leaves the book as it was. The input book is never changed.
 * Data format (book): { 'a-b': { a: points, b: points } }, plain JSON. */
export const pairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

export function owedFor(book, teams) {
  const e = book && book[pairKey(teams[0], teams[1])];
  if (!e) return undefined;
  const out = {};
  for (const t of teams) if (e[t] > 0) out[t] = e[t];
  return Object.keys(out).length ? out : undefined;
}

export function recordOwed(book, teams, owed) {
  if (!owed) return book;
  const key = pairKey(teams[0], teams[1]), next = { ...book }, e = {};
  for (const t of teams.slice().sort((x, y) => x - y)) if (owed[t] > 0) e[t] = owed[t];
  if (Object.keys(e).length) next[key] = e; else delete next[key];
  return next;
}
