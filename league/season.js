/* Season-0 loop, part 1 (#599): the schedule and the standings. Pure: no DOM, network, clock or randomness (rules 10, 11);
 * nothing here plays a game or edits an outcome, it only says who meets tonight and reads results that already exist.
 * Data format: CC0.
 *
 *   makeSchedule(teamIds)           the whole season: array of nights, each an array of { home, away }. Four teams, six
 *                                   pairings twice = 12 games on SEASON_NIGHTS nights, two games a night, nobody twice in
 *                                   a night; the second meeting of a pairing swaps home and away. Same input, same output.
 *   tonight(schedule, night)        the games of that night (0-based), [] past the end.
 *   newStandings(teamIds)           empty table { teams: { id: { w, l, rf, ra } }, games: [] }.
 *   applyResult(table, game)        game { home, away, homeRuns, awayRuns }; adds it in place; returns the table.
 *                                   A tie or a team not in the table throws (baseball has a winner).
 *   rank(table)                     team ids best first: wins, then head-to-head wins among the teams still level, then
 *                                   run difference, then TIE_ORDER (the id in table order, so the answer never depends on
 *                                   sort stability or a clock).
 */
export const SEASON_TEAMS = 4;
export const GAMES_PER_PAIRING = 2;
export const GAMES_PER_NIGHT = SEASON_TEAMS / 2;
export const SEASON_NIGHTS = (SEASON_TEAMS - 1) * GAMES_PER_PAIRING;   /* 6 */

export function makeSchedule(teamIds) {
  if (!Array.isArray(teamIds) || teamIds.length !== SEASON_TEAMS || new Set(teamIds).size !== SEASON_TEAMS)
    throw new Error(`makeSchedule needs ${SEASON_TEAMS} different team ids`);
  /* circle method: team 0 stays, the other three rotate; each round pairs the two halves */
  const [fixed, ...rest] = teamIds;
  const rounds = [];
  for (let r = 0; r < SEASON_TEAMS - 1; r++) {
    const ring = [fixed, ...rest.slice(r).concat(rest.slice(0, r))];
    const games = [];
    for (let i = 0; i < GAMES_PER_NIGHT; i++) {
      const a = ring[i], b = ring[SEASON_TEAMS - 1 - i];
      games.push(r % 2 === 0 ? { home: a, away: b } : { home: b, away: a });
    }
    rounds.push(games);
  }
  /* first meetings, then every pairing again with home and away swapped */
  const second = rounds.map(g => g.map(({ home, away }) => ({ home: away, away: home })));
  return rounds.concat(second);
}

export function tonight(schedule, night) { return schedule[night] || []; }

export function newStandings(teamIds) {
  const teams = {};
  for (const id of teamIds) teams[id] = { w: 0, l: 0, rf: 0, ra: 0 };
  return { teams, order: teamIds.slice(), games: [] };
}

export function applyResult(table, { home, away, homeRuns, awayRuns }) {
  const h = table.teams[home], a = table.teams[away];
  if (!h || !a || home === away) throw new Error(`applyResult: bad teams ${home} v ${away}`);
  if (!Number.isInteger(homeRuns) || !Number.isInteger(awayRuns) || homeRuns < 0 || awayRuns < 0) throw new Error('applyResult: runs must be whole numbers');
  if (homeRuns === awayRuns) throw new Error('applyResult: a game has a winner');
  const homeWon = homeRuns > awayRuns;
  h.rf += homeRuns; h.ra += awayRuns; a.rf += awayRuns; a.ra += homeRuns;
  h[homeWon ? 'w' : 'l']++; a[homeWon ? 'l' : 'w']++;
  table.games.push({ home, away, homeRuns, awayRuns });
  return table;
}

function headToHead(table, ids) {
  const wins = Object.fromEntries(ids.map(id => [id, 0]));
  for (const g of table.games) {
    if (!(g.home in wins) || !(g.away in wins)) continue;
    wins[g.homeRuns > g.awayRuns ? g.home : g.away]++;
  }
  return wins;
}

export function rank(table) {
  const pos = id => table.order.indexOf(id), t = table.teams;
  const byWins = table.order.slice().sort((x, y) => t[y].w - t[x].w || pos(x) - pos(y));
  const out = [];
  for (let i = 0; i < byWins.length;) {
    let j = i;
    while (j < byWins.length && t[byWins[j]].w === t[byWins[i]].w) j++;
    const group = byWins.slice(i, j), h2h = headToHead(table, group);
    group.sort((x, y) => h2h[y] - h2h[x] || (t[y].rf - t[y].ra) - (t[x].rf - t[x].ra) || pos(x) - pos(y));
    out.push(...group);
    i = j;
  }
  return out;
}
