/* play.html?g=<season>-<id> (#592): any official ledger game, replayed in 3D with the engine of its own commit (league/replay.js).
 * Pure: the only import is ./replay.js; no clock, no randomness, no DOM; the record loader is injected (the page fetches
 * the ledger file, rule 24: read-only). Silent on purpose: a ledger seed has no commentary script, so the booth never starts,
 * no browser voice speaks, and the play-by-play (names included) shows only as the on-screen feed. Recorded clips, when they
 * exist later, are wired in by the booth, not here.
 *
 *   gameParam(s)                       { season, id } for '<season>-<id>' (digits only), else null
 *   gameUrl(season, id)                'play.html?g=<season>-<id>'
 *   gameOpening(param, fetchRecord, loadEngine)
 *        fetchRecord(season, id) -> the ledger record, or null for a 404 (any other failure throws)
 *        -> { rec, opening: { seed, game, ledger: '<season>-<id>' } | null, status, reason }   (opening only on status 'ok') */
import { replayRecord } from './replay.js';

export const PARAM_RE = /^([0-9]{1,3})-([0-9]{1,6})$/;

export function gameParam(s) {
  const m = typeof s === 'string' ? PARAM_RE.exec(s) : null;
  return m ? { season: m[1], id: Number(m[2]) } : null;
}

export const gameUrl = (season, id) => `play.html?g=${season}-${id}`;

export async function gameOpening(param, fetchRecord, loadEngine) {
  const p = gameParam(param);
  if (!p) return { rec: null, opening: null, status: 'invalid', reason: 'g is not <season>-<id>' };
  let rec;
  try { rec = await fetchRecord(p.season, p.id); } catch (e) { return { rec: null, opening: null, status: 'unavailable', reason: `ledger: ${(e && e.message) || e}` }; }
  if (rec === null || rec === undefined) return { rec: null, opening: null, status: 'unknown', reason: `no ledger game ${param}` };
  const r = await replayRecord(rec, loadEngine);
  if (r.status !== 'ok') return { rec, opening: null, status: r.status, reason: r.reason };
  return { rec, opening: { seed: rec.seed, game: r.game, ledger: param }, status: 'ok', reason: '' };
}
