/* Practice games against the newest lock snapshot (#809 part 5, #800). Pure: no clock, no randomness, no network, no storage, no engine (rule 10).
 * Never official (rule 24). A practice opponent is a guild frozen in `league/site/guilds/lock-<date>.json` (written by league/tools/guild_night.mjs),
 * never a D1 row: Functions stay out of it (#809), a static file costs nothing.
 *
 *   LOCK_LOOKBACK                   nights back from today that are tried for a lock file
 *   lockPaths(day, n)               the lock file paths to try, newest first (`day` = YYYY-MM-DD)
 *   newestLock(day, load)           async: `load(path)` -> text | null (the caller's fetch); first path that holds a valid lock -> lock, else null
 *   practiceOpponent(lock, myId, seed)   another guild of the lock, picked by the seed (same inputs = same guild); null when there is none
 *   practiceGame(lock, myId, oppId, players, seed)   { a, rosters, names } for practiceOpening (`a` = { away: 0, home: 1, sp, seed }; my guild is away),
 *                                    rosters from league/guild_roster.js on each guild's `base` team; throws a named reason for an unknown guild / base team */
import { guildRoster } from './guild_roster.js';
import { siteRoster } from './site_roster.js';
import { STARTERS } from './friendly.js';

export const LOCK_LOOKBACK = 7;
export const GUILD_DIR = 'league/site/guilds';
const TEAM_ONE = 1;   /* tier 1 = 一軍 */

export function lockPaths(day, n = LOCK_LOOKBACK) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) throw new Error('day is not YYYY-MM-DD');
  const t0 = Date.UTC(+m[1], +m[2] - 1, +m[3]), out = [];
  for (let k = 0; k <= n; k++) out.push(`${GUILD_DIR}/lock-${new Date(t0 - k * 86400000).toISOString().slice(0, 10)}.json`);
  return out;
}

const validLock = j => !!j && typeof j === 'object' && Array.isArray(j.guilds) && j.guilds.every(g => g && typeof g.id === 'string' && typeof g.base === 'string');

export async function newestLock(day, load) {
  for (const p of lockPaths(day)) {
    let text = null;
    try { text = await load(p); } catch (e) { text = null; }
    if (text == null) continue;
    try { const j = JSON.parse(text); if (validLock(j)) return j; } catch (e) { /* a broken file: try the night before */ }
  }
  return null;
}

export function practiceOpponent(lock, myId, seed) {
  const others = ((lock && lock.guilds) || []).filter(g => g.id !== myId).map(g => g.id).sort();
  return others.length ? others[(seed >>> 0) % others.length] : null;
}

export function practiceGame(lock, myId, oppId, players, seed) {
  const find = id => { const g = lock.guilds.find(x => x.id === id); if (!g) throw new Error(`guild ${id} is not in the lock`); return g; };
  const sides = [find(myId), find(oppId)].map(g => {
    const base = siteRoster(players, g.base, TEAM_ONE);
    if (!base.bat.length || !base.pit.length) throw new Error(`guild ${g.id}: unknown base team ${g.base}`);
    return guildRoster(g, base);
  });
  const sp = sides.map((s, k) => ((seed >>> (3 + 4 * k)) >>> 0) % Math.min(STARTERS, Math.max(1, s.roster.pit.filter(p => p.role === 'SP').length)));
  return { a: { away: 0, home: 1, sp, seed }, rosters: sides.map(s => s.roster), names: sides.map(s => s.names) };
}
