/* Guards of the publishable site data (league/site/, written by league/tools/site.mjs, #336):
 * - the three files parse, and every id resolves (each roster id is in players.json on that team at tier 1,
 *   each game's teams exist, each team's record matches its games);
 * - the files on disk equal a fresh export, and two exports are identical (deterministic, nothing hand-edited);
 * - the export only reads: the factory players and ratings are unchanged by it;
 * - the empty-tier case (no 二軍, no free agents, season 0) and the filled one both validate, and broken files do not.
 * Usage: node tests/leaguesite.check.mjs */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ROSTERS } from '../league/players.js';
import { ratingsOf } from '../league/ratings.js';
import { buildSite, validateSite, siteFiles, OUT_DIR, TIER, SYSTEM_SECOND_PER_KIND } from '../league/tools/site.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [], bad = m => problems.push(m);

const before = JSON.stringify(ROSTERS), ratedBefore = JSON.stringify(ROSTERS.flatMap(t => [...t.bat, ...t.pit]).map(ratingsOf));
const fresh = siteFiles(ROOT), again = siteFiles(ROOT);
for (const name of Object.keys(fresh)) {
  if (fresh[name] !== again[name]) bad(`${name}: two exports differ (not deterministic)`);
  let disk = null;
  try { disk = readFileSync(path.join(OUT_DIR, name), 'utf8'); } catch { bad(`league/site/${name} is missing: run node league/tools/site.mjs --write`); continue; }
  if (disk !== fresh[name]) bad(`league/site/${name} is stale or hand-edited: run node league/tools/site.mjs --write`);
}
if (JSON.stringify(ROSTERS) !== before || JSON.stringify(ROSTERS.flatMap(t => [...t.bat, ...t.pit]).map(ratingsOf)) !== ratedBefore)
  bad('the export changed a player or a rating (it may only read)');

let files = null;
try { files = Object.fromEntries(Object.entries(fresh).map(([n, t]) => [n.replace('.json', ''), JSON.parse(t)])); } catch (e) { bad(`a file does not parse: ${e.message}`); }
if (files) {
  for (const p of validateSite(files)) bad(`exported files: ${p}`);
  if (files.teams.season !== '0') bad(`season is ${files.teams.season}, expected "0"`);
  if (files.teams.teams.length !== 4) bad(`${files.teams.teams.length} teams, expected 4`);
  const n = ROSTERS.reduce((s, t) => s + t.bat.length + t.pit.length, 0);
  const all = Object.values(files.players), first = all.filter(p => p.tier === TIER.FIRST), farm = all.filter(p => p.tier === TIER.SECOND), per = 2 * SYSTEM_SECOND_PER_KIND;
  if (first.length !== n) bad(`players.json has ${first.length} 一軍 players, the rosters ${n}`);
  if (farm.length !== per * files.teams.teams.length) bad(`${farm.length} 二軍 players, expected ${per} 系統 players for each of ${files.teams.teams.length} teams (#437)`);
  for (const p of all) {
    if (p.tier === TIER.FREE) bad('season 0 has a free agent before anyone was placed there');
    if ((p.tier === TIER.SECOND) !== (p.system === true)) bad(`season 0: ${p.name} is tier ${p.tier} with system ${p.system} (only the 二軍 is 系統)`);
  }
  for (const t of files.teams.teams) if (all.filter(p => p.tier === TIER.SECOND && p.team === t.id).length !== per) bad(`team ${t.id} has no ${per} 系統 二軍 players`);
  if (new Set(all.map(p => p.name)).size !== all.length) bad('player names repeat in the season-0 site');
}

/* Empty tiers are valid (season 0 today); filled tiers are valid too: a 二軍 player and a free agent. */
const empty = buildSite();
for (const p of validateSite(empty)) bad(`empty-tier case: ${p}`);
if (empty.games.length || empty.teams.teams.some(t => t.record.w || t.record.l)) bad('no games must give empty games and 0-0 records');
const farm = { ...ROSTERS[0].bat[0], id: 'pheasants-f1', name: '測試二軍' }, fa = { ...ROSTERS[1].pit[0], id: 'fa-1', name: '測試自由' };
const filled = buildSite({ second: { pheasants: [farm] }, free: [fa] });
for (const p of validateSite(filled)) bad(`filled-tier case: ${p}`);
if (filled.players['pheasants-f1']?.tier !== TIER.SECOND || filled.players['pheasants-f1']?.team !== 'pheasants') bad('二軍 player: wrong tier or team');
if (filled.players['fa-1']?.tier !== TIER.FREE || filled.players['fa-1']?.team !== null) bad('free agent: wrong tier or team');
if (filled.teams.teams[0].roster.includes('pheasants-f1')) bad('a 二軍 player must not be on the 一軍 roster');

/* The validator must catch the mistakes it exists for. */
if (files) {
  const broken = JSON.parse(JSON.stringify(files));
  broken.teams.teams[0].roster.push('nobody'); broken.players[Object.keys(broken.players)[0]].tier = 4; broken.games.push({ id: 'x', home: 'owls', away: 'mars', score: [1, 0], replay: 'x' });
  const found = validateSite(broken).join('\n');
  for (const m of ['nobody', 'tier 4', 'mars']) if (!found.includes(m)) bad(`validateSite misses a broken file (${m})`);
}

if (problems.length) { console.error(`leaguesite check: ${problems.length} problem(s)\n- ${problems.join('\n- ')}`); process.exit(1); }
console.log(`leaguesite check: OK (${files ? Object.keys(files.players).length : 0} players, ${files ? files.games.length : 0} game(s), season ${files ? files.teams.season : '?'})`);
