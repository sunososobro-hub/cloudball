/* Replay an official ledger record with the engine of its own commit (#590). Pure: no imports, no clock, no DOM.
 * Rule 11 only promises the same game on the same engine commit, so the engine is loaded from jsDelivr at
 * `record.engine.commit` (plain static files, no build step) and the result is compared with the record.
 * Any disagreement returns `mismatch`: the caller then shows the box score of the record only, never a picture.
 *
 * Record fields read here (cloudball-league/games/<season>/<id>.json):
 *   seed            unsigned 32-bit integer
 *   engine.commit   cloudball commit sha (7..40 hex) the game was computed with
 *   teams           [awayIndex, homeIndex] (default [0, 1])
 *   decisions       resolved fan votes (default {})
 *   opts            optional extra simGame options (rosters, starters, pen, ...)
 *   result.score    [away, home]
 *   result.line_score  [[away runs per inning], [home runs per inning]]
 *
 * Statuses: `ok` (game + box), `mismatch` (reason, box of the replay), `invalid` (reason; bad record),
 * `unavailable` (reason; the engine could not be loaded or threw). Only `ok` may be played as a picture. */
export const ENGINE_CDN = 'https://cdn.jsdelivr.net/gh/sunososobro-hub/cloudball@';
export const COMMIT_RE = /^[0-9a-f]{7,40}$/;

export const engineUrl = commit => `${ENGINE_CDN}${commit}/engine/index.js`;

const isInt = x => Number.isInteger(x) && x >= 0;
const isLine = l => Array.isArray(l) && l.length === 2 && l.every(r => Array.isArray(r) && r.every(isInt));

/* Named reason why a record cannot be replayed, or null when it can. */
export function recordProblem(rec) {
  if (!rec || typeof rec !== 'object') return 'record is not an object';
  if (!Number.isInteger(rec.seed) || rec.seed < 0 || rec.seed > 0xffffffff) return 'seed missing or not a uint32';
  const commit = rec.engine && rec.engine.commit;
  if (typeof commit !== 'string' || !COMMIT_RE.test(commit)) return 'engine.commit missing or not a hex sha';
  if (rec.teams !== undefined && !(Array.isArray(rec.teams) && rec.teams.length === 2 && rec.teams.every(isInt))) return 'teams is not [away, home]';
  const res = rec.result;
  if (!res || !Array.isArray(res.score) || res.score.length !== 2 || !res.score.every(isInt)) return 'result.score missing or not [away, home]';
  if (!isLine(res.line_score)) return 'result.line_score missing or not [[away], [home]]';
  return null;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* loadEngine(commit) -> the engine module (simGame, boxFromStream). Default: jsDelivr at that commit. */
export async function replayRecord(rec, loadEngine = commit => import(engineUrl(commit))) {
  const problem = recordProblem(rec);
  if (problem) return { status: 'invalid', reason: problem };
  let game, box;
  try {
    const eng = await loadEngine(rec.engine.commit);
    const opts = Object.assign({}, rec.opts || {}, { teams: rec.teams || [0, 1] });
    game = eng.simGame(rec.seed, rec.decisions || {}, opts);
    box = eng.boxFromStream(game.stream);
  } catch (e) {
    return { status: 'unavailable', reason: `engine ${rec.engine.commit}: ${(e && e.message) || e}` };
  }
  if (!same(box.score, rec.result.score)) return { status: 'mismatch', reason: `score ${box.score.join('-')} != record ${rec.result.score.join('-')}`, box };
  if (!same(box.line, rec.result.line_score)) return { status: 'mismatch', reason: 'line_score differs from record', box };
  return { status: 'ok', game, box };
}
