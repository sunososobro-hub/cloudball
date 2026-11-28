/* Guild power summary (#800 part 4). Pure: no clock, no randomness, no engine, no network, no storage (rule 10). Display only, never official (rule 24):
 * nothing here feeds a game, a pairing or a division (those are later parts); it only reads the roster the guild plays with.
 *   guildPower(guild, base, rate = ratingsOf) -> { bat, pit, def }  whole numbers on the 1..100 display scale
 *   bat = mean overall of the nine lineup batters; pit = mean overall of the pitching staff (starters and bullpen);
 *   def = mean of the lineup's 守備 numbers: a batter's own `def` when he has one, else the mean of his arm and speed (the factory players carry no def).
 * The roster is league/guild_roster.js `guildRoster(guild, base)`: members take the seats of the base team's 一軍. An empty guild reads as the base team. */
import { ratingsOf } from './ratings.js';
import { guildRoster } from './guild_roster.js';

const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const whole = x => Math.round(x);

export function rosterPower(roster, rate = ratingsOf) {
  const bat = roster.bat.map(rate), pit = roster.pit.map(rate);
  return {
    bat: whole(mean(bat.map(r => r.ovr))),
    pit: whole(mean(pit.map(r => r.ovr))),
    def: whole(mean(bat.map(r => (r.def !== undefined ? r.def : (r.arm + r.spd) / 2)))),
  };
}

export const guildPower = (guild, base, rate = ratingsOf) => rosterPower(guildRoster(guild, base).roster, rate);
