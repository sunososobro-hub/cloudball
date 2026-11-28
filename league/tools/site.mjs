/* Exports the publishable data of the text-first site (#336, read by the pages of #335) into league/site/:
 *   teams.json    { season, teams: [{ id, name, city, logo, record: {w, l}, roster: [playerId, ...] }] }   (roster = 一軍)
 *   players.json  (the day-1 snapshot, #565 part 4: DAY1_SEASONS turnover seasons after the factory league) { "<playerId>": { name, num, age, role: "P"|"B", pos, hand, overall, abilities, team, tier } }
 *                 tier 1 = 一軍, 2 = 二軍, 3 = free agent (team null); `system: true` only on a 系統 filler (#437), shown as a 系統 tag
 *   games.json    [{ id, season, date, home, away, score: [home, away], replay }]
 *
 *   node league/tools/site.mjs           print what would be written (no file is written)
 *   node league/tools/site.mjs --write   write the three files
 *   node league/tools/site.mjs --fans fans.json [--write]   real fans [{ team, player }] replace 系統 二軍 players (#437 part 5)
 *
 * Export only: it reads the league modules and the recorded games and never changes an ability or a result
 * (rules 10, 11). No randomness, no clock: two runs give the same bytes. tests/leaguesite.check.mjs keeps the files
 * equal to this output, so regenerate them in the same PR as any change to the league modules they come from. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { TEAMS } from '../teams.js';
import { ROSTERS } from '../players.js';
import { ratingsOf } from '../ratings.js';
import { CREATE, makePlayer, placeFan } from '../freeagents.js';
import { parseRecording } from '../recording.js';
import { simulate } from './turnover_sim.mjs';
import { ROTATION_SIZE } from '../../engine/constants.js';

const LEAGUE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_DIR = path.join(LEAGUE, 'site');
export const SEASON = '0';
export const TIER = { FIRST: 1, SECOND: 2, FREE: 3 };
/* #565 part 4: "day 1 for the first player". The site data is the factory league (league/players.js + systemSecond) run
 * DAY1_SEASONS seasons ahead by turnover_sim.simulate (seed DAY1_SEED): mixed ages, a call-up queue, players on the 自由市場.
 * Season 0 of the factory export is the start; 0 seasons = the plain factory export. Regenerate with `node league/tools/site.mjs --write`. */
export const DAY1_SEASONS = 8, DAY1_SEED = 565;
/* Characters of the city at the start of every team name (台北, 新竹, 高雄, 台東). */
export const CITY_CHARS = 2;
/* Recorded games of the season, oldest first. `file` is relative to the site root (it is also the replay path);
 * the recording holds no date, so the day it was recorded is written here. a recording's `teams` holds team ids, the first bats first (away). */
export const RECORDED_GAMES = [
  { id: 'preseason-opening', file: 'league/preseason/opening.json', date: '2026-11-21' },
];

/* #437 part 4: the 二軍 of the static data site is filled with 系統 players until real fans replace them (the store's
 * fillers are the free market; the site cannot read the store). SYSTEM_SECOND_PER_KIND per team and kind, an even spread of
 * the creation budget, positions / roles cycled, names unique in the whole league. No clock, no RNG outside makePlayer's seed. */
export const SYSTEM_SECOND_PER_KIND = 3, SYSTEM_SECOND_SEED = 437;
const mixSeed = (...n) => n.reduce((h, x) => Math.imul(h ^ (x >>> 0), 0x9e3779b1) >>> 0, 0x811c9dc5);
export function systemSecond(teams = TEAMS, rosters = ROSTERS) {
  const taken = new Set(rosters.flatMap(r => [...r.bat, ...r.pit].map(p => p.name))), out = {};
  teams.forEach((t, ti) => {
    out[t.id] = [];
    for (const kind of CREATE.kinds) for (let i = 0; i < SYSTEM_SECOND_PER_KIND; i++) {
      const keys = CREATE.keys[kind], per = CREATE.budget[kind] / keys.length, look = { head: 0, skin: 0, hair: 0 };
      const points = Object.fromEntries(keys.map(k => [k, per]));
      const c = kind === 'bat' ? { kind, pos: CREATE.positions[i % CREATE.positions.length], bats: 'R', build: 'normal', look, points }
        : { kind, role: CREATE.roles[i % CREATE.roles.length], throws: 'R', build: 'normal', look, points };
      const seed = mixSeed(SYSTEM_SECOND_SEED, ti, kind === 'bat' ? 2 : 3, i);
      let made;
      for (let n = 0; ; n++) { made = makePlayer(seed, { ...c, nameDraw: n }); if (!taken.has(made.player.name)) break; }
      taken.add(made.player.name);
      out[t.id].push({ ...made.player, system: true });
    }
  });
  return out;
}

/* #748 part 1: a FULL 二軍 per team (the 二軍 of the export since part 2): one batter per position of CREATE.positions (the nine of a lineup,
 * DH included), ROTATION_SIZE starters, then SECOND_BULLPEN relievers (roles cycled over the non-SP roles). Same recipe and seeds as systemSecond
 * (an even spread of the creation budget, names unique in the league), so two calls give the same bytes. */
export const SECOND_BULLPEN = 4, FULL_SECOND_SEED = 748;
export function fullSecond(teams = TEAMS, rosters = ROSTERS) {
  const taken = new Set(rosters.flatMap(r => [...r.bat, ...r.pit].map(p => p.name))), out = {};
  const relief = CREATE.roles.filter(r => r !== 'SP'), look = { head: 0, skin: 0, hair: 0 };
  const plan = [...CREATE.positions.map(pos => ({ kind: 'bat', pos })), ...Array.from({ length: ROTATION_SIZE }, () => ({ kind: 'pit', role: 'SP' })),
    ...Array.from({ length: SECOND_BULLPEN }, (_, i) => ({ kind: 'pit', role: relief[i % relief.length] }))];
  teams.forEach((t, ti) => {
    out[t.id] = plan.map((slot, i) => {
      const keys = CREATE.keys[slot.kind], per = CREATE.budget[slot.kind] / keys.length, points = Object.fromEntries(keys.map(k => [k, per]));
      const c = slot.kind === 'bat' ? { kind: 'bat', pos: slot.pos, bats: 'R', build: 'normal', look, points } : { kind: 'pit', role: slot.role, throws: 'R', build: 'normal', look, points };
      const seed = mixSeed(FULL_SECOND_SEED, ti, i);
      let made;
      for (let n = 0; ; n++) { made = makePlayer(seed, { ...c, nameDraw: n }); if (!taken.has(made.player.name)) break; }
      taken.add(made.player.name);
      return { ...made.player, system: true };
    });
  });
  return out;
}

/* #748 part 2: after the turnover seasons of the day-1 snapshot a team's 二軍 is lopsided (call-ups and releases took players, rookies went to
 * the least-filled position), so it may not field a lineup. topUpSecond adds 系統 players (the fullSecond recipe, a fresh seed per slot, names and
 * ids unique in the league) until every team has a batter at each of CREATE.positions, ROTATION_SIZE starters and SECOND_BULLPEN relievers;
 * nobody is removed. Pure: returns new { id: row } players, same input = same bytes. */
export function topUpSecond(players, teams = TEAMS) {
  const out = { ...players }, taken = new Set(Object.values(out).map(p => p.name));
  const relief = CREATE.roles.filter(r => r !== 'SP'), look = { head: 0, skin: 0, hair: 0 };
  teams.forEach((t, ti) => {
    const mine = Object.values(out).filter(p => p.team === t.id && p.tier === TIER.SECOND);
    const need = [];
    for (const pos of CREATE.positions) if (!mine.some(p => p.role === 'B' && p.pos === pos)) need.push({ kind: 'bat', pos });
    for (let n = mine.filter(p => p.pos === 'SP').length; n < ROTATION_SIZE; n++) need.push({ kind: 'pit', role: 'SP' });
    for (let n = mine.filter(p => p.role === 'P' && p.pos !== 'SP').length, i = 0; n < SECOND_BULLPEN; n++, i++) need.push({ kind: 'pit', role: relief[i % relief.length] });
    need.forEach((slot, i) => {
      const keys = CREATE.keys[slot.kind], per = CREATE.budget[slot.kind] / keys.length, points = Object.fromEntries(keys.map(k => [k, per]));
      const c = slot.kind === 'bat' ? { kind: 'bat', pos: slot.pos, bats: 'R', build: 'normal', look, points } : { kind: 'pit', role: slot.role, throws: 'R', build: 'normal', look, points };
      let made;
      for (let n = 0; ; n++) { made = makePlayer(mixSeed(FULL_SECOND_SEED, ti, 1000 + i, Math.floor(n / 50)), { ...c, nameDraw: n }); if (!taken.has(made.player.name) && !out[made.player.id]) break; }
      taken.add(made.player.name);
      const { ovr, ...abilities } = ratingsOf(made.player), p = made.player;
      out[p.id] = { name: p.name, num: p.num, age: p.age, role: p.role ? 'P' : 'B', pos: p.role || p.pos, hand: p.role ? p.throws : p.hand, overall: ovr, abilities, team: t.id, tier: TIER.SECOND, system: true };
    });
  });
  return out;
}

/* buildSite({ teams, rosters, rate, games, second, free }) -> { teams, players, games } (plain objects, ready for JSON).
 * second: { teamId: [player in the roster format of league/players.js] } (二軍); free: [player] (free agents).
 * Both are empty in season 0 until players are placed there. games: [{ id, date, file, rec }] (rec = parsed recording). */
export function buildSite({ teams = TEAMS, rosters = ROSTERS, rate = ratingsOf, games = [], second = {}, free = [] } = {}) {
  const players = {};
  const add = (p, team, tier) => {
    if (players[p.id]) throw new Error(`player id ${p.id} appears twice`);
    const { ovr, ...abilities } = rate(p);
    players[p.id] = { name: p.name, num: p.num, age: p.age, role: p.role ? 'P' : 'B', pos: p.role || p.pos,
      hand: p.role ? p.throws : p.hand, overall: ovr, abilities, team, tier, ...(p.system === true ? { system: true } : {}) };
  };
  const record = Object.fromEntries(teams.map(t => [t.id, { w: 0, l: 0 }]));
  const gameRows = games.map(({ id, date, file, rec }) => {
    const [away, home] = rec.teams, [scAway, scHome] = rec.game.final.sc;
    if (scAway === scHome) throw new Error(`game ${id} has no winner`);
    record[scHome > scAway ? home : away].w++; record[scHome > scAway ? away : home].l++;
    return { id, season: SEASON, date, home, away, score: [scHome, scAway], replay: file };
  });
  const teamRows = teams.map((t, i) => {
    const r = rosters[i], first = [...r.bat, ...r.pit];
    for (const p of first) add(p, t.id, TIER.FIRST);
    for (const p of second[t.id] || []) add(p, t.id, TIER.SECOND);
    return { id: t.id, name: t.name, city: t.name.slice(0, CITY_CHARS), logo: `assets/logos/${t.id}_512.webp`,
      record: record[t.id], roster: first.map(p => p.id) };
  });
  for (const p of free) add(p, null, TIER.FREE);
  return { teams: { season: SEASON, teams: teamRows }, players, games: gameRows };
}

/* #437 part 5: real fans from a json file take the place of 系統 二軍 players. fans: [{ team: <team id>, player: <player in the roster format> }]
 * (default none = the bytes do not change). Per team a fan replaces the first 系統 player of his kind (placeFan), is added when none is left,
 * and never touches a 一軍 player. Pure: returns a new { teamId: [player] }; a team id that does not exist is an error. */
export function placeFans(second, fans = []) {
  const out = Object.fromEntries(Object.entries(second).map(([id, list]) => [id, list.map(player => ({ id: player.id, kind: player.role ? 'pit' : 'bat', player }))]));
  for (const f of fans) {
    if (!f || !out[f.team] || !f.player || typeof f.player.id !== 'string') throw new Error(`fan ${JSON.stringify(f && f.player && f.player.id)}: team ${f && f.team} does not exist or the player has no id`);
    out[f.team] = placeFan(out[f.team], { id: f.player.id, kind: f.player.role ? 'pit' : 'bat', player: f.player }).pool;
  }
  return Object.fromEntries(Object.entries(out).map(([id, list]) => [id, list.map(x => x.player)]));
}

/* The factory league as players.json rows (no snapshot): what `turnover_sim.mjs` starts from. */
export const factoryPlayers = () => buildSite({ second: systemSecond() }).players;

/* day-1 snapshot: factory league run `seasons` seasons ahead; the 一軍 roster of each team is rebuilt from the result
 * (team order and player order of the factory data, newcomers appended), so teams.json and players.json agree. */
export function day1(site, seasons = DAY1_SEASONS, seed = DAY1_SEED) {
  if (!seasons) return site;
  const players = simulate(site.players, { seasons, seed }).players;
  const teams = site.teams.teams.map(t => ({ ...t, roster: Object.keys(players).filter(id => players[id].team === t.id && players[id].tier === TIER.FIRST) }));
  return { ...site, players, teams: { ...site.teams, teams } };
}

/* validateSite({ teams, players, games }) -> list of plain problems; empty = fine. */
export function validateSite({ teams, players, games }) {
  const bad = [], tiers = Object.values(TIER);
  if (!teams || typeof teams.season !== 'string' || !Array.isArray(teams.teams)) return ['teams.json must be { season: "<n>", teams: [...] }'];
  if (!players || typeof players !== 'object' || Array.isArray(players)) return ['players.json must be an object keyed by player id'];
  if (!Array.isArray(games)) return ['games.json must be a list'];
  const teamIds = new Set(teams.teams.map(t => t.id));
  for (const t of teams.teams) {
    for (const k of ['id', 'name', 'city', 'logo']) if (typeof t[k] !== 'string' || !t[k]) bad.push(`team ${t.id}: ${k} missing`);
    if (!t.record || !Number.isInteger(t.record.w) || !Number.isInteger(t.record.l)) bad.push(`team ${t.id}: record {w, l} missing`);
    if (!Array.isArray(t.roster)) { bad.push(`team ${t.id}: roster is not a list`); continue; }
    for (const id of t.roster) {
      const p = players[id];
      if (!p) bad.push(`team ${t.id}: roster id ${id} is not in players.json`);
      else if (p.team !== t.id || p.tier !== TIER.FIRST) bad.push(`team ${t.id}: ${id} is on its roster but is team ${p.team}, tier ${p.tier}`);
    }
  }
  for (const [id, p] of Object.entries(players)) {
    if (!tiers.includes(p.tier)) bad.push(`player ${id}: tier ${p.tier} is not 1, 2 or 3`);
    if (p.role !== 'P' && p.role !== 'B') bad.push(`player ${id}: role ${p.role} is not P or B`);
    if (p.tier === TIER.FREE ? p.team !== null : !teamIds.has(p.team)) bad.push(`player ${id}: team ${p.team} does not fit tier ${p.tier}`);
    if (p.tier === TIER.FIRST && !teams.teams.some(t => t.id === p.team && t.roster.includes(id))) bad.push(`player ${id}: tier 1 but not on his team's roster`);
    if (!Number.isInteger(p.overall) || p.overall < 1 || p.overall > 100) bad.push(`player ${id}: overall ${p.overall} is not 1 to 100`);
    if (!p.abilities || !Object.values(p.abilities).every(v => Number.isInteger(v) && v >= 1 && v <= 100)) bad.push(`player ${id}: abilities are not 1 to 100`);
  }
  const wins = Object.fromEntries([...teamIds].map(id => [id, { w: 0, l: 0 }]));
  for (const g of games) {
    if (!teamIds.has(g.home) || !teamIds.has(g.away) || g.home === g.away) bad.push(`game ${g.id}: teams ${g.home} / ${g.away} do not resolve`);
    else if (!Array.isArray(g.score) || g.score.length !== 2 || g.score[0] === g.score[1]) bad.push(`game ${g.id}: score ${JSON.stringify(g.score)}`);
    else { const homeWon = g.score[0] > g.score[1]; wins[g.home][homeWon ? 'w' : 'l']++; wins[g.away][homeWon ? 'l' : 'w']++; }
    if (typeof g.replay !== 'string' || !g.replay) bad.push(`game ${g.id}: replay missing`);
  }
  for (const t of teams.teams) if (wins[t.id] && t.record && (wins[t.id].w !== t.record.w || wins[t.id].l !== t.record.l))
    bad.push(`team ${t.id}: record ${t.record.w}-${t.record.l} does not match games.json (${wins[t.id].w}-${wins[t.id].l})`);
  return bad;
}

/* The three files as text, exactly as written. */
export function siteFiles(root = path.resolve(LEAGUE, '..'), fans = []) {
  const games = RECORDED_GAMES.map(g => ({ ...g, rec: parseRecording(readFileSync(path.join(root, g.file), 'utf8')) }));
  const site = day1(buildSite({ games, second: placeFans(fullSecond(), fans) }));
  site.players = topUpSecond(site.players);
  return Object.fromEntries(Object.entries(site).map(([k, v]) => [`${k}.json`, JSON.stringify(v, null, 2) + '\n']));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf('--fans');
  const files = siteFiles(undefined, at > 0 ? JSON.parse(readFileSync(process.argv[at + 1], 'utf8')) : []);
  if (process.argv.includes('--write')) {
    mkdirSync(OUT_DIR, { recursive: true });
    for (const [name, text] of Object.entries(files)) writeFileSync(path.join(OUT_DIR, name), text);
    console.log(`wrote ${Object.keys(files).join(', ')} to league/site/`);
  } else for (const [name, text] of Object.entries(files)) console.log(`--- ${name} (${text.length} chars)\n${text.slice(0, 600)}`);
}
