/* Plays one whole season-0 from a seed (#599 part 3): schedule, tonight's starters, standings, the final, the champion.
 * Hand-run, seeded, engine only; reads no file and writes none (nothing goes to cloudball-league, rule 24; no paid call,
 * rule 17). The league is the factory 一軍 of the engine, so it needs no fan file and no 二軍 (owner principle 2026-11-27).
 *
 *   node league/tools/season_run.mjs [--seed N]        (default seed 1)
 *
 * playSeason(seed) -> { schedule, games, standings, rank, final: { seeds, games, wins, winner }, champion }.
 * `games` has one entry per game: { day, stage: 'season'|'final', home, away, starters: [away, home] (names), homeRuns, awayRuns }.
 * Starters are a lineup decision (league/season.js pickStarter, rules 10, 11); the engine seed of a game is a mix of the
 * season seed, the day and the slot. Same seed + same engine commit = same season, byte for byte. */
import { fileURLToPath } from 'node:url';
import { simGame, TEAMS, ROSTERS } from '../../engine/index.js';
import * as S from '../season.js';

export const DEFAULT_SEED = 1;
const DAY_SEED_STEP = 10, SEASON_SEED_STEP = 1000;   /* engine seed = seed * 1000 + day * 10 + slot */

export function playSeason(seed = DEFAULT_SEED) {
  const ids = TEAMS.map(t => t.id), ix = Object.fromEntries(ids.map((id, i) => [id, i]));
  const schedule = S.makeSchedule(ids), rot = S.newRotation(ids), table = S.newStandings(ids), games = [];
  const play = (day, slot, stage, home, away) => {
    const sp = [away, home].map(id => S.pickStarter(rot, id, ROSTERS[ix[id]].pit, day));
    [away, home].forEach((id, k) => S.recordStart(rot, id, sp[k], day));
    const g = simGame(((seed * SEASON_SEED_STEP) + day * DAY_SEED_STEP + slot) >>> 0, {}, { teams: [ix[away], ix[home]], starters: sp });
    const [awayRuns, homeRuns] = g.final.sc;
    const row = { day, stage, home, away, starters: [away, home].map((id, k) => ROSTERS[ix[id]].pit[sp[k]].name), homeRuns, awayRuns };
    games.push(row);
    return row;
  };
  schedule.forEach((night, day) => night.forEach((g, slot) => S.applyResult(table, play(day, slot, 'season', g.home, g.away))));
  const seeds = S.finalSeeds(table), series = [];
  let state = S.seriesState(seeds, series);
  while (!state.winner) {
    const home = S.finalHome(seeds, state.next), away = seeds.find(id => id !== home);
    series.push(play(S.SEASON_NIGHTS + state.next, 0, 'final', home, away));
    state = S.seriesState(seeds, series);
  }
  return { schedule, games, standings: table, rank: S.rank(table), final: { seeds, games: series, wins: state.wins, winner: state.winner }, champion: state.winner };
}

function report(r) {
  const name = id => (TEAMS.find(t => t.id === id) || {}).name || id;
  const out = [];
  out.push('SCHEDULE');
  r.schedule.forEach((n, d) => out.push(`  night ${d + 1}: ` + n.map(g => `${g.away} @ ${g.home}`).join(' | ')));
  out.push('GAMES (starters: away / home)');
  for (const g of r.games) out.push(`  ${g.stage === 'final' ? 'final' : 'night'} ${g.day + 1}: ${g.away} ${g.awayRuns} @ ${g.home} ${g.homeRuns}   ${g.starters[0]} / ${g.starters[1]}`);
  out.push('STANDINGS (W-L, RF-RA)');
  r.rank.forEach((id, i) => { const t = r.standings.teams[id]; out.push(`  ${i + 1}. ${id} ${name(id)}  ${t.w}-${t.l}  ${t.rf}-${t.ra}`); });
  out.push(`FINAL ${r.final.seeds.join(' v ')}: ${r.final.seeds.map(id => `${id} ${r.final.wins[id]}`).join(', ')}`);
  out.push(`CHAMPION ${r.champion} ${name(r.champion)}`);
  return out.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--seed'), seed = i > 0 ? Number(process.argv[i + 1]) : DEFAULT_SEED;
  if (!Number.isInteger(seed) || seed < 0) { console.error('usage: node league/tools/season_run.mjs [--seed N]'); process.exit(2); }
  console.log(report(playSeason(seed)));
}
