/* How long a created player takes to reach the 一軍 (#369). Hand-run, deterministic, prints only.
 *
 *   node league/tools/train_sim.mjs
 *
 * PLAYERS seeded created players (half batters, half pitchers; random legal point spreads and random training splits,
 * every tenth one with the even split) train day by day with league/training.js, twice: hands-off (bonus 0) and
 * active (ACTIVE_BONUS every day). Targets come from league/site/players.json (tier 1 = 一軍), nearest-rank:
 * the median overall and the bottom quartile. For each target it prints how many reach it within HORIZON days and,
 * over all players (a player who never reaches it counts as "never", sorted last), the p25 / median / p75 days, and the
 * same among the players who reach it. Two what-if rows drop the potential stop (NO_STOP) to show how much it decides. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CREATE, makePlayer } from '../freeagents.js';
import { ratingsOf } from '../ratings.js';
import { trainDay, overallOf, ACTIVE_BONUS, DAYS_PER_SEASON, SPLIT_TOTAL } from '../training.js';

export const PLAYERS = 1000, SIM_SEED = 369, SEASONS = 3, HORIZON = SEASONS * DAYS_PER_SEASON, EVEN_EVERY = 10;
const LOOK = { head: 0, skin: 0, hair: 0 };

const rng = seed => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
/* nearest-rank quantile (no interpolation: a real player's number) */
const rank = (sorted, q) => sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)];

export function targets(players) {
  const o = Object.values(players).filter(p => p.tier === 1).map(p => p.overall).sort((a, b) => a - b);
  return { median: rank(o, 0.5), bottom: rank(o, 0.25), n: o.length };
}

/* integer parts that sum to total, each in [lo, hi], spread at random */
function spread(r, keys, total, lo, hi) {
  const out = Object.fromEntries(keys.map(k => [k, lo])); let left = total - lo * keys.length;
  while (left > 0) { const k = keys[Math.floor(r() * keys.length)]; if (out[k] < hi) { out[k]++; left--; } }
  return out;
}
export function choiceOf(i, r) {
  const kind = i % 2 ? 'pit' : 'bat', keys = CREATE.keys[kind];
  const points = spread(r, keys, CREATE.budget[kind], CREATE.floor, CREATE.cap[kind]);
  const c = kind === 'bat' ? { kind, pos: CREATE.positions[i % CREATE.positions.length], bats: 'R', build: 'normal', look: LOOK, points }
    : { kind, role: CREATE.roles[i % 2], throws: 'R', build: 'normal', look: LOOK, points };
  if (i % EVEN_EVERY) c.train = spread(r, keys, SPLIT_TOTAL, 0, SPLIT_TOTAL);
  return c;
}

/* days until the overall first reaches each goal (Infinity = not within HORIZON) */
/* free = true: what-if without the potential stop (pot set to NO_STOP), to show how much the stop decides */
export const NO_STOP = 99;
export function daysTo(made, bonus, seed, goals, free = false) {
  const { player: p, ratings } = made, pit = !!p.role;
  const s = { pit, age0: p.age, day: 0, pot: free ? NO_STOP : ratings.pot, split: p.train, abil: Object.fromEntries(Object.keys(p.train).map(k => [k, ratings[k]])) };
  const r = rng(seed), out = goals.map(() => Infinity);
  let ovr = overallOf(s);
  for (;;) {
    goals.forEach((g, j) => { if (out[j] === Infinity && ovr >= g) out[j] = s.day; });
    if (s.day >= HORIZON || out.every(d => d !== Infinity)) return out;
    if (trainDay(s, r, bonus) > 0) ovr = overallOf(s);
  }
}

export function simulate() {
  const players = JSON.parse(readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../site/players.json'), 'utf8'));
  const t = targets(players), goals = [t.median, t.bottom], r = rng(SIM_SEED), res = { hands: [[], []], active: [[], []], 'hands, no pot stop': [[], []], 'active, no pot stop': [[], []] };
  const start = [], pots = [];
  for (let i = 0; i < PLAYERS; i++) {
    const made = makePlayer((SIM_SEED * 100003 + i) >>> 0, choiceOf(i, r));
    start.push(made.ratings.ovr); pots.push(made.ratings.pot);
    for (const [mode, bonus, free] of [['hands', 0, false], ['active', ACTIVE_BONUS, false], ['hands, no pot stop', 0, true], ['active, no pot stop', ACTIVE_BONUS, true]])
      daysTo(made, bonus, i + 1, goals, free).forEach((d, j) => res[mode][j].push(d));
  }
  return { t, res, start: start.sort((a, b) => a - b), pots: pots.sort((a, b) => a - b) };
}

const fmt = d => (d === Infinity ? 'never' : String(d));
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { t, res, start, pots } = simulate();
  console.log(`train_sim (#369): ${PLAYERS} created players (seed ${SIM_SEED}), horizon ${HORIZON} days (${SEASONS} seasons of ${DAYS_PER_SEASON}), active bonus ${ACTIVE_BONUS}/day`);
  console.log(`一軍 (${t.n} players in league/site/players.json): median overall ${t.median}, bottom quartile ${t.bottom}`);
  console.log(`created at day 0: overall p25/median/p75 ${[0.25, 0.5, 0.75].map(q => rank(start, q)).join('/')}, potential ${[0.25, 0.5, 0.75].map(q => rank(pots, q)).join('/')}`);
  for (const [j, name] of [[0, `median ${t.median}`], [1, `bottom quartile ${t.bottom}`]]) for (const mode of Object.keys(res)) {
    const d = [...res[mode][j]].sort((a, b) => a - b), ok = d.filter(x => x !== Infinity), got = ok.length;
    const of = got ? `; of those reaching it p25/median/p75 ${[0.25, 0.5, 0.75].map(q => rank(ok, q)).join('/')}` : '';
    console.log(`  ${name.padEnd(18)} ${mode.replace('hands', 'hands-off').padEnd(23)}: reached ${String(got).padStart(4)}/${PLAYERS} (${(100 * got / PLAYERS).toFixed(1)} %), all players p25/median/p75 ${[0.25, 0.5, 0.75].map(q => fmt(rank(d, q))).join('/')}${of}`);
  }
}
