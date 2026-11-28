/* Guild record on the guild page (#800 part 8). Pure: no DOM, network, clock or randomness. Never official (rule 24).
 * Reads the published league/site/guilds/standings.json that league/guild_night.js writes (the engine's results, rule 10); this file only looks a guild up.
 *   STANDINGS_URL                 the published standings file
 *   guildRecord(standings, id)    { season, night, w, l, rf, ra, rank, of } of that guild, or null (no file, bad file, guild not in it)
 *   recordText(rec)               the line shown on the guild page (RECORD_NONE when rec is null) */
import { GUILD_DIR } from './guild_night.js';

export const STANDINGS_URL = `${GUILD_DIR}/standings.json`;
export const RECORD_NONE = '公會賽戰績：還沒有比賽紀錄。';
const whole = v => Number.isInteger(v) && v >= 0;

export function guildRecord(st, id) {
  if (!st || typeof st !== 'object' || !Array.isArray(st.rank) || !whole(st.season)) return null;
  const rows = st.rank.filter(r => r && typeof r === 'object' && typeof r.id === 'string' && ['w', 'l', 'rf', 'ra'].every(k => whole(r[k])));
  if (rows.length !== st.rank.length) return null;
  const i = rows.findIndex(r => r.id === id);
  if (i < 0) return null;
  const r = rows[i];
  return { season: st.season, night: whole(st.night) ? st.night : null, w: r.w, l: r.l, rf: r.rf, ra: r.ra, rank: i + 1, of: rows.length };
}

export const recordText = rec => (rec
  ? `公會賽戰績（試跑，第 ${rec.season} 季）：${rec.w} 勝 ${rec.l} 敗，得 ${rec.rf} 失 ${rec.ra}，第 ${rec.rank} 名（共 ${rec.of} 隊）。`
  : RECORD_NONE);
