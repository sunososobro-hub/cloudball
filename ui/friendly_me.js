/* 友誼賽: the visitor's own batter for the picker (#751 part 3). Read-only: the id the browser remembers (same key as the data site),
 * his row in league/site/players.json. Nothing is written anywhere. Returns null when there is no player, he is a pitcher, or he
 * is on no 一軍 / 二軍 team. */
import { TEAMS } from '../league/teams.js';
import { MY_PLAYER_KEY } from './site/shared.js';

export async function myBatter(read = k => localStorage.getItem(k), load = u => fetch(u, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null))) {
  try {
    const id = read(MY_PLAYER_KEY);
    if (!id) return null;
    const row = ((await load('league/site/players.json')) || {})[id];
    const team = row ? TEAMS.findIndex(t => t.id === row.team) : -1;
    if (!row || row.role !== 'B' || team < 0 || (row.tier !== 1 && row.tier !== 2)) return null;
    return { id, team, row };
  } catch (e) { return null; }
}

/* display ratings of his row as the link carries them (whole 1..100 numbers) */
export const ownOf = (row, side, slot) => ({ side, slot, con: row.abilities.con, pow: row.abilities.pow, eye: row.abilities.eye, spd: row.abilities.spd, arm: row.abilities.arm, hand: row.hand === 'L' ? 'L' : 'R', age: row.age, num: row.num, name: row.name });
