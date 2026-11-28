/* Plays one whole season-0 from a seed and prints it (#599 part 3). Hand-run, engine only, no network, writes nothing.
 *
 *   node league/tools/season_run.mjs [--seed N] [--json] [--farm [--commit sha] [--write]]
 *   node league/tools/season_run.mjs --site --start YYYY-MM-DD [--seed N] [--seasons K] [--commit sha] [--write]   (#743/#749: league/site/season.json, 試跑)
 * --site chains seasons (#749): season k+1 starts the night after season k's final; between seasons the display league
 * (league/site/players.json) goes through advanceYear + seasonEnd. Default K = enough seasons to cover MIN_SITE_DAYS nights.
 *
 * League: the 4 factory teams (league/players.js ROSTERS), no fan file and no 二軍: the league runs with zero fan players
 * (owner 2026-11-27). Season = league/season.js: the 12-game schedule, a starter per team and night by rest days (the lineup
 * decision handed to the engine as opts.starters), standings, then the best-of-three final of the top two. Every game is
 * played by the engine; nothing here edits a score (rule 10). A game the engine ends tied after MAX_INNINGS is played again
 * with the next sub-seed, at most TIE_REPLAYS times. Nothing is written to cloudball-league (rule 24). */
import { fileURLToPath } from 'node:url';
import { simGame, TEAMS, ROSTERS } from '../../engine/index.js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import * as S from '../season.js';
import { ENGINE_VERSION, boxFromStream } from '../../engine/index.js';
import { farmRecord } from '../farm.js';
import { OUT as FARM_OUT, serialize as farmSerialize } from './farm_record.mjs';
import { siteFile } from '../season_site.js';
import { advanceYear, seasonEnd } from '../turnover.js';
import { siteRoster } from '../site_roster.js';

export const SITE_OUT = fileURLToPath(new URL('../site/season.json', import.meta.url));
/* one night per line, so a new season reads as a small diff */
export const siteSerialize = f => JSON.stringify({ ...f, nights: [] }).replace('"nights":[]', `"nights":[\n${f.nights.map(n => '  ' + JSON.stringify(n)).join(',\n')}\n]`) + '\n';

export const PLAYERS_IN = fileURLToPath(new URL('../site/players.json', import.meta.url));
export const MIN_SITE_DAYS = 90;                  /* the 試跑 file covers at least this many nights (#749) */
export const SEASON_SEED_STEP = 1000;             /* season k plays seed + (k-1) * step: its game seeds (seed*1000 + ...) never meet another season's */
export const TIE_REPLAYS = 10;
/* The rosters the site shows, as the engine wants them (#748 part 2): one { bat, pit, bench } per team in TEAMS order, tier 1 = 一軍, 2 = 二軍. */
export const siteRosters = (players, tier) => TEAMS.map(t => siteRoster(players, t.id, tier));
const GAME_SEED_STEP = 10, SUBSEED_STEP = 1;      /* seed of a game = seed*1000 + day*10 + slot (+ replay number) */
const FINAL_SLOT = 0;

export function runSeason(seed, { rosters } = {}) {
  const R = rosters || ROSTERS;   /* default = the factory ROSTERS: seed 704 and every older check stay byte for byte */
  const ids = TEAMS.map(t => t.id), ix = Object.fromEntries(ids.map((id, i) => [id, i]));
  const schedule = S.makeSchedule(ids), table = S.newStandings(ids), rot = S.newRotation(ids), log = [];
  function play(day, slot, g, phase) {
    const sides = [g.away, g.home];
    const sp = sides.map(id => S.pickStarter(rot, id, R[ix[id]].pit, day));
    sides.forEach((id, k) => S.recordStart(rot, id, sp[k], day));
    for (let n = 0; n <= TIE_REPLAYS; n++) {
      const game = simGame((seed * 1000 + day * GAME_SEED_STEP + slot + n * SUBSEED_STEP * 100000) >>> 0, {}, { teams: sides.map(id => ix[id]), starters: sp, ...(rosters ? { rosters } : {}) });
      const [awayRuns, homeRuns] = game.final.sc;
      if (awayRuns === homeRuns) continue;
      const res = { home: g.home, away: g.away, homeRuns, awayRuns };
      log.push({ day, phase, ...res, starters: sides.map((id, k) => R[ix[id]].pit[sp[k]].name), replays: n });
      return res;
    }
    throw new Error(`season ${seed} day ${day}: still tied after ${TIE_REPLAYS} replays`);
  }
  schedule.forEach((night, day) => night.forEach((g, slot) => S.applyResult(table, play(day, slot, g, 'season'))));
  const fin = S.newFinal(table);
  for (let g = S.nextFinalGame(fin); g; g = S.nextFinalGame(fin)) S.applyFinalResult(fin, play(S.SEASON_NIGHTS + fin.games.length, FINAL_SLOT, g, 'final'));
  return { seed, schedule, standings: S.rank(table).map(id => ({ id, ...table.teams[id] })), final: fin, champion: S.champion(fin), log, rot };
}

/* Chained seasons of the 試跑 (#749): season 1 plays `seed`; after each season the display league (players.json format) is
 * aged a year and goes through seasonEnd with a seed derived from the season seed. Given `players`, each season is played by the 一軍 the
 * site shows at that point (#748 part 2: siteRosters(league, 1)); without it the factory ROSTERS play (rule 10: the engine alone decides results). Each run gets `.season`
 * and (except the last) `.turnover` = { retired, culled, called, signed, released, rookies } counts. Pure but for the engine. */
export const turnoverSeed = (seed, k) => (Math.imul(seed >>> 0, 0x9e3779b1) ^ Math.imul(k, 0x85ebca6b)) >>> 0;
export function runSeasons(seed, { seasons = 0, minDays = MIN_SITE_DAYS, players } = {}) {
  const runs = [];
  let league = players, days = 0;
  for (let k = 1; seasons ? k <= seasons : days < minDays; k++) {
    const run = runSeason(seed + (k - 1) * SEASON_SEED_STEP, league ? { rosters: siteRosters(league, 1) } : {});
    run.season = k; days += new Set(run.log.map(x => x.day)).size; runs.push(run);
    if (seasons ? k < seasons : days < minDays) {
      const r = seasonEnd(advanceYear(league), { seed: turnoverSeed(seed, k) });
      league = r.players;
      run.turnover = Object.fromEntries(['retired', 'culled', 'called', 'signed', 'released', 'rookies'].map(key => [key, r[key].length]));
    }
  }
  return runs;
}

/* 二軍 day runner (#600 part 4): one 二軍 game per 一軍 pairing on every season night, same teams, own seed block
 * (FARM_SEED_BASE keeps them apart from the 一軍 seeds above). The engine plays them; the record keeps seed + commit +
 * result (farm.js). Lineups: the default rosters, or `rosters` (#748 part 2: siteRosters(players, 2), the full 系統 二軍; each record then carries both sides in
 * opts.rosters, an array by team index with null for the teams not playing, so the replay needs nothing else). Ids continue after `startId`. Pure but for the engine. */
export const FARM_SEED_BASE = 1_000_000_000;
export function farmGames(seed, { commit, startId = 1, rosters } = {}) {
  const ids = TEAMS.map(t => t.id), ix = Object.fromEntries(ids.map((id, i) => [id, i])), out = [];
  S.makeSchedule(ids).forEach((night, day) => night.forEach((g, slot) => {
    const teams = [g.away, g.home].map(id => ix[id]), gseed = (FARM_SEED_BASE + seed * 1000 + day * GAME_SEED_STEP + slot) >>> 0;
    const opts = rosters ? { rosters: rosters.map((r, i) => (teams.includes(i) ? r : null)) } : undefined;
    const b = boxFromStream(simGame(gseed, {}, { teams, ...opts }).stream);
    out.push(farmRecord({ id: `f-${startId + out.length}`, day, seed: gseed, commit, version: ENGINE_VERSION, teams, opts, score: b.score, line: b.line }));
  }));
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), seed = a.includes('--seed') ? Number(a[a.indexOf('--seed') + 1]) : 1;
  if (!Number.isInteger(seed)) { console.error('usage: node league/tools/season_run.mjs [--seed N] [--json] [--farm [--commit sha] [--write]]'); process.exit(2); }
  if (a.includes('--site')) {
    const start = a.includes('--start') ? a[a.indexOf('--start') + 1] : '';
    const commit = a.includes('--commit') ? a[a.indexOf('--commit') + 1] : execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    const seasons = a.includes('--seasons') ? Number(a[a.indexOf('--seasons') + 1]) : 0;
    if (!Number.isInteger(seasons) || seasons < 0) { console.error('--seasons must be a whole number >= 1'); process.exit(2); }
    const runs = runSeasons(seed, { seasons, players: JSON.parse(readFileSync(PLAYERS_IN, 'utf8')) });   /* 一軍 = the snapshot's */
    const text = siteSerialize(siteFile(runs, { start, commit, version: ENGINE_VERSION }));
    if (a.includes('--write')) { writeFileSync(SITE_OUT, text); console.log(`wrote ${SITE_OUT}`); } else process.stdout.write(text);
    process.exit(0);
  }
  if (a.includes('--farm')) {   /* node season_run.mjs --seed N --farm [--commit sha] [--write]: the commit must be pushed (jsDelivr) */
    const list = existsSync(FARM_OUT) ? JSON.parse(readFileSync(FARM_OUT, 'utf8')) : [];
    const next = list.reduce((m, r) => Math.max(m, Number(String(r.id).slice(2)) || 0), 0) + 1;
    const commit = a.includes('--commit') ? a[a.indexOf('--commit') + 1] : execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    const recs = farmGames(seed, { commit, startId: next, rosters: siteRosters(JSON.parse(readFileSync(PLAYERS_IN, 'utf8')), 2) });   /* 二軍 = the snapshot's full 二軍 */
    for (const r of recs) console.log(JSON.stringify(r));
    if (a.includes('--write')) { writeFileSync(FARM_OUT, farmSerialize(list.concat(recs))); console.log(`wrote ${recs.length} records (f-${next}..)`); }
    process.exit(0);
  }
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
