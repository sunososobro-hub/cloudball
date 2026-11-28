/* 友誼賽: the visitor's own batter for the picker (#751 part 3). Read-only: the id the browser remembers (same key as the data site),
 * his row in league/site/players.json. Nothing is written anywhere. myBatter / myPitcher return null when there is no player, he is the
 * other kind, or he is on no 一軍 / 二軍 team. */
import { TEAMS } from '../league/teams.js';
import { MY_PLAYER_KEY } from './site/shared.js';
import { ROSTERS } from '../league/players.js';

/* #751 part 6: his look. league/site/players.json rows hold no body / height; the row's own look wins when it has one, else the factory
 * player of the same id (league/players.js), else none (the link draws him with the normal build). Returned as the link's 0..100 / cm. */
export function lookOf(id, row) {
  const f = row && row.body && row.ht ? row : ROSTERS.flatMap(t => [...t.bat, ...(t.bench || []), ...t.pit]).find(p => p.id === id);
  if (!f || !f.body || !(f.ht > 0)) return null;
  const w = k => Math.min(100, Math.max(0, Math.round((f.body[k] || 0) * 100)));
  return { body: { slim: w('slim'), power: w('power'), heavy: w('heavy') }, ht: Math.round(f.ht * 100) };
}

async function mine(role, read, load) {
  try {
    const id = read(MY_PLAYER_KEY);
    if (!id) return null;
    const row = ((await load('league/site/players.json')) || {})[id];
    const team = row ? TEAMS.findIndex(t => t.id === row.team) : -1;
    if (!row || row.role !== role || team < 0 || (row.tier !== 1 && row.tier !== 2)) return null;
    const look = lookOf(id, row);
    return { id, team, row: look ? { ...row, look } : row };
  } catch (e) { return null; }
}
const defRead = k => localStorage.getItem(k), defLoad = u => fetch(u, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null));
/* #751 part 4: the visitor's pitcher (same rules, role 'P'); he replaces one of the five starters */
export const myPitcher = (read = defRead, load = defLoad) => mine('P', read, load);
export const ownOfPitcher = (row, side, slot) => ({ role: 'P', side, slot, stuff: row.abilities.stuff, ctrl: row.abilities.ctrl, arm: row.abilities.arm, hand: row.hand === 'L' ? 'L' : 'R', age: row.age, num: row.num, name: row.name, ...(row.look || {}) });

export const myBatter = (read = defRead, load = defLoad) => mine('B', read, load);

/* display ratings of his row as the link carries them (whole 1..100 numbers) */
export const ownOf = (row, side, slot) => ({ side, slot, con: row.abilities.con, pow: row.abilities.pow, eye: row.abilities.eye, spd: row.abilities.spd, arm: row.abilities.arm, hand: row.hand === 'L' ? 'L' : 'R', age: row.age, num: row.num, name: row.name, ...(row.look || {}) });
