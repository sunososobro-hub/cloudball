/* Ledger reader (#589). Lists official games of cloudball-league by probing
 * games/<season>/<id>.json with sequential ids from 1 until the first 404 (no index file, rule 24: read-only).
 * Pure: no imports, no clock, no randomness, no DOM. The network is injected as `fetchJson(url)`, which resolves
 * to the parsed JSON, or to null for a 404 (any other failure must throw). At most N+1 requests for N games. */
export const LEDGER_BASE = 'https://raw.githubusercontent.com/sunososobro-hub/cloudball-league/main';

export const ledgerUrl = (season, id, base = LEDGER_BASE) => `${base}/games/${season}/${id}.json`;

/* null when the record can be replayed, else the reason (a string naming the missing field). */
export function rejectReason(rec) {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return 'record is not an object';
  if (!rec.engine || typeof rec.engine.commit !== 'string' || !rec.engine.commit) return 'missing engine.commit';
  if (!Number.isFinite(rec.seed)) return 'missing seed';
  return null;
}

/* -> { games: [{ id, record }] in id order, rejected: [{ id, reason }] }. A rejected id still counts as present. */
export async function listGames(fetchJson, season, { base = LEDGER_BASE } = {}) {
  const games = [], rejected = [];
  for (let id = 1; ; id++) {
    const rec = await fetchJson(ledgerUrl(season, id, base));
    if (rec === null) break;
    const reason = rejectReason(rec);
    if (reason) rejected.push({ id, reason });
    else games.push({ id, record: rec });
  }
  return { games, rejected };
}
