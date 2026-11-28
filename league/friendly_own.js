/* 友誼賽 own player (#751 part 3): the visitor's batter in one lineup slot. Pure: no clock, no randomness, no DOM, no network, no storage.
 * Never official (rule 24): reads the factory rosters it is given, returns copies, writes nothing.
 *
 *   ownPitcher(o)              engine starter (league/players.js shape) from a pitcher link (#751 part 4); takes the SP place `o.slot`
 *   ownBatter(o, pos)          engine batter (league/players.js shape) from the link's display ratings; plays `pos`, the slot's position
 *   ownRosters(o, a, base)     `base` (the engine's ROSTERS) with the arranged team's lineup slot swapped for him; other teams are the same objects
 *   ownSide(o, a)              team index of the side he plays for
 * Display number -> raw rating is `ratingsOf.raw`, as in league/site_roster.js (a whole display number goes there and back unchanged). */
import { sitePlayer } from './site_roster.js';

const POT = 50;   /* growth only; the engine does not read it in a game */

export function ownBatter(o, pos) {
  const row = { name: o.name, num: o.num, age: o.age, role: 'B', pos, hand: o.hand, abilities: { con: o.con, pow: o.pow, eye: o.eye, spd: o.spd, arm: o.arm, pot: POT } };
  return sitePlayer('own', row);
}

export function ownPitcher(o) {
  const row = { name: o.name, num: o.num, age: o.age, role: 'P', pos: 'SP', hand: o.hand, abilities: { stuff: o.stuff, ctrl: o.ctrl, arm: o.arm, pot: POT } };
  return sitePlayer('own', row);
}

export const ownSide = (o, a) => (o.side === 0 ? a.away : a.home);

export function ownRosters(o, a, base) {
  const t = ownSide(o, a), team = base[t];
  if (o.role === 'P') {
    if (!team.pit[o.slot]) throw new Error(`team ${t} has no starter ${o.slot}`);
    return base.map((r, i) => (i === t ? { ...r, pit: r.pit.map((p, k) => (k === o.slot ? ownPitcher(o) : p)) } : r));
  }
  const slot = team.bat[o.slot];
  if (!slot) throw new Error(`team ${t} has no lineup slot ${o.slot}`);
  return base.map((r, i) => (i === t ? { ...r, bat: r.bat.map((b, k) => (k === o.slot ? ownBatter(o, slot.pos) : b)) } : r));
}
