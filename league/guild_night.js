/* Scheduled guild games, the pure core (#809 part 1). No imports but season.js, no clock, no randomness, no DOM, no network, no engine:
 * the tool hands in `play` (the engine's simGame + boxFromStream, rule 10) and `rosterOf`. Never official (rule 24): nothing here is
 * the ledger or cloudball-league. Same inputs = same bytes (rule 11). Functions never run any of this (10 ms CPU, #809); a Node run does,
 * then publishes the static files below.
 *
 *   export  = { guilds: [ { id, name, base, members: [ { leader, coach, player } ], settings } ] }   (public data only, no agent ids)
 *   files written by guildNight (path -> text), `<date>` = YYYY-MM-DD, `<season>` = a whole number:
 *     league/site/guilds/lock-<date>.json      the frozen guilds of that night, sorted by id
 *     league/site/guilds/night-<date>.json     that night's games: { date, commit, games: [ { home, away, seed, replays, score, lines } ] }
 *     league/site/guilds/standings.json        guild standings after that night, rank() order
 *     league/site/guilds/lines/<season>/<NNN>.json  one of LINE_SHARDS files: { <player key>: [ [night, ...LINE_COLS], ... ] }; a pitcher's rows are [night, ...PIT_COLS]
 *       (`play` may return `pitchers` next to `players`: per side { <name>: [bf, outs, k, bb, r] }, the engine's own count, rule 10)
 *   A fan adds rows to one shard of one season, never a file: the file count is fixed (Pages limit 20,000 files).
 *
 *   freeze(exp, date, commit)               the lock snapshot (sorted by id; only public fields)
 *   fixtures(ids, night)                    the pairings of a night: circle method over the sorted ids, a bye when the count is odd
 *   shardOf(key)                            0..LINE_SHARDS-1 (FNV-1a of the key)
 *   guildNight({ exp, date, commit, season, night, prev, play, rosterOf })   the four kinds of file above */
import * as S from './season.js';

export const LINE_SHARDS = 256;
export const TIE_REPLAYS = 8;
export const LINE_COLS = ['pa', 'ab', 'h', 'd', 't', 'hr', 'bb', 'hbp', 'sf'];
export const PIT_COLS = ['bf', 'outs', 'k', 'bb', 'r'];   /* #804 part 5: a pitcher's row (league/player_stats.js PCOLS without season, day) */
export const GUILD_DIR = 'league/site/guilds';

const fnv = s => { let h = 0x811c9dc5; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; };
export const shardOf = key => fnv(key) % LINE_SHARDS;
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const sortKeys = o => Object.fromEntries(Object.keys(o).sort().map(k => [k, o[k]]));

export function freeze(exp, date, commit) {
  const guilds = (exp && Array.isArray(exp.guilds) ? exp.guilds : []).map(g => ({
    id: g.id, name: g.name, base: g.base, settings: g.settings === undefined ? null : g.settings,
    members: (g.members || []).map(m => ({ leader: !!m.leader, coach: !!m.coach, player: m.player ? { name: m.player.name, kind: m.player.kind, ovr: m.player.ovr, pos: m.player.pos ?? null } : null })),
  })).sort(byId);
  return { date, commit, guilds };
}

export function fixtures(ids, night) {
  const a = ids.slice().sort();
  if (a.length < 2) return [];
  if (a.length % 2) a.push(null);
  const n = a.length, round = night % (n - 1), [fixed, ...rest] = a, ring = [fixed, ...rest.slice(round).concat(rest.slice(0, round))], out = [];
  for (let i = 0; i < n / 2; i++) {
    const x = ring[i], y = ring[n - 1 - i];
    if (x === null || y === null) continue;
    out.push((round + Math.floor(night / (n - 1))) % 2 ? { home: y, away: x } : { home: x, away: y });   /* sides swap each round and each full cycle */
  }
  return out;
}

export function guildNight({ exp, date, commit, season, night, prev = {}, play, rosterOf }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('guildNight: date must be YYYY-MM-DD');
  if (!Number.isInteger(season) || !Number.isInteger(night) || night < 0) throw new Error('guildNight: season and night must be whole numbers');
  const lock = freeze(exp, date, commit), ids = lock.guilds.map(g => g.id), byGuild = Object.fromEntries(lock.guilds.map(g => [g.id, g]));
  const table = prev.standings && prev.standings.season === season
    ? { teams: structuredClone(prev.standings.teams), order: ids.slice(), games: structuredClone(prev.standings.games || []) }
    : S.newStandings(ids);
  for (const id of ids) table.teams[id] = table.teams[id] || { w: 0, l: 0, rf: 0, ra: 0 };
  table.order = ids.slice();
  const games = [], shards = {};
  const shardRows = i => shards[i] || (shards[i] = structuredClone((prev.lines && prev.lines[i]) || {}));
  for (const { home, away } of fixtures(ids, night)) {
    let done = null;
    for (let n = 0; n <= TIE_REPLAYS && !done; n++) {
      const seed = (fnv(`${date}|${home}|${away}`) + n * 7919) >>> 0;
      const r = play(seed, { home: rosterOf(byGuild[home]), away: rosterOf(byGuild[away]), teams: [byGuild[away], byGuild[home]] });
      if (r.score[0] !== r.score[1]) done = { seed, replays: n, r };
    }
    if (!done) throw new Error(`guildNight: ${away} v ${home} still tied after ${TIE_REPLAYS} replays`);
    const { r } = done, lines = {};
    [away, home].forEach((gid, k) => {
      for (const [name, v] of Object.entries((r.pitchers && r.pitchers[k]) || {})) {
        const key = `${gid}:${name}`, row = PIT_COLS.map((c, i) => v[i] | 0), sh = shardRows(shardOf(key));
        lines[key] = row;
        (sh[key] = sh[key] || []).push([night, ...row]);
      }
      for (const [name, b] of Object.entries(r.players[k] || {})) {
        const key = `${gid}:${name}`, row = LINE_COLS.map(c => b[c] | 0);
        lines[key] = row;
        const sh = shardRows(shardOf(key));
        (sh[key] = sh[key] || []).push([night, ...row]);
      }
    });
    S.applyResult(table, { home, away, homeRuns: r.score[1], awayRuns: r.score[0] });
    games.push({ home, away, seed: done.seed, replays: done.replays, score: r.score.slice(), lines: sortKeys(lines) });
  }
  const files = {};
  const put = (path, v) => { files[path] = JSON.stringify(v) + '\n'; };
  put(`${GUILD_DIR}/lock-${date}.json`, lock);
  put(`${GUILD_DIR}/night-${date}.json`, { date, commit, season, night, games });
  put(`${GUILD_DIR}/standings.json`, { season, night, date, commit, rank: S.rank(table).map(id => ({ id, ...table.teams[id] })), teams: table.teams, games: table.games });
  for (const i of Object.keys(shards).sort((a, b) => a - b)) put(`${GUILD_DIR}/lines/${season}/${String(i).padStart(3, '0')}.json`, sortKeys(shards[i]));
  return files;
}
