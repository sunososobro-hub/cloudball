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

/* Part 2 (#599): the starting-pitcher rotation. A lineup decision handed to the engine as `opts.starters` (an index into
 * the team's `pit` list, which is what engine/sim/game.js reads); it never touches an outcome (rules 10, 11).
 *
 *   ROTATION_SIZE   five starters, the MLB standard rotation (and the engine's own ROTATION_SIZE).
 *   MIN_REST_DAYS   four full days between two starts of one pitcher, the MLB "regular rest" of a five-man rotation.
 *
 *   rotationOf(pit)                   the indices in `pit` of the team's starters: role 'SP' in roster order, at most
 *                                     ROTATION_SIZE. Fewer than ROTATION_SIZE throws (the rest rule could not hold).
 *   newRotation(teamIds)              empty record: nobody has started yet.
 *   restDays(rot, teamId, idx, day)   full days since his last start (day - last - 1); Infinity if he has not started.
 *   pickStarter(rot, teamId, pit, day)  tonight's starter: among the rotation, those with at least MIN_REST_DAYS, the
 *                                     most rested; a tie (two fresh arms) goes to rotation order. Nobody rested throws.
 *   recordStart(rot, teamId, idx, day)  writes the start; one start per team per day (a second one throws).
 * `day` is a whole-number calendar day (a season night is one day); same calls, same answers. */
export const ROTATION_SIZE = 5;
export const MIN_REST_DAYS = 4;

export function rotationOf(pit) {
  const idx = (pit || []).map((p, i) => (p.role === 'SP' ? i : -1)).filter(i => i >= 0).slice(0, ROTATION_SIZE);
  if (idx.length < ROTATION_SIZE) throw new Error(`rotationOf: need ${ROTATION_SIZE} starters (role SP), got ${idx.length}`);
  return idx;
}

export function newRotation(teamIds) {
  const last = {};
  for (const id of teamIds) last[id] = {};
  return { last, days: Object.fromEntries(teamIds.map(id => [id, -1])) };
}

export function restDays(rot, teamId, idx, day) {
  const l = rot.last[teamId];
  if (!l) throw new Error(`restDays: unknown team ${teamId}`);
  return idx in l ? day - l[idx] - 1 : Infinity;
}

export function pickStarter(rot, teamId, pit, day) {
  let best = -1, bestRest = -1;
  for (const i of rotationOf(pit)) {
    const r = restDays(rot, teamId, i, day);
    if (r >= MIN_REST_DAYS && r > bestRest) { best = i; bestRest = r; }
  }
  if (best < 0) throw new Error(`pickStarter: no starter of ${teamId} has ${MIN_REST_DAYS} days of rest on day ${day}`);
  return best;
}

export function recordStart(rot, teamId, idx, day) {
  if (!rot.last[teamId]) throw new Error(`recordStart: unknown team ${teamId}`);
  if (!Number.isInteger(day) || day <= rot.days[teamId]) throw new Error(`recordStart: ${teamId} already started a pitcher on day ${rot.days[teamId]}, got day ${day}`);
  rot.last[teamId][idx] = day; rot.days[teamId] = day;
  return rot;
}

/* Part 3 (#599): the final. Pure like the rest: it reads the standings and the final's results, plays nothing.
 *
 *   finalSeeds(table)              [top, second] of rank(table): the two teams that meet in the final.
 *   finalHome(seeds, game)         the host of final game 0, 1, 2: the top seed hosts games 1 and 3 (indices 0, 2).
 *   seriesState(seeds, games)      games = [{ home, away, homeRuns, awayRuns }] played so far; returns
 *                                  { wins: { id: n }, winner: id | null, next: index of the next game | null }.
 *                                  Best of FINAL_BEST_OF: the first to FINAL_WINS wins, so exactly 2 or 3 games.
 *                                  A game of two other teams, a tie, or a game after the winner is known throws. */
export const FINAL_BEST_OF = 3;
export const FINAL_WINS = (FINAL_BEST_OF + 1) / 2;

export function finalSeeds(table) {
  const r = rank(table);
  if (r.length < 2) throw new Error('finalSeeds: need two teams');
  return [r[0], r[1]];
}

export function finalHome(seeds, game) {
  if (!Number.isInteger(game) || game < 0 || game >= FINAL_BEST_OF) throw new Error(`finalHome: game ${game} is outside the best of ${FINAL_BEST_OF}`);
  return game % 2 === 0 ? seeds[0] : seeds[1];
}

export function seriesState(seeds, games) {
  const wins = { [seeds[0]]: 0, [seeds[1]]: 0 };
  let winner = null;
  games.forEach((g, i) => {
    if (winner) throw new Error(`seriesState: game ${i + 1} after ${winner} had won`);
    if (!(g.home in wins) || !(g.away in wins) || g.home === g.away) throw new Error(`seriesState: game ${i + 1} is not between ${seeds[0]} and ${seeds[1]}`);
    if (g.homeRuns === g.awayRuns) throw new Error(`seriesState: game ${i + 1} is tied`);
    const w = g.homeRuns > g.awayRuns ? g.home : g.away;
    if (++wins[w] >= FINAL_WINS) winner = w;
  });
  return { wins, winner, next: winner ? null : games.length };
}
