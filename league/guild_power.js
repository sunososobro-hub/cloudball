/* Guild power summary (#800 part 4). Pure: no DOM, network, clock or randomness. Display only: the engine never reads it, and it never
 * changes a game or a stat (rules 10, 24). The guild's roster is league/guild_roster.js on its base team's 一軍; each player is rated by
 * league/ratings.js (the 1..100 display scale), then averaged:
 *   pit = mean overall of every pitcher on the roster
 *   bat = mean of (con, pow, eye) ratings over the lineup
 *   def = mean over the lineup of DEF_ARM_SHARE x arm rating + (1 - DEF_ARM_SHARE) x def rating (a fielder with no def reads RATING_MID)
 * guildPower(guild, base) -> { pit, bat, def, all } whole numbers 1..100; all = mean of the three. */
import { ratingsOf, RATING_MID } from './ratings.js';
import { guildRoster } from './guild_roster.js';

export const DEF_ARM_SHARE = 0.5;   /* first guess: the factory fielders carry no `def` (ratings.js), so the arm carries half of 守備 until they do */
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : RATING_MID);
const whole = x => Math.max(1, Math.min(100, Math.round(x)));

export function guildPower(guild, base) {
  const { roster } = guildRoster(guild, base), bats = roster.bat.map(p => ratingsOf(p)), pits = roster.pit.map(p => ratingsOf(p));
  const pit = mean(pits.map(r => r.ovr)), bat = mean(bats.map(r => (r.con + r.pow + r.eye) / 3));
  const def = mean(bats.map(r => DEF_ARM_SHARE * r.arm + (1 - DEF_ARM_SHARE) * (r.def === undefined ? RATING_MID : r.def)));
  return { pit: whole(pit), bat: whole(bat), def: whole(def), all: whole((pit + bat + def) / 3) };
}
