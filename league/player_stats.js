/* 我的球員 season line (#804 part 1). Pure: no DOM, network, clock or randomness. 試跑 only (rule 24): nothing here is official.
 * The numbers are the engine's own box scores (engine/stats/box.js, rule 10): league/tools/player_stats.mjs plays every recorded
 * 試跑 game again, checks the score against the record and writes one row per player per game. The page only adds rows up.
 *
 * File league/site/player_stats.json:
 *   { trial: true, engine: { commit, version }, cols: COLS, players: { <player id>: [ [season, day, pa, ab, h, d, t, hr, bb, hbp, sf], ... ] } }
 * `day` = night of the whole 試跑 file (0-based, as season.json); a row counts on the page only once that night is before today
 * (the same reveal as the front page). Batters only; pitchers need pitching lines the engine box does not have yet (left in #804).
 *
 *   tally(rows)                       { g, pa, ab, h, tb, hr, bb, hbp, sf, avg, obp, slg } of the rows (rates null while the denominator is 0)
 *   seasonLine(stats, id, season, idx) tally of the id's rows of that season on nights before idx, or null when there is none
 *   rate(x)                           '.275' / '1.000' / '—'
 *   lineText(line)                    '12 場　打席 40　打擊率 .275　上壘率 .350　長打率 .450　全壘打 2' */
export const COLS = ['season', 'day', 'pa', 'ab', 'h', 'd', 't', 'hr', 'bb', 'hbp', 'sf'];
const I = Object.fromEntries(COLS.map((c, i) => [c, i]));

export function tally(rows) {
  const s = { g: 0, pa: 0, ab: 0, h: 0, tb: 0, hr: 0, bb: 0, hbp: 0, sf: 0 };
  for (const r of rows) {
    s.g++; s.pa += r[I.pa]; s.ab += r[I.ab]; s.h += r[I.h]; s.hr += r[I.hr]; s.bb += r[I.bb]; s.hbp += r[I.hbp]; s.sf += r[I.sf];
    s.tb += r[I.h] + r[I.d] + 2 * r[I.t] + 3 * r[I.hr];
  }
  const div = (a, b) => (b > 0 ? a / b : null), obpDen = s.ab + s.bb + s.hbp + s.sf;
  return { ...s, avg: div(s.h, s.ab), obp: div(s.h + s.bb + s.hbp, obpDen), slg: div(s.tb, s.ab) };
}

const okRow = r => Array.isArray(r) && r.length === COLS.length && r.every(Number.isInteger);
export function seasonLine(stats, id, season, idx) {
  const rows = stats && stats.trial === true && stats.players && Array.isArray(stats.players[id]) ? stats.players[id] : [];
  const mine = rows.filter(r => okRow(r) && r[I.season] === season && r[I.day] < idx);
  return mine.length ? tally(mine) : null;
}

export const rate = x => (x == null ? '—' : x >= 1 ? x.toFixed(3) : x.toFixed(3).slice(1));
export const lineText = l => `${l.g} 場　打席 ${l.pa}　打擊率 ${rate(l.avg)}　上壘率 ${rate(l.obp)}　長打率 ${rate(l.slg)}　全壘打 ${l.hr}`;
