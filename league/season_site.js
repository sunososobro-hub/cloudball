/* 試跑 seasons on the front page (#743 part 1, chained seasons #749). Pure: no DOM, network, clock or randomness (rules 10, 11).
 * 試跑 only: nothing here is official and nothing is written to cloudball-league (rule 24).
 *
 * File league/site/season.json (written by `node league/tools/season_run.mjs --site --start YYYY-MM-DD [--seed N] --write`):
 *   { trial: true, seed, start: 'YYYY-MM-DD', engine: { commit, version },
 *     seasons: [ { n, seed, firstDay, nights, champion, turnover? } ],
 *     nights: [ { season, day, phase: 'season'|'final', games: [ { home, away, starters: [away SP, home SP], score: [away, home] } ] } ],
 *     champion }                                  (champion = the last season's)
 * A night is one calendar day (Asia/Taipei) from `start`; `day` counts on across seasons, season k+1 opens the night after
 * season k's final. A file without `season` / `seasons` (the first #743 file) is one season. The 二軍 plays the same pairings (#600 part 4).
 *
 *   siteFile(runs, { start, commit, version })  the file object from runSeason() / runSeasons() of tools/season_run.mjs (one run or a list).
 *   dayIndex(start, today)                     whole days from start to today ('YYYY-MM-DD' both); null if either is bad.
 *   seasonAt(file, today)                      what the front page shows today, or null when the file is missing / bad:
 *     { state: 'before'|'on'|'over', day (0-based night of today in the whole file), total, tonight (games, no score),
 *       season (number of today's season; the last one when over), seasonDay (0-based night of today inside it), seasonTotal (its nights),
 *       lastSeason (season of last night, null if none), last (last night's games with score, [] if none),
 *       standings [{ id, w, l, rf, ra }] best first, of today's season only (zero on its first night), champion|null }
 *     Only nights before today count: tonight's scores stay hidden even though the file holds them. */
import * as S from './season.js';

const DAY_MS = 86400000, DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function siteFile(runs, { start, commit = '', version = '' } = {}) {
  if (!DATE_RE.test(String(start))) throw new Error('siteFile: start must be YYYY-MM-DD');
  const list = Array.isArray(runs) ? runs : [runs], nights = [], seasons = []; let offset = 0;
  list.forEach((run, i) => {
    const mine = [];
    for (const g of run.log) {
      let n = mine.find(x => x.day === offset + g.day);
      if (!n) mine.push(n = { season: i + 1, day: offset + g.day, phase: g.phase, games: [] });
      n.games.push({ home: g.home, away: g.away, starters: g.starters.slice(), score: [g.awayRuns, g.homeRuns] });
    }
    mine.sort((a, b) => a.day - b.day);
    seasons.push({ n: i + 1, seed: run.seed, firstDay: offset, nights: mine.length, champion: run.champion, ...(run.turnover ? { turnover: run.turnover } : {}) });
    nights.push(...mine); offset += mine.length;
  });
  return { trial: true, seed: list[0].seed, start, engine: { commit, version }, seasons, nights, champion: list[list.length - 1].champion };
}

export function dayIndex(start, today) {
  if (!DATE_RE.test(String(start)) || !DATE_RE.test(String(today))) return null;
  const a = Date.parse(start + 'T00:00:00Z'), b = Date.parse(today + 'T00:00:00Z');
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / DAY_MS) : null;
}

const okGame = g => g && typeof g.home === 'string' && typeof g.away === 'string' && Array.isArray(g.score) && g.score.length === 2;
const okFile = f => f && f.trial === true && Array.isArray(f.nights) && f.nights.length && f.nights.every(n => Number.isInteger(n.day) && Array.isArray(n.games) && n.games.every(okGame));

export function seasonAt(file, today) {
  if (!okFile(file)) return null;
  const idx = dayIndex(file.start, today);
  if (idx == null) return null;
  const nights = file.nights.slice().sort((a, b) => a.day - b.day), total = nights[nights.length - 1].day + 1;
  const seasonOf = n => (Number.isInteger(n.season) ? n.season : 1);
  const tonightN = nights.find(n => n.day === idx), lastN = nights.find(n => n.day === idx - 1);
  const season = idx < 0 ? seasonOf(nights[0]) : seasonOf(tonightN || nights[nights.length - 1]);
  const mine = nights.filter(n => seasonOf(n) === season);
  const ids = [...new Set(nights.flatMap(n => n.games.flatMap(g => [g.away, g.home])))];
  const table = S.newStandings(ids);
  for (const n of mine) if (n.day < idx && n.phase !== 'final') for (const g of n.games) S.applyResult(table, { home: g.home, away: g.away, homeRuns: g.score[1], awayRuns: g.score[0] });
  const strip = g => ({ home: g.home, away: g.away, starters: Array.isArray(g.starters) ? g.starters.slice() : [] });
  return {
    state: idx < 0 ? 'before' : idx >= total ? 'over' : 'on',
    day: idx, total,
    season, seasonDay: idx - mine[0].day, seasonTotal: mine.length, lastSeason: lastN ? seasonOf(lastN) : null,
    phase: tonightN ? tonightN.phase : null,
    tonight: tonightN ? tonightN.games.map(strip) : [],
    last: lastN ? lastN.games.map(g => ({ ...strip(g), score: g.score.slice(), phase: lastN.phase })) : [],
    standings: S.rank(table).map(id => ({ id, ...table.teams[id] })),
    champion: idx >= total ? file.champion || null : null,
  };
}
