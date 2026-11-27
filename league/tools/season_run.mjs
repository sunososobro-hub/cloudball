/* Plays one whole season-0 from a seed and prints it (#599 part 3). Hand-run, engine only, no network, writes nothing.
 *
 *   node league/tools/season_run.mjs [--seed N] [--json]
 *
 * League: the 4 factory teams (league/players.js ROSTERS), no fan file and no 二軍: the league runs with zero fan players
 * (owner 2026-11-27). Season = league/season.js: the 12-game schedule, a starter per team and night by rest days (the lineup
 * decision handed to the engine as opts.starters), standings, then the best-of-three final of the top two. Every game is
 * played by the engine; nothing here edits a score (rule 10). A game the engine ends tied after MAX_INNINGS is played again
 * with the next sub-seed, at most TIE_REPLAYS times. Nothing is written to cloudball-league (rule 24). */
import { fileURLToPath } from 'node:url';
import { simGame, TEAMS, ROSTERS } from '../../engine/index.js';
import * as S from '../season.js';

export const TIE_REPLAYS = 10;
const GAME_SEED_STEP = 10, SUBSEED_STEP = 1;      /* seed of a game = seed*1000 + day*10 + slot (+ replay number) */
const FINAL_SLOT = 0;

export function runSeason(seed) {
  const ids = TEAMS.map(t => t.id), ix = Object.fromEntries(ids.map((id, i) => [id, i]));
  const schedule = S.makeSchedule(ids), table = S.newStandings(ids), rot = S.newRotation(ids), log = [];
  function play(day, slot, g, phase) {
    const sides = [g.away, g.home];
    const sp = sides.map(id => S.pickStarter(rot, id, ROSTERS[ix[id]].pit, day));
    sides.forEach((id, k) => S.recordStart(rot, id, sp[k], day));
    for (let n = 0; n <= TIE_REPLAYS; n++) {
      const game = simGame((seed * 1000 + day * GAME_SEED_STEP + slot + n * SUBSEED_STEP * 100000) >>> 0, {}, { teams: sides.map(id => ix[id]), starters: sp });
      const [awayRuns, homeRuns] = game.final.sc;
      if (awayRuns === homeRuns) continue;
      const res = { home: g.home, away: g.away, homeRuns, awayRuns };
      log.push({ day, phase, ...res, starters: sides.map((id, k) => ROSTERS[ix[id]].pit[sp[k]].name), replays: n });
      return res;
    }
    throw new Error(`season ${seed} day ${day}: still tied after ${TIE_REPLAYS} replays`);
  }
  schedule.forEach((night, day) => night.forEach((g, slot) => S.applyResult(table, play(day, slot, g, 'season'))));
  const fin = S.newFinal(table);
  for (let g = S.nextFinalGame(fin); g; g = S.nextFinalGame(fin)) S.applyFinalResult(fin, play(S.SEASON_NIGHTS + fin.games.length, FINAL_SLOT, g, 'final'));
  return { seed, schedule, standings: S.rank(table).map(id => ({ id, ...table.teams[id] })), final: fin, champion: S.champion(fin), log, rot };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), seed = a.includes('--seed') ? Number(a[a.indexOf('--seed') + 1]) : 1;
  if (!Number.isInteger(seed)) { console.error('usage: node league/tools/season_run.mjs [--seed N] [--json]'); process.exit(2); }
  const r = runSeason(seed);
  if (a.includes('--json')) console.log(JSON.stringify({ ...r, rot: undefined }, null, 1));
  else {
    console.log(`season 0, seed ${seed}`);
    for (const x of r.log) console.log(`${x.phase === 'final' ? 'final ' : 'night '}${String(x.day + 1).padStart(2)}  ${x.away} ${x.awayRuns} @ ${x.home} ${x.homeRuns}   starters ${x.starters.join(' / ')}${x.replays ? `  (tied ${x.replays}x, replayed)` : ''}`);
    console.log('standings:');
    for (const t of r.standings) console.log(`  ${t.id}  ${t.w}-${t.l}  RF ${t.rf} RA ${t.ra}`);
    console.log(`final: ${r.final.seeds.join(' v ')}, ${r.final.games.length} games`);
    console.log(`champion: ${r.champion}`);
  }
}
