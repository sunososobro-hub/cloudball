/* Exports the publishable data of the text-first site (#336, read by the pages of #335) into league/site/:
 *   teams.json    { season, teams: [{ id, name, city, logo, record: {w, l}, roster: [playerId, ...] }] }   (roster = 一軍)
 *   players.json  { "<playerId>": { name, num, age, role: "P"|"B", pos, hand, overall, abilities, team, tier } }
 *                 tier 1 = 一軍, 2 = 二軍, 3 = free agent (team null)
 *   games.json    [{ id, season, date, home, away, score: [home, away], replay }]
 *
 *   node league/tools/site.mjs           print what would be written (no file is written)
 *   node league/tools/site.mjs --write   write the three files
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
import { parseRecording } from '../recording.js';

const LEAGUE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_DIR = path.join(LEAGUE, 'site');
export const SEASON = '0';
export const TIER = { FIRST: 1, SECOND: 2, FREE: 3 };
/* Characters of the city at the start of every team name (台北, 新竹, 高雄, 台東). */
export const CITY_CHARS = 2;
/* Recorded games of the season, oldest first. `file` is relative to the site root (it is also the replay path);
 * the recording holds no date, so the day it was recorded is written here. a recording's `teams` holds team ids, the first bats first (away). */
export const RECORDED_GAMES = [
  { id: 'preseason-opening', file: 'league/preseason/opening.json', date: '2026-11-21' },
];

/* buildSite({ teams, rosters, rate, games, second, free }) -> { teams, players, games } (plain objects, ready for JSON).
 * second: { teamId: [player in the roster format of league/players.js] } (二軍); free: [player] (free agents).
 * Both are empty in season 0 until players are placed there. games: [{ id, date, file, rec }] (rec = parsed recording). */
export function buildSite({ teams = TEAMS, rosters = ROSTERS, rate = ratingsOf, games = [], second = {}, free = [] } = {}) {
  const players = {};
  const add = (p, team, tier) => {
    if (players[p.id]) throw new Error(`player id ${p.id} appears twice`);
    const { ovr, ...abilities } = rate(p);
    players[p.id] = { name: p.name, num: p.num, age: p.age, role: p.role ? 'P' : 'B', pos: p.role || p.pos,
      hand: p.role ? p.throws : p.hand, overall: ovr, abilities, team, tier };
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
export function siteFiles(root = path.resolve(LEAGUE, '..')) {
  const games = RECORDED_GAMES.map(g => ({ ...g, rec: parseRecording(readFileSync(path.join(root, g.file), 'utf8')) }));
  const site = buildSite({ games });
  return Object.fromEntries(Object.entries(site).map(([k, v]) => [`${k}.json`, JSON.stringify(v, null, 2) + '\n']));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = siteFiles();
  if (process.argv.includes('--write')) {
    mkdirSync(OUT_DIR, { recursive: true });
    for (const [name, text] of Object.entries(files)) writeFileSync(path.join(OUT_DIR, name), text);
    console.log(`wrote ${Object.keys(files).join(', ')} to league/site/`);
  } else for (const [name, text] of Object.entries(files)) console.log(`--- ${name} (${text.length} chars)\n${text.slice(0, 600)}`);
}
