/* Guild member season line (#804 part 4). Pure: no DOM, network, clock or randomness. Never official (rule 24).
 * The rows are the engine's own box lines of the scheduled guild games (league/guild_night.js writes them, rule 10); this file only adds them up.
 * Shard file league/site/guilds/lines/<season>/<NNN>.json = { <guild id>:<player name>: [ [night, ...LINE_COLS], ... ] }.
 *   memberKey(guildId, name)        the shard key of a member
 *   shardUrl(season, key)           'league/site/guilds/lines/<season>/<NNN>.json' of that key
 *   memberLine(shard, key)          player_stats tally of his rows (batters), or null when there is none or the shard is bad
 *   memberText(shard, key)          the same line as text, or GUILD_NONE */
import { LINE_COLS, GUILD_DIR, shardOf } from './guild_night.js';
import { tally, lineText } from './player_stats.js';

export const GUILD_NONE = '公會賽還沒有出賽紀錄。';
export const memberKey = (guildId, name) => `${guildId}:${name}`;
export const shardUrl = (season, key) => `${GUILD_DIR}/lines/${season}/${String(shardOf(key)).padStart(3, '0')}.json`;
export function memberLine(shard, key) {
  const rows = shard && typeof shard === 'object' && Array.isArray(shard[key]) ? shard[key] : [];
  const ok = rows.filter(r => Array.isArray(r) && r.length === LINE_COLS.length + 1 && r.every(Number.isInteger));
  /* player_stats rows are [season, day, pa, ab, h, d, t, hr, bb, hbp, sf]; a shard row is [night, pa, ab, h, d, t, hr, bb, hbp, sf] */
  return ok.length ? tally(ok.map(r => [0, ...r])) : null;
}
export const memberText = (shard, key) => { const l = memberLine(shard, key); return l ? lineText(l) : GUILD_NONE; };
