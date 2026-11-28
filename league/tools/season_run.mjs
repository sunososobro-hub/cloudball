/* Plays one whole season-0 from a seed and prints it (#599 part 3). Hand-run, engine only, no network, writes nothing.
 *
 *   node league/tools/season_run.mjs [--seed N] [--json] [--farm [--commit sha] [--write [--replace]]]   (--farm: the 二軍 of league/site/players.json)
 *   node league/tools/season_run.mjs --site --start YYYY-MM-DD [--seed N] [--seasons K] [--days N] [--commit sha] [--write]   (#743/#749: league/site/season.json, 試跑)
 *   node league/tools/season_run.mjs --reset --start YYYY-MM-DD [--seed N] [--seasons K] [--commit sha] [--write]   (#750: the owner's start)
 * --reset = the official start: season.json is played again from day 0 on `start` (no night before it, clean standings) and
 * farm_games.json loses every trial record (ids restart at f-1). players.json and the fan players (D1) are never touched.
 * --site chains seasons (#749): season k+1 starts the night after season k's final; between seasons the display league
 * (league/site/players.json) goes through advanceYear + seasonEnd. Default K = enough seasons to cover MIN_SITE_DAYS nights; --days N covers N nights instead (#743 part 3, the refill: same
 * seed + start + commit rewrites the same nights and adds more; a new commit replays everything, so refill only before the start or on an unchanged engine).
 *
 * League: the 4 teams; default rosters = the factory ROSTERS (league/players.js), --site / --farm play the rosters of league/site/players.json (#748); no fan file: the league runs with zero fan players
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
import { owedFor, recordOwed } from '../grudges.js';
import { recordInjuries, outOn, pickHealthyStarter, healthyGame } from '../injuries.js';

export const SITE_OUT = fileURLToPath(new URL('../site/season.json', import.meta.url));
/* one night per line, so a new season reads as a small diff */
export const siteSerialize = f => JSON.stringify({ ...f, nights: [] }).replace('"nights":[]', `"nights":[\n${f.nights.map(n => '  ' + JSON.stringify(n)).join(',\n')}\n]`) + '\n';

export const PLAYERS_IN = fileURLToPath(new URL('../site/players.json', import.meta.url));
export const MIN_SITE_DAYS = 90;                  /* the 試跑 file covers at least this many nights (#749) */
export const SEASON_SEED_STEP = 1000;             /* season k plays seed + (k-1) * step: its game seeds (seed*1000 + ...) never meet another season's */
export const TIE_REPLAYS = 10;
const GAME_SEED_STEP = 10, SUBSEED_STEP = 1;      /* seed of a game = seed*1000 + day*10 + slot (+ replay number) */
const FINAL_SLOT = 0;

/* #748 part 2: the rosters the site shows, in the engine shape. tier 1 = 一軍 (the 試跑 nights), tier 2 = 二軍 (the farm games). One entry per TEAMS index. */
export const siteRosters = (players, tier) => TEAMS.map(t => siteRoster(players, t.id, tier));

/* rosters: one { bat, pit, bench } per TEAMS index; the default stays the factory ROSTERS (seed 704 and every older check are byte for byte the same).
 * feud (#379 part 9): simGame grudge options, e.g. { grudge: true, retaliate: true }; off by default (no feud = every game as before).
 * With it, each game gets the pair's last `owed` from the grudge book (league/grudges.js) as opts.owed, the log line keeps it as
 * `owedIn` (so the game replays), and the counted game's `owed` replaces the pair's entry; the run returns the final `grudges` book.
 * injury (#379 part 11): true = simGame opts.injury; off by default (every game as before). The league keeps the injured list
 * (league/injuries.js): a player out tonight leaves the lineup / bullpen (healthyRoster) and the rotation skips him
 * (pickHealthyStarter). The log line keeps `out` ({ <team index>: names }) so the game replays with healthyGame (league/injuries.js);
 * `sp` stays the index into the full pit. The run returns the final `injured` list. */
export { healthyGame };

export function runSeason(seed, { rosters = ROSTERS, feud, injury } = {}) {
  const ids = TEAMS.map(t => t.id), ix = Object.fromEntries(ids.map((id, i) => [id, i]));
  const schedule = S.makeSchedule(ids), table = S.newStandings(ids), rot = S.newRotation(ids), log = [];
  let book = {}, injured = [];
  function play(day, slot, g, phase) {
    const sides = [g.away, g.home], teams = sides.map(id => ix[id]);
    const outs = teams.map(t => (injury ? outOn(injured, t, day) : []));
    const sp = sides.map((id, k) => pickHealthyStarter(rot, id, rosters[ix[id]].pit, day, outs[k]));
    const out = outs.some(o => o.length) ? Object.fromEntries(teams.map((t, k) => [t, outs[k]]).filter(e => e[1].length)) : undefined;
    const hg = healthyGame(rosters, teams, sp, out);
    sides.forEach((id, k) => S.recordStart(rot, id, sp[k], day));
    const owedIn = feud ? owedFor(book, teams) : undefined;
    const fo = feud ? { ...feud, ...(owedIn ? { owed: owedIn } : {}) } : {};
    for (let n = 0; n <= TIE_REPLAYS; n++) {
      const game = simGame((seed * 1000 + day * GAME_SEED_STEP + slot + n * SUBSEED_STEP * 100000) >>> 0, {}, { teams, starters: hg.starters, rosters: hg.rosters, ...fo, ...(injury ? { injury: true } : {}) });
      const [awayRuns, homeRuns] = game.final.sc;
      if (awayRuns === homeRuns) continue;
      const res = { home: g.home, away: g.away, homeRuns, awayRuns };
      log.push({ day, phase, ...res, starters: sides.map((id, k) => rosters[ix[id]].pit[sp[k]].name), replays: n, slot, sp: sp.slice(), seed: (seed * 1000 + day * GAME_SEED_STEP + slot + n * SUBSEED_STEP * 100000) >>> 0, ...(owedIn ? { owedIn } : {}), ...(out ? { out } : {}) });
      if (feud) book = recordOwed(book, teams, game.owed);
      if (injury) injured = recordInjuries(injured, game.injuries, day);
      return res;
    }
    throw new Error(`season ${seed} day ${day}: still tied after ${TIE_REPLAYS} replays`);
  }
  schedule.forEach((night, day) => night.forEach((g, slot) => S.applyResult(table, play(day, slot, g, 'season'))));
  const fin = S.newFinal(table);
  for (let g = S.nextFinalGame(fin); g; g = S.nextFinalGame(fin)) S.applyFinalResult(fin, play(S.SEASON_NIGHTS + fin.games.length, FINAL_SLOT, g, 'final'));
  return { seed, schedule, standings: S.rank(table).map(id => ({ id, ...table.teams[id] })), final: fin, champion: S.champion(fin), log, rot, ...(feud ? { grudges: book, feud } : {}), ...(injury ? { injured, injury: true } : {}) };
}

/* Chained seasons of the 試跑 (#749): season 1 plays `seed`; after each season the display league (players.json format) is
 * aged a year and goes through seasonEnd with a seed derived from the season seed. Each season is played by the 一軍 the display
 * league shows at that moment (#748 part 2: siteRosters(league, 1)); the engine plays every game (rule 10). Each run gets `.season`
 * and (except the last) `.turnover` = { retired, culled, called, signed, released, rookies } counts. Pure but for the engine. */
export const turnoverSeed = (seed, k) => (Math.imul(seed >>> 0, 0x9e3779b1) ^ Math.imul(k, 0x85ebca6b)) >>> 0;
export function runSeasons(seed, { seasons = 0, minDays = MIN_SITE_DAYS, players, feud, injury } = {}) {
  const runs = [];
  let league = players, days = 0;
  for (let k = 1; seasons ? k <= seasons : days < minDays; k++) {
    const rosters = siteRosters(league, 1), run = runSeason(seed + (k - 1) * SEASON_SEED_STEP, { rosters, feud, injury });
    run.season = k; run.rosters = rosters; days += new Set(run.log.map(x => x.day)).size; runs.push(run);
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
 * result (farm.js). Lineups: `rosters` (#748 part 2: siteRosters(players, 2), the full 系統 二軍), written into each record as opts.rosters
 * (only the two teams that play, slim: no body / ht, the renderer reads a missing body as `normal`). No rosters = the default
 * ROSTERS and no opts, as before. Ids continue after `startId`. Pure but for the engine. */
export const slimPlayer = ({ body, ht, ...p }) => p;
export const FARM_SEED_BASE = 1_000_000_000;
export function farmGames(seed, { commit, startId = 1, rosters } = {}) {
  const ids = TEAMS.map(t => t.id), ix = Object.fromEntries(ids.map((id, i) => [id, i])), out = [];
  S.makeSchedule(ids).forEach((night, day) => night.forEach((g, slot) => {
    const teams = [g.away, g.home].map(id => ix[id]), gseed = (FARM_SEED_BASE + seed * 1000 + day * GAME_SEED_STEP + slot) >>> 0;
    const opts = rosters && { rosters: ids.map((_, i) => teams.includes(i) ? { ...rosters[i], bat: rosters[i].bat.map(slimPlayer), pit: rosters[i].pit.map(slimPlayer) } : null) };
    const b = boxFromStream(simGame(gseed, {}, { teams, ...(opts || {}) }).stream);
    out.push(farmRecord({ id: `f-${startId + out.length}`, trial: true, day, seed: gseed, commit, version: ENGINE_VERSION, teams, opts, score: b.score, line: b.line }));
  }));
  return out;
}

/* 一軍 試跑 replays (#743 part 4): league/site/trial_games.json from the same runs as season.json (league/trial_games.js has the shape).
 * Every game is played again here with its logged seed to get the line score the replay checks; the engine plays it (rule 10). */
export const TRIAL_OUT = fileURLToPath(new URL('../site/trial_games.json', import.meta.url));
const slimRoster = r => ({ ...r, bat: r.bat.map(slimPlayer), pit: r.pit.map(slimPlayer) });
/* #379 part 12: a run played with feud / injury (runSeasons options, off by default) logs `owedIn` / `out` per game; the trial
 * line keeps `out` and `opts` (the engine flags + `owed`) so the replay builds the same game. Off = no new keys (file unchanged). */
export function gameOpts(run, x) {
  const o = { ...(run.feud || {}), ...(x.owedIn ? { owed: x.owedIn } : {}), ...(run.injury ? { injury: true } : {}) };
  return Object.keys(o).length ? o : undefined;
}
export function trialFile(runs, { commit = '', version = ENGINE_VERSION } = {}) {
  const ids = TEAMS.map(t => t.id), ix = Object.fromEntries(ids.map((id, i) => [id, i])), seasons = [], games = [];
  let offset = 0;
  runs.forEach((run, i) => {
    const rosters = run.rosters || ROSTERS;
    seasons.push({ n: i + 1, rosters: rosters.map(slimRoster) });
    const days = [...new Set(run.log.map(x => x.day))].sort((a, b) => a - b);
    for (const x of run.log) {
      const teams = [ix[x.away], ix[x.home]], hg = healthyGame(rosters, teams, x.sp, x.out), extra = gameOpts(run, x);
      const b = boxFromStream(simGame(x.seed, {}, { teams, starters: hg.starters, rosters: hg.rosters, ...(extra || {}) }).stream);
      games.push({ day: offset + x.day, slot: x.slot, season: i + 1, teams, sp: x.sp, seed: x.seed, score: b.score, line: b.line, ...(x.out ? { out: x.out } : {}), ...(extra ? { opts: extra } : {}) });
    }
    offset += days.length;
  });
  return { trial: true, engine: { commit, version }, seasons, games };
}
export const trialSerialize = f => JSON.stringify({ ...f, games: [] }).replace('"games":[]', `"games":[\n${f.games.map(g => '  ' + JSON.stringify(g)).join(',\n')}\n]`) + '\n';

/* The owner's start (#750): the new season file from day 0 on `start` and the 二軍 file without its trial records.
 * Same inputs = same bytes; `players` is read only. Returns the texts to write. */
export function resetFiles({ seed = 1, start, commit, version = ENGINE_VERSION, seasons = 0, players, farm = [] }) {
  const runs = runSeasons(seed, { seasons, players });
  return { season: siteSerialize(siteFile(runs, { start, commit, version })), trial: trialSerialize(trialFile(runs, { commit, version })), farm: farmSerialize(farm.filter(r => !(r && r.trial === true))) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), seed = a.includes('--seed') ? Number(a[a.indexOf('--seed') + 1]) : 1;
  if (!Number.isInteger(seed)) { console.error('usage: node league/tools/season_run.mjs [--seed N] [--json] [--farm [--commit sha] [--write]]'); process.exit(2); }
  if (a.includes('--reset')) {
    const start = a.includes('--start') ? a[a.indexOf('--start') + 1] : '';
    const commit = a.includes('--commit') ? a[a.indexOf('--commit') + 1] : execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    const seasons = a.includes('--seasons') ? Number(a[a.indexOf('--seasons') + 1]) : 0;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !Number.isInteger(seasons) || seasons < 0) { console.error('usage: node league/tools/season_run.mjs --reset --start YYYY-MM-DD [--seed N] [--seasons K] [--commit sha] [--write]'); process.exit(2); }
    const farm = existsSync(FARM_OUT) ? JSON.parse(readFileSync(FARM_OUT, 'utf8')) : [];
    const out = resetFiles({ seed, start, commit, seasons, players: JSON.parse(readFileSync(PLAYERS_IN, 'utf8')), farm });
    const left = JSON.parse(out.farm).length;
    console.log(`reset: season.json from ${start} (seed ${seed}), 二軍 ${farm.length} -> ${left} records`);
    if (a.includes('--write')) { writeFileSync(SITE_OUT, out.season); writeFileSync(TRIAL_OUT, out.trial); writeFileSync(FARM_OUT, out.farm); console.log(`wrote ${SITE_OUT}, ${TRIAL_OUT} and ${FARM_OUT}`); }
    process.exit(0);
  }
  if (a.includes('--site')) {
    const start = a.includes('--start') ? a[a.indexOf('--start') + 1] : '';
    const commit = a.includes('--commit') ? a[a.indexOf('--commit') + 1] : execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    const seasons = a.includes('--seasons') ? Number(a[a.indexOf('--seasons') + 1]) : 0;
    if (!Number.isInteger(seasons) || seasons < 0) { console.error('--seasons must be a whole number >= 1'); process.exit(2); }
    const days = a.includes('--days') ? Number(a[a.indexOf('--days') + 1]) : MIN_SITE_DAYS;
    if (!Number.isInteger(days) || days < 1) { console.error('--days must be a whole number >= 1'); process.exit(2); }
    const runs = runSeasons(seed, { seasons, minDays: days, players: JSON.parse(readFileSync(PLAYERS_IN, 'utf8')) });
    const text = siteSerialize(siteFile(runs, { start, commit, version: ENGINE_VERSION }));
    if (a.includes('--write')) { writeFileSync(SITE_OUT, text); writeFileSync(TRIAL_OUT, trialSerialize(trialFile(runs, { commit, version: ENGINE_VERSION }))); console.log(`wrote ${SITE_OUT} and ${TRIAL_OUT}`); } else process.stdout.write(text);
    process.exit(0);
  }
  if (a.includes('--farm')) {   /* node season_run.mjs --seed N --farm [--commit sha] [--write]: the commit must be pushed (jsDelivr) */
    const replace = a.includes('--replace'), list = !replace && existsSync(FARM_OUT) ? JSON.parse(readFileSync(FARM_OUT, 'utf8')) : [];
    const next = list.reduce((m, r) => Math.max(m, Number(String(r.id).slice(2)) || 0), 0) + 1;
    const commit = a.includes('--commit') ? a[a.indexOf('--commit') + 1] : execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    const recs = farmGames(seed, { commit, startId: replace ? 1 : next, rosters: siteRosters(JSON.parse(readFileSync(PLAYERS_IN, 'utf8')), 2) });
    for (const r of recs) console.log(JSON.stringify(r));
    if (a.includes('--write')) { writeFileSync(FARM_OUT, farmSerialize(list.concat(recs))); console.log(`wrote ${recs.length} records (f-${replace ? 1 : next}..)`); }
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
