/* One night of scheduled guild games (#809 part 3): the runner on league/guild_night.js. Hand-run, engine only, no network; it never fetches the export.
 *
 *   node league/tools/guild_night.mjs --export <file> --date YYYY-MM-DD --season N --night N [--commit sha] [--out <dir>] [--write]
 *
 * <file> = the JSON of GET /api/guilds/export: one page { guilds, next } or an array of pages (save each page first; the file is the owner's / the
 * nightly run's job). Reads the standings and line shards of the last night from <dir>/guilds/ (default league/site, season must match), plays the
 * night with the engine (rule 10: nothing here edits a score), prints the file list; --write puts the files under <dir>. Never in the ledger or
 * cloudball-league (rule 24). Same export + date + season + night + commit + files read = same bytes (rule 11). Rosters: league/guild_roster.js on
 * each guild's `base` team of league/site/players.json (一軍). A game the engine ends tied is played again by the core (TIE_REPLAYS). */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { simGame, boxFromStream, TEAMS } from '../../engine/index.js';
import { pitchingFromStream } from './player_stats.mjs';
import { guildNight, GUILD_DIR, LINE_SHARDS } from '../guild_night.js';
import { guildRoster } from '../guild_roster.js';
import { siteRoster } from '../site_roster.js';

export const SITE_DIR = fileURLToPath(new URL('../site/', import.meta.url));
const TEAM_ONE = 1;   /* tier 1 = 一軍 */

/* the export file -> { guilds }: one page or an array of pages (a guild twice, by id, counts once: the first page wins) */
export function readExport(text) {
  const j = JSON.parse(text), pages = Array.isArray(j) ? j : [j], seen = new Set(), guilds = [];
  for (const pg of pages) for (const g of (pg && pg.guilds) || []) if (!seen.has(g.id)) { seen.add(g.id); guilds.push(g); }
  return { guilds };
}

/* what the last night left under <dir>/guilds/: standings.json and the lines shards of `season` */
export function readPrev(dir, season) {
  const prev = {}, st = path.join(dir, 'guilds/standings.json');
  if (existsSync(st)) prev.standings = JSON.parse(readFileSync(st, 'utf8'));
  const ld = path.join(dir, `guilds/lines/${season}`);
  if (existsSync(ld)) {
    prev.lines = {};
    for (const f of readdirSync(ld).sort()) { const m = /^(\d{3})\.json$/.exec(f); if (m && Number(m[1]) < LINE_SHARDS) prev.lines[Number(m[1])] = JSON.parse(readFileSync(path.join(ld, f), 'utf8')); }
  }
  return prev;
}

/* the engine as the core's `play` and `rosterOf`: the two rosters sit at team slots 0 (away) and 1 (home), so two guilds of one base team still differ */
export function makePlay(players) {
  const ids = TEAMS.map(t => t.id), names = new WeakMap();
  const rosterOf = g => {
    const ix = ids.indexOf(g.base);
    if (ix < 0) throw new Error(`guild ${g.id}: unknown base team ${g.base}`);
    const { roster, names: who } = guildRoster(g, siteRoster(players, g.base, TEAM_ONE));
    names.set(roster, who);
    return roster;
  };
  const play = (seed, { home, away }) => {
    const rosters = [away, home], sp = rosters.map((r, k) => ((seed >>> (3 + 4 * k)) >>> 0) % Math.max(1, r.pit.filter(p => p.role === 'SP').length));
    const stream = simGame(seed, {}, { teams: [0, 1], rosters, starters: sp }).stream, box = boxFromStream(stream), pit = pitchingFromStream(stream);
    const mine = (side, k) => Object.fromEntries(Object.entries(side).filter(([nm]) => names.get(rosters[k]).includes(nm)));
    /* only the members' batting and pitching lines count; the NPCs' do not (nobody follows them, and the shards stay small) */
    return { score: box.score.slice(), players: box.players.map(mine), pitching: pit.map(mine) };
  };
  return { play, rosterOf };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), arg = k => (a.includes(k) ? a[a.indexOf(k) + 1] : undefined);
  const file = arg('--export'), date = arg('--date'), season = Number(arg('--season')), night = Number(arg('--night'));
  const out = path.resolve(arg('--out') || SITE_DIR);
  if (!file || !date || !Number.isInteger(season) || !Number.isInteger(night)) { console.error('usage: node league/tools/guild_night.mjs --export <file> --date YYYY-MM-DD --season N --night N [--commit sha] [--out dir] [--write]'); process.exit(2); }
  let commit = arg('--commit');
  if (!commit) { try { commit = execSync('git rev-parse HEAD', { cwd: path.dirname(fileURLToPath(import.meta.url)) }).toString().trim(); } catch (e) { commit = ''; } }
  const players = JSON.parse(readFileSync(path.join(SITE_DIR, 'players.json'), 'utf8'));
  const { play, rosterOf } = makePlay(players);
  const files = guildNight({ exp: readExport(readFileSync(file, 'utf8')), date, commit, season, night, prev: readPrev(out, season), play, rosterOf });
  for (const [p, text] of Object.entries(files)) {
    const rel = p.replace(/^league\/site\//, ''), dest = path.join(out, rel);
    if (a.includes('--write')) { mkdirSync(path.dirname(dest), { recursive: true }); writeFileSync(dest, text); }
    console.log(`${a.includes('--write') ? 'wrote' : 'would write'} ${rel} (${text.length} bytes)`);
  }
}
