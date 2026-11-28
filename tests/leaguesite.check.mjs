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
import { buildSite, validateSite, siteFiles, OUT_DIR, TIER, SECOND_BULLPEN } from '../league/tools/site.mjs';
import { CREATE } from '../league/freeagents.js';
import { ROTATION_SIZE } from '../engine/constants.js';

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
  const all = Object.values(files.players), first = all.filter(p => p.tier === TIER.FIRST), farm = all.filter(p => p.tier === TIER.SECOND), per = CREATE.positions.length + ROTATION_SIZE + SECOND_BULLPEN;   /* the full 二軍 of #748 */
  /* day-1 snapshot (#565 part 4): the factory league run DAY1_SEASONS turnover seasons ahead, so the roster size per team is what the
   * factory gave (一軍 + 二軍), the 一軍 is (nearly) full, ages are mixed, somebody waits in the call-up queue and the 自由市場 is not empty */
  const size = ROSTERS.length ? ROSTERS[0].bat.length + ROSTERS[0].pit.length + per : 0;
  if (first.length < n - 4 || first.length > n) bad(`day 1: ${first.length} 一軍 players, expected ${n - 4}..${n}`);
  for (const t of files.teams.teams) {
    const mine = all.filter(p => p.team === t.id && (p.tier === TIER.FIRST || p.tier === TIER.SECOND)).length;
    if (mine < size) bad(`team ${t.id}: ${mine} players in 一軍 + 二軍, the factory league has ${size}`);   /* turnover keeps the count; fillSecond only adds (#748 part 2) */
    const farmOf = all.filter(p => p.team === t.id && p.tier === TIER.SECOND), seats = (role, pos) => farmOf.filter(p => p.role === role && (pos === undefined || p.pos === pos)).length;
    for (const pos of CREATE.positions) if (!seats('B', pos)) bad(`team ${t.id}: 二軍 has no batter at ${pos}`);
    if (farmOf.filter(p => p.role === 'P' && p.pos === 'SP').length < ROTATION_SIZE) bad(`team ${t.id}: 二軍 has fewer than ${ROTATION_SIZE} starters`);
    if (farmOf.filter(p => p.role === 'P' && p.pos !== 'SP').length < SECOND_BULLPEN) bad(`team ${t.id}: 二軍 bullpen is under ${SECOND_BULLPEN}`);
  }
  const ages = first.map(p => p.age);
  if (Math.max(...ages) - Math.min(...ages) < 10) bad(`day 1: 一軍 ages ${Math.min(...ages)}..${Math.max(...ages)} are not mixed`);
  if (!all.some(p => p.tier === TIER.SECOND && p.waited > 0)) bad('day 1: the call-up queue is empty');
  if (!all.some(p => p.tier === TIER.FREE)) bad('day 1: nobody is on the 自由市場');
  if (files.teams.teams.some(t => t.roster.length !== all.filter(p => p.team === t.id && p.tier === TIER.FIRST).length)) bad('day 1: a team roster does not list its 一軍');
  for (const p of all) if (p.tier === TIER.FREE && p.team !== null) bad(`day 1: free agent ${p.name} has team ${p.team}`);
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
