/* Site rows -> engine rosters (#748 part 1). Pure, no RNG, no clock, no import of the engine (rule 10).
 *
 * players.json rows carry 1..100 display numbers only; the engine wants the raw 1.0-centred values. `ratingsOf.raw` is the inverse of the
 * display scale (a whole display number goes there and back unchanged), so a converted player rates exactly like his row, though a raw value
 * that was never a whole display number comes back snapped to the nearest one. Fields the rows do not hold (body, height) use the
 * `normal` build; the engine ignores them (they only draw the player). The bench is not on the site, so it comes back empty.
 *
 * siteRoster(players, teamId, tier) -> { bat, pit, bench: [] } in the shape of league/players.js:
 *   bat = the team's lineup of that tier (`lineup()`: one batter per position, best overall first), pit = starters (SP) best first, then the bullpen. */
import { ratingsOf } from './ratings.js';
import { CREATE } from './freeagents.js';

const LINEUP_SIZE = CREATE.positions.length;   /* the nine of a lineup, DH included (the engine's LINEUP_SIZE) */
const NORMAL = CREATE.builds.normal, r3 = x => Math.round(x * 1000) / 1000;
const byOverall = (a, b) => b.overall - a.overall || (a.id < b.id ? -1 : 1);

export function sitePlayer(id, row) {
  const pit = row.role === 'P', a = row.abilities, raw = k => ratingsOf.raw(pit, k, a[k]);
  const p = { id, name: row.name, num: row.num, age: row.age };
  if (pit) Object.assign(p, { role: row.pos, stuff: r3(raw('stuff')), ctrl: r3(raw('ctrl')), pot: r3(raw('pot')), throws: row.hand, arm: r3(raw('arm')) });
  else Object.assign(p, { pos: row.pos, con: r3(raw('con')), pow: r3(raw('pow')), eye: r3(raw('eye')), pot: r3(raw('pot')), arm: r3(raw('arm')), spd: r3(raw('spd')), hand: row.hand });
  return Object.assign(p, { body: { ...NORMAL.body }, ht: Math.round((NORMAL.ht[0] + NORMAL.ht[1]) / 2 * 100) / 100 });
}

/* The lineup: LINEUP_SIZE batters, the best overall at each position first, then (only when a position is empty) the best of the rest, in overall order;
 * the surplus of a lopsided 二軍 does not play. Fewer than LINEUP_SIZE batters on the team: all of them. */
export function lineup(batters) {
  const seen = new Set(), best = batters.filter(p => !seen.has(p.pos) && seen.add(p.pos)).slice(0, LINEUP_SIZE);
  return [...best, ...batters.filter(p => !best.includes(p))].slice(0, LINEUP_SIZE).sort(byOverall);
}

export function siteRoster(players, teamId, tier) {
  const mine = Object.entries(players).filter(([, p]) => p.team === teamId && p.tier === tier).map(([id, p]) => ({ id, ...p })).sort(byOverall);
  const bat = lineup(mine.filter(p => p.role === 'B')).map(p => sitePlayer(p.id, p));
  const pit = mine.filter(p => p.role === 'P'), sp = pit.filter(p => p.pos === 'SP'), rest = pit.filter(p => p.pos !== 'SP');
  return { bat, pit: [...sp, ...rest].map(p => sitePlayer(p.id, p)), bench: [] };
}
