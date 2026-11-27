/* 二軍 game records (#600 part 1): one small record per 二軍 game, replayable with the engine of its own commit.
 * Pure: no imports, no clock, no randomness, no DOM, no network (the loader is injected). Never the ledger (rule 24):
 * the records live in the site data file `league/site/farm_games.json` (an array, oldest first). Data format: CC0.
 *
 * A record is the shape league/replay.js reads, plus three fields of its own:
 *   id            'f-<n>' (unique in the file; the page opens it as play.html?f=<id>)
 *   tier          2
 *   day           season night (0-based) the game was played
 *   seed, engine { commit, version }, teams [awayIndex, homeIndex], decisions {}, opts (lineups: `opts.rosters`)
 *   result { score: [away, home], line_score }
 * 二軍 games have no fan votes, so `decisions` stays {}; the lineups of a 二軍 side go in `opts.rosters` (same shape as
 * league/players.js ROSTERS), the default rosters are used when `opts` has none.
 *
 *   farmRecord(fields)                 build + validate a record (throws a named reason)
 *   farmProblem(rec)                   named reason why a record is not a 二軍 record, or null
 *   findFarm(list, id)                 the record with that id, or null
 *   replayFarm(list, id, loadEngine)   replay.js replayRecord of that record; { status: 'unknown' } for a missing id
 *   farmUrl(id)                        'play.html?f=<id>'
 *   farmOpening(list, id, loadEngine)  what play.html needs: { rec, opening: { seed, game, farm: id } | null, status, reason }
 *   farmGameOn(list, team, night)      the record of team index `team` (away or home) on that night (0-based), or null (#600 part 3)
 *   recordBytes(rec)                   size of the record as written to the file (UTF-8 bytes of its JSON line)
 *   yearBytes(perGame, games)          estimated size of `games` records */
import { replayRecord, recordProblem } from './replay.js';

export const FARM_FILE = 'league/site/farm_games.json';
export const FARM_TIER = 2;
export const ID_RE = /^f-[0-9]{1,6}$/;

export const farmUrl = id => `play.html?f=${encodeURIComponent(id)}`;

export function farmProblem(rec) {
  if (!rec || typeof rec !== 'object') return 'record is not an object';
  if (typeof rec.id !== 'string' || !ID_RE.test(rec.id)) return 'id missing or not f-<n>';
  if (rec.tier !== FARM_TIER) return 'tier is not 2';
  if (!Number.isInteger(rec.day) || rec.day < 0) return 'day missing or not a night number';
  if (rec.decisions !== undefined && !(rec.decisions && typeof rec.decisions === 'object' && Object.keys(rec.decisions).length === 0)) return '二軍 games have no fan decisions';
  return recordProblem(rec);
}

export function farmRecord({ id, day, seed, commit, version, teams = [0, 1], opts, score, line }) {
  const rec = { id, tier: FARM_TIER, day, seed, engine: { commit, version }, teams, decisions: {} };
  if (opts && Object.keys(opts).length) rec.opts = opts;
  rec.result = { score, line_score: line };
  const why = farmProblem(rec);
  if (why) throw new Error(`farm record ${id}: ${why}`);
  return rec;
}

export const farmGameOn = (list, team, night) => (Array.isArray(list) && Number.isInteger(team) && team >= 0 && list.find(r => r && r.day === night && Array.isArray(r.teams) && r.teams.includes(team) && !farmProblem(r))) || null;

export const findFarm = (list, id) => (Array.isArray(list) && list.find(r => r && r.id === id)) || null;

export async function replayFarm(list, id, loadEngine) {
  const rec = findFarm(list, id);
  if (!rec) return { status: 'unknown', reason: `no 二軍 game ${id}` };
  const why = farmProblem(rec);
  if (why) return { status: 'invalid', reason: why };
  return replayRecord(rec, loadEngine);
}

/* play.html?f=<id>: the page plays `opening` exactly like the frozen game (window.OPENING). Only status `ok` gives a picture;
 * any other status gives opening null and the page shows `reason`. Subtitles only: a 二軍 seed has no clip script, so the booth stays silent. */
export async function farmOpening(list, id, loadEngine) {
  const r = await replayFarm(list, id, loadEngine);
  if (r.status !== 'ok') return { rec: findFarm(list, id), opening: null, status: r.status, reason: r.reason };
  const rec = findFarm(list, id);
  return { rec, opening: { seed: rec.seed, game: r.game, farm: id }, status: 'ok', reason: '' };
}

export const recordBytes = rec => new TextEncoder().encode(JSON.stringify(rec)).length;
export const yearBytes = (perGame, games) => Math.round(perGame * games);
