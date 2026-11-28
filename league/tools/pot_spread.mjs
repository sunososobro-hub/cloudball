/* Spread of the hidden potential (#794 part 4, owner concern 2026-11-28: no character may feel doomed from day 1).
 * Hand-run, deterministic, prints only:
 *
 *   node league/tools/pot_spread.mjs [--players N]
 *
 * One build per kind (the even point spread and the default training split of league/freeagents.js; batters at 1B,
 * pitchers as SP), PLAYERS seeds each, all with age AGE_FIXED so only the potential draw differs. Each grows with
 * league/growth.js growTo (the product's own lazy growth, its own day RNG) for each of SEASONS_AT seasons, hands-off
 * and active (ACTIVE_BONUS every day). It prints, per kind / mode / season, the final overall at the lowest decile,
 * the median and the top decile, the p90 - p10 gap, and the share at or above the weakest 一軍 starter of the factory
 * league and the 一軍 median (league/tools/train_sim.mjs targets). The potential itself is never shown to fans. */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CREATE, makePlayer } from '../freeagents.js';
import { growTo, viewOf } from '../growth.js';
import { ACTIVE_BONUS, DAYS_PER_SEASON } from '../training.js';
import { factoryPlayers } from './site.mjs';
import { targets } from './train_sim.mjs';

export const PLAYERS = 1000, SIM_SEED = 794, AGE_FIXED = 21, SEASONS_AT = [1, 3, 6];
export const DECILES = [0.1, 0.5, 0.9];
const LOOK = { head: 0, skin: 0, hair: 0 };
const rank = (sorted, q) => sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)];

/* the even legal spread of a kind's budget (sum = budget, each within floor..cap) */
export function evenPoints(kind) {
  const keys = CREATE.keys[kind], b = CREATE.budget[kind], base = Math.floor(b / keys.length);
  return Object.fromEntries(keys.map((k, i) => [k, base + (i < b - base * keys.length ? 1 : 0)]));
}
export const choiceOfKind = kind => (kind === 'bat'
  ? { kind, pos: '1B', bats: 'R', build: 'normal', look: LOOK, points: evenPoints(kind) }
  : { kind, role: 'SP', throws: 'R', build: 'normal', look: LOOK, points: evenPoints(kind) });

/* overall after each of `seasons` (in days), for one player; bonus = a plain number every day (0 = hands-off) */
export function overallsAt(made, bonus, seasons = SEASONS_AT) {
  const p = { ...made.player, age: AGE_FIXED };
  if (bonus) p.bonus = Object.fromEntries(Array.from({ length: seasons[seasons.length - 1] * DAYS_PER_SEASON }, (_, d) => [d, bonus]));
  return seasons.map(n => viewOf(p, made.ratings, growTo(p, made.ratings, n * DAYS_PER_SEASON)).ratings.ovr);
}

export function simulate(players = PLAYERS) {
  const t = targets(factoryPlayers()), weakest = t.bottom;
  const out = {};
  for (const kind of CREATE.kinds) {
    const c = choiceOfKind(kind), pots = [], start = [], by = { hands: SEASONS_AT.map(() => []), active: SEASONS_AT.map(() => []) };
    for (let i = 0; i < players; i++) {
      const made = makePlayer((SIM_SEED * 100003 + i * 2 + (kind === 'pit')) >>> 0, c);
      pots.push(made.ratings.pot); start.push(made.ratings.ovr);
      for (const [mode, bonus] of [['hands', 0], ['active', ACTIVE_BONUS]]) overallsAt(made, bonus).forEach((o, j) => by[mode][j].push(o));
    }
    const q = list => { const s = [...list].sort((a, b) => a - b); return { p10: rank(s, 0.1), med: rank(s, 0.5), p90: rank(s, 0.9), atBottom: s.filter(x => x >= weakest).length / s.length, atMedian: s.filter(x => x >= t.median).length / s.length }; };
    out[kind] = { pot: q(pots), start: q(start), rows: Object.fromEntries(Object.entries(by).map(([m, l]) => [m, l.map(q)])) };
  }
  return { t, out, players };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--players'), n = i > 0 ? Number(process.argv[i + 1]) : PLAYERS;
  const { t, out } = simulate(n), pct = x => `${(100 * x).toFixed(0)} %`;
  console.log(`pot_spread (#794): ${n} players per kind (seed ${SIM_SEED}), even points, default split, age ${AGE_FIXED}; 一軍 bottom quartile ${t.bottom}, median ${t.median}`);
  for (const [kind, o] of Object.entries(out)) {
    console.log(`${kind}: potential (hidden) p10/median/p90 ${o.pot.p10}/${o.pot.med}/${o.pot.p90}; overall at creation ${o.start.med}`);
    for (const [mode, rows] of Object.entries(o.rows)) rows.forEach((r, j) =>
      console.log(`  ${mode.replace('hands', 'hands-off').padEnd(9)} season ${SEASONS_AT[j]}: overall p10/median/p90 ${r.p10}/${r.med}/${r.p90} (gap ${r.p90 - r.p10}), >= 一軍 bottom quartile ${pct(r.atBottom)}, >= median ${pct(r.atMedian)}`));
  }
}
