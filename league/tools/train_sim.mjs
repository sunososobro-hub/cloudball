/* How long a created player takes to reach the 一軍 (#369; potential caps the overall since #374). Hand-run, deterministic, prints only.
 *
 *   node league/tools/train_sim.mjs
 *
 * PLAYERS seeded created players (half batters, half pitchers; random legal point spreads and random training splits,
 * every tenth one with the even split) train day by day with league/training.js, twice: hands-off (bonus 0) and
 * active (ACTIVE_BONUS every day). Targets come from league/site/players.json (tier 1 = 一軍), nearest-rank:
 * the median overall and the bottom quartile. For each target it prints how many reach it within HORIZON days and,
 * over all players (a player who never reaches it counts as "never", sorted last), the p25 / median / p75 days, and the
 * same among the players who reach it. Two what-if rows drop the potential cap (NO_STOP) to show how much it decides.
 * It also prints the potential draw against the 一軍: share at or above the median, above the p75, and at or above
 * RATING_TOP (the star line of league/ratings.js, the rare tail), exact from the constants and as drawn.
 * Pitch lists (#378 part 2): the pitchers again, each with 1, 3 and 5 pitches (CREATE.pitches in order, the default
 * split of his role with that list; 5 is more than a created pitcher starts with, as if he learned two), hands-off and
 * active: days to the 一軍 median and the mean pitch rating gained after one season.
 * Learning (#378 part 5): the 1-pitch pitchers learn the next pitch with learnPitch, at LEARN_SHARE and at LEARN_WIDE
 * percent, hands-off and active: days until he can throw it (LEARN_AT).
 * Decline (#433): AGE_PLAYERS of the same players train on past the peak, hands-off and active; it prints the overall
 * p25 / median / p75 on the first day of each age in TABLE_AGES (up to 18 seasons for a 20-year-old) and after
 * LONG_SEASONS seasons.
 * Call-up (#500): for each player, days until he is ready (his overall at the weakest starter of his position, league/callup.js)
 * and, from then on, days until a slot opens at that position. Slots open only when a starter retires (RETIRE_AGE), on the
 * day his age gets there (starters keep their overall, nobody else queues: the best case, the wait is at least this long).
 * Printed as it comes out, never tuned. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CREATE, makePlayer, potShareAtLeast } from '../freeagents.js';
import { RATING_TOP } from '../ratings.js';
import { RETIRE_AGE, slotPos, weakestAt, starters } from '../callup.js';
import { trainDay, overallOf, ageOn, declineFactor, defaultSplit, learnPitch, learnSplit, knownPitches, ACTIVE_BONUS, DAYS_PER_SEASON, SPLIT_TOTAL, LEARN_SHARE } from '../training.js';

export const PLAYERS = 1000, SIM_SEED = 369, SEASONS = 3, HORIZON = SEASONS * DAYS_PER_SEASON, EVEN_EVERY = 10;
const LOOK = { head: 0, skin: 0, hair: 0 };

const rng = seed => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
/* nearest-rank quantile (no interpolation: a real player's number) */
const rank = (sorted, q) => sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)];

export function targets(players) {
  const o = Object.values(players).filter(p => p.tier === 1).map(p => p.overall).sort((a, b) => a - b);
  return { median: rank(o, 0.5), bottom: rank(o, 0.25), p75: rank(o, 0.75), n: o.length };
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
    : { kind, role: CREATE.roles[(i >> 1) % CREATE.roles.length], throws: 'R', build: 'normal', look: LOOK, points };
  if (i % EVEN_EVERY) c.train = spread(r, keys, SPLIT_TOTAL, 0, SPLIT_TOTAL);
  return c;
}

/* days until the overall first reaches each goal (Infinity = not within HORIZON) */
/* free = true: what-if without the potential stop (pot set to NO_STOP), to show how much the stop decides */
export const NO_STOP = 99;
export function daysTo(made, bonus, seed, goals, free = false) {
  const { player: p, ratings } = made, pit = !!p.role;
  const s = { pit, age0: p.age, day: 0, pot: free ? NO_STOP : ratings.pot, split: p.train, abil: Object.fromEntries(Object.keys(p.train).map(k => [k, k in ratings ? ratings[k] : p.pitches[k]])) };
  const r = rng(seed), out = goals.map(() => Infinity);
  let ovr = overallOf(s);
  for (;;) {
    goals.forEach((g, j) => { if (out[j] === Infinity && ovr >= g) out[j] = s.day; });
    if (s.day >= HORIZON || out.every(d => d !== Infinity)) return out;
    if (trainDay(s, r, bonus) > 0 || declineFactor(ageOn(s)) > 0) ovr = overallOf(s);
  }
}

/* a created pitcher given the first n pitches of CREATE.pitches (each at his stuff rating) and his role's default split */
export const PITCH_COUNTS = [1, 3, 5];
export function withPitches(made, n) {
  const names = CREATE.pitches.slice(0, n), p = made.player;
  return { ...made, player: { ...p, pitches: Object.fromEntries(names.map(k => [k, made.ratings.stuff])), train: defaultSplit('pit', p.role, names) } };
}
/* days to goal and mean pitch points gained in the first season */
export function pitchRun(made, bonus, seed, goal) {
  const [days] = daysTo(made, bonus, seed, [goal]);
  const { player: p, ratings } = made, names = Object.keys(p.pitches);
  const s = { pit: true, age0: p.age, day: 0, pot: ratings.pot, split: p.train, abil: Object.fromEntries(Object.keys(p.train).map(k => [k, k in ratings ? ratings[k] : p.pitches[k]])) }, r = rng(seed);
  while (s.day < DAYS_PER_SEASON) trainDay(s, r, bonus);
  return { days, gain: names.reduce((t, k) => t + s.abil[k] - p.pitches[k], 0) / names.length };
}

/* days until a created pitcher (his list as made) can throw the pitch name, learning it at pct percent of his
 * training (the rest of his split in its old ratio); Infinity = not within HORIZON */
export const LEARN_WIDE = 30;
export function learnDays(made, name, pct, bonus, seed) {
  const { player: p, ratings } = made;
  const s = { pit: true, age0: p.age, day: 0, pot: ratings.pot, split: p.train, abil: Object.fromEntries(Object.keys(p.train).map(k => [k, k in ratings ? ratings[k] : p.pitches[k]])) };
  if (learnPitch(s, name, learnSplit(p.train, name, pct)).length) throw new Error(`learnPitch refused ${name}`);
  const r = rng(seed);
  while (!knownPitches(s).includes(name)) { if (s.day >= HORIZON) return Infinity; trainDay(s, r, bonus); }
  return s.day;
}

/* overall on the first day of each age in ages, and after `seasons` seasons; trains until both are past */
export const TABLE_AGES = [25, 30, 34, 38], LONG_SEASONS = 10, AGE_PLAYERS = 200;
export function ageRun(made, bonus, seed, ages = TABLE_AGES, seasons = LONG_SEASONS) {
  const { player: p, ratings } = made;
  const s = { pit: !!p.role, age0: p.age, day: 0, pot: ratings.pot, split: p.train, abil: Object.fromEntries(Object.keys(p.train).map(k => [k, k in ratings ? ratings[k] : p.pitches[k]])) };
  const r = rng(seed), at = {}, end = Math.max(seasons, ages[ages.length - 1] - p.age) * DAYS_PER_SEASON;
  for (;;) {
    const age = ageOn(s);
    if (ages.includes(age) && !(age in at)) at[age] = overallOf(s);
    if (s.day === seasons * DAYS_PER_SEASON) at.long = overallOf(s);
    if (s.day >= end) return at;
    trainDay(s, r, bonus);
  }
}

/* days until the first slot opens at pos on or after day `from`: the starters' retirement days from the real roster */
export const WAIT_SEASONS = 20;
export function slotDays(players, pos) {
  return starters(players).filter(p => slotPos(p) === pos).map(p => (RETIRE_AGE - p.age) * DAYS_PER_SEASON).sort((a, b) => a - b);
}
export const waitFrom = (days, from) => { const d = days.find(x => x >= from); return d === undefined ? Infinity : d - from; };

export function simulate() {
  const players = JSON.parse(readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../site/players.json'), 'utf8'));
  const t = targets(players), goals = [t.median, t.bottom], r = rng(SIM_SEED), res = { hands: [[], []], active: [[], []], 'hands, no pot stop': [[], []], 'active, no pot stop': [[], []] };
  const start = [], pots = [], byPitches = Object.fromEntries(PITCH_COUNTS.flatMap(n => [[`${n} hands`, []], [`${n} active`, []]]));
  const ageTab = { hands: [], active: [] };
  const callup = { hands: { ready: [], wait: [] }, active: { ready: [], wait: [] } }, slotTab = {};
  const learn = Object.fromEntries([LEARN_SHARE, LEARN_WIDE].flatMap(n => [[`${n} % hands`, []], [`${n} % active`, []]]));
  for (let i = 0; i < PLAYERS; i++) {
    const made = makePlayer((SIM_SEED * 100003 + i) >>> 0, choiceOf(i, r));
    start.push(made.ratings.ovr); pots.push(made.ratings.pot);
    for (const [mode, bonus, free] of [['hands', 0, false], ['active', ACTIVE_BONUS, false], ['hands, no pot stop', 0, true], ['active, no pot stop', ACTIVE_BONUS, true]])
      daysTo(made, bonus, i + 1, goals, free).forEach((d, j) => res[mode][j].push(d));
    const pos = slotPos(made.player), line = weakestAt(players, pos);
    slotTab[pos] ??= slotDays(players, pos);
    for (const [mode, bonus] of [['hands', 0], ['active', ACTIVE_BONUS]]) {
      const [d] = daysTo(made, bonus, i + 1, [line]);
      callup[mode].ready.push(d);
      if (d !== Infinity) callup[mode].wait.push(waitFrom(slotTab[pos], d));
    }
    if (made.player.role) for (const n of PITCH_COUNTS) for (const [mode, bonus] of [['hands', 0], ['active', ACTIVE_BONUS]])
      byPitches[`${n} ${mode}`].push(pitchRun(withPitches(made, n), bonus, i + 1, t.median));
    if (i < AGE_PLAYERS) for (const [mode, bonus] of [['hands', 0], ['active', ACTIVE_BONUS]]) ageTab[mode].push(ageRun(made, bonus, i + 1));
    if (made.player.role) for (const pct of [LEARN_SHARE, LEARN_WIDE]) for (const [mode, bonus] of [['hands', 0], ['active', ACTIVE_BONUS]])
      learn[`${pct} % ${mode}`].push(learnDays(withPitches(made, 1), CREATE.pitches[1], pct, bonus, i + 1));
  }
  return { t, res, byPitches, learn, ageTab, callup, slotTab, start: start.sort((a, b) => a - b), pots: pots.sort((a, b) => a - b) };
}

const fmt = d => (d === Infinity ? 'never' : String(d));
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { t, res, byPitches, learn, ageTab, callup, slotTab, start, pots } = simulate();
  console.log(`train_sim (#369): ${PLAYERS} created players (seed ${SIM_SEED}), horizon ${HORIZON} days (${SEASONS} seasons of ${DAYS_PER_SEASON}), active bonus ${ACTIVE_BONUS}/day`);
  console.log(`一軍 (${t.n} players in league/site/players.json): median overall ${t.median}, bottom quartile ${t.bottom}`);
  console.log(`一軍 p75 ${t.p75}; created at day 0: overall p25/median/p75 ${[0.25, 0.5, 0.75].map(q => rank(start, q)).join('/')}, potential (hidden) ${[0.25, 0.5, 0.75].map(q => rank(pots, q)).join('/')}`);
  const pct = x => `${(100 * x).toFixed(1)} %`, drawn = th => pots.filter(x => x >= th).length / pots.length;
  for (const [name, th] of [[`potential >= 一軍 median ${t.median}`, t.median], [`potential > 一軍 p75 ${t.p75}`, t.p75 + 1], [`potential >= star line ${RATING_TOP}`, RATING_TOP]])
    console.log(`  ${name.padEnd(30)}: exact ${pct(potShareAtLeast(th))}, drawn ${pct(drawn(th))}`);
  for (const [j, name] of [[0, `median ${t.median}`], [1, `bottom quartile ${t.bottom}`]]) for (const mode of Object.keys(res)) {
    const d = [...res[mode][j]].sort((a, b) => a - b), ok = d.filter(x => x !== Infinity), got = ok.length;
    const of = got ? `; of those reaching it p25/median/p75 ${[0.25, 0.5, 0.75].map(q => rank(ok, q)).join('/')}` : '';
    console.log(`  ${name.padEnd(18)} ${mode.replace('hands', 'hands-off').padEnd(23)}: reached ${String(got).padStart(4)}/${PLAYERS} (${(100 * got / PLAYERS).toFixed(1)} %), all players p25/median/p75 ${[0.25, 0.5, 0.75].map(q => fmt(rank(d, q))).join('/')}${of}`);
  }
  console.log(`pitchers by pitch count (#378 part 2: ${PITCH_COUNTS.join('/')} pitches, default split of the role), to the 一軍 median ${t.median}:`);
  for (const [k, list] of Object.entries(byPitches)) {
    const d = list.map(x => x.days).sort((a, b) => a - b), got = d.filter(x => x !== Infinity).length, gain = list.reduce((s, x) => s + x.gain, 0) / list.length;
    console.log(`  ${k.replace('hands', 'hands-off').padEnd(12)}: reached ${String(got).padStart(3)}/${list.length}, days p25/median/p75 ${[0.25, 0.5, 0.75].map(q => fmt(rank(d, q))).join('/')}; season-1 gain per pitch ${gain.toFixed(1)}`);
  }
  console.log(`learning a second pitch (#378 part 5: ${CREATE.pitches[1]} for the 1-pitch pitchers), days until he can throw it:`);
  for (const [k, list] of Object.entries(learn)) {
    const d = [...list].sort((a, b) => a - b), got = d.filter(x => x !== Infinity).length;
    console.log(`  ${k.replace('hands', 'hands-off').padEnd(14)}: learned ${String(got).padStart(3)}/${list.length}, days p25/median/p75 ${[0.25, 0.5, 0.75].map(q => fmt(rank(d, q))).join('/')}`);
  }
  console.log(`decline (#433): overall p25/median/p75 of the first ${AGE_PLAYERS} players (created at 20 to 24) by age, and after ${LONG_SEASONS} seasons:`);
  for (const [mode, list] of Object.entries(ageTab)) {
    const q = key => { const v = list.map(x => x[key]).sort((a, b) => a - b); return [0.25, 0.5, 0.75].map(x => rank(v, x)).join('/'); };
    console.log(`  ${mode.replace('hands', 'hands-off').padEnd(9)}: ${TABLE_AGES.map(a => `age ${a} ${q(a)}`).join(', ')}; ${LONG_SEASONS} seasons ${q('long')}`);
  }
  console.log(`call-up (#500): ready = overall at the weakest 一軍 starter of his position; a slot opens only when a starter reaches age ${RETIRE_AGE}. Days of ${DAYS_PER_SEASON} per season, the real roster, nobody else in the queue:`);
  console.log(`  first slot opens at day: ${Object.entries(slotTab).map(([k, v]) => `${k} ${v[0] ?? 'never'}`).join(', ')}`);
  for (const [mode, c] of Object.entries(callup)) {
    const rd = [...c.ready].sort((a, b) => a - b), ok = rd.filter(x => x !== Infinity), w = [...c.wait].sort((a, b) => a - b), now = w.filter(x => x === 0).length;
    console.log(`  ${mode.replace('hands', 'hands-off').padEnd(9)}: ready ${ok.length}/${PLAYERS}, median days to ready ${fmt(rank(rd, 0.5))} (of those ready ${ok.length ? rank(ok, 0.5) : 'n/a'}); ready -> called up p25/median/p75 ${[0.25, 0.5, 0.75].map(q => fmt(rank(w, q))).join('/')} days (${now} of ${w.length} have a slot open the day they are ready)`);
  }
}
