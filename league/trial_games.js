/* 一軍 試跑 game replays (#743 part 4). Pure: no imports but replay.js and injuries.js, no clock, no randomness, no DOM, no network (the loader is injected).
 * 試跑 only (rule 24): never the ledger, never cloudball-league. Data format: CC0.
 *
 * File league/site/trial_games.json (written next to season.json by `node league/tools/season_run.mjs --site ... --write` and `--reset`):
 *   { trial: true, engine: { commit, version },          (the same engine as season.json: replays load it from jsDelivr, league/replay.js)
 *     seasons: [ { n, rosters: [ { bat, pit, bench } per TEAMS index ] } ],   (the 一軍 that played season n, slim: no body / ht)
 *     games: [ { day, slot, season, teams: [awayIndex, homeIndex], sp: [awaySP, homeSP], seed, score: [away, home], line: [[away], [home]] } ] }
 * `day` is the night of season.json (counts on across seasons), `slot` the game's index in that night's `games`. One game per line.
 * Optional per game (#379 part 12, only when the run had feud / injury on): `out` ({ <TEAMS index>: names } injured tonight; the
 * replay plays healthyGame of the season rosters, `sp` stays the index into the full pit) and `opts` (extra simGame flags:
 * grudge / retaliate / benchClear / eject / owed / injury). `opts` never replaces teams, starters or rosters.
 *
 *   trialParam(day, slot)             the `t` value '<day>-<slot>'
 *   trialUrl(day, slot)               'play.html?t=<day>-<slot>'
 *   parseTrial(s)                     { day, slot } or null
 *   trialRecord(file, s)              the replay.js record of that game, or null (no file, bad `t`, no such game, no rosters)
 *   trialOpening(file, s, loadEngine) what play.html needs: { rec, opening: { seed, game, trial: s } | null, status, reason } */
import { replayRecord } from './replay.js';
import { healthyGame } from './injuries.js';

export const TRIAL_GAMES_FILE = 'league/site/trial_games.json';
export const T_RE = /^([0-9]{1,5})-([0-9]{1,2})$/;

export const trialParam = (day, slot) => `${day}-${slot}`;
export const trialUrl = (day, slot) => `play.html?t=${trialParam(day, slot)}`;

export function parseTrial(s) {
  const m = typeof s === 'string' ? T_RE.exec(s) : null;
  return m ? { day: Number(m[1]), slot: Number(m[2]) } : null;
}

export function trialRecord(file, s) {
  const t = parseTrial(s);
  if (!t || !file || file.trial !== true || !Array.isArray(file.games) || !Array.isArray(file.seasons)) return null;
  const g = file.games.find(x => x && x.day === t.day && x.slot === t.slot);
  const season = g && file.seasons.find(x => x && x.n === g.season);
  if (!season || !Array.isArray(season.rosters) || !Array.isArray(g.teams)) return null;
  const hg = healthyGame(season.rosters, g.teams, g.sp, g.out && typeof g.out === 'object' ? g.out : undefined);
  const rosters = hg.rosters.map((r, i) => (g.teams.includes(i) ? r : null));
  const extra = g.opts && typeof g.opts === 'object' ? g.opts : {};
  return { seed: g.seed, engine: file.engine, teams: g.teams, decisions: {}, opts: { ...extra, starters: hg.starters, rosters }, result: { score: g.score, line_score: g.line } };
}

/* Only status `ok` gives a picture; any other status gives opening null and the page shows a note (the booth stays silent, as for 二軍). */
export async function trialOpening(file, s, loadEngine) {
  const rec = trialRecord(file, s);
  if (!rec) return { rec: null, opening: null, status: 'unknown', reason: `no 一軍 試跑 game ${s}` };
  const r = await replayRecord(rec, loadEngine);
  if (r.status !== 'ok') return { rec, opening: null, status: r.status, reason: r.reason };
  return { rec, opening: { seed: rec.seed, game: r.game, trial: s }, status: 'ok', reason: '' };
}
