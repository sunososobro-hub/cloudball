/* Daily training of created players (#369). Pure: no DOM, network, clock or unseeded randomness; the caller gives
 * every seed. Display only in this ticket: nothing here changes ROSTERS or a game (rule 10); it is the model a later
 * season-1 ticket can run server-side, and the model league/tools/train_sim.mjs measures. Data format: CC0.
 *
 *   validateSplit(keys, split)   list of plain reasons; empty = fine. A split: { <ability key>: whole percent }, sum 100.
 *   evenSplit(keys)              the split used when a fan leaves the sliders alone.
 *   ageFactor(age)               growth multiplier of that age (AGE_CURVE, straight lines between its points).
 *   trainDay(state, r, bonus)    one day: state { pit, age0, day, pot, split, abil: { key: display value } } grows
 *                                in place; r is the seeded RNG; bonus is the plain number a training mini-game
 *                                gave that day (0 = hands-off). Returns the display points gained that day.
 *   roomFactor(ovr, pot)         share of the day's gain left this close to the potential (1 far away, 0 at it).
 *   overallOf(state)             the overall a state reads as (league/ratings.js, whole display numbers).
 *
 * The model, in display points (the 1 to 100 scale of league/ratings.js):
 *   gain of the day = min(DAILY_CAP, BASE_GAIN * ageFactor(age) * jitter + bonus), jitter uniform in 1 +- JITTER;
 *   potential caps the OVERALL, not each ability (#374): the gain is multiplied by roomFactor, which falls in a straight
 *   line over the last POT_SLOW_BAND overall points below the potential, so growth slows near the ceiling and stops at
 *   it; a day that would lift the overall past the potential gains nothing. Each ability takes its split share of the
 *   gain (the split decides which abilities grow) up to ABIL_MAX, the top of the display scale; the share it cannot use
 *   is lost (the fan chose the split). Nothing ever drops.
 *   Age: one season is one year (DAYS_PER_SEASON days of training), so age = age at creation + whole seasons passed. */
import { ratingsOf, BAT_WEIGHTS, PIT_WEIGHTS } from './ratings.js';

export const SPLIT_TOTAL = 100;
/* display points a 20-year-old gains per day over all his abilities, before jitter. Starting value, not tuned:
 * 0.5 a day is 90 points over a season, about 18 per batting ability, the step from a created 61 to a factory star. */
export const BASE_GAIN = 0.5;
export const JITTER = 0.5;              /* a day gives between 50 % and 150 % of the base */
export const DAILY_CAP = 1.5;           /* the most a player can gain in one day, mini-game bonus included */
export const ACTIVE_BONUS = 0.5;        /* train_sim's active fan: a full-tier mini-game (#332) every day, as a plain number */
export const DAYS_PER_SEASON = 180;     /* training days in one season (= one year of age) */
export const POT_SLOW_BAND = 5;         /* overall points below the potential where growth slows down to zero */
export const ABIL_MAX = 99;             /* an ability stops at the top of the display scale (league/ratings.js knee rounds to 99) */
/* [age, multiplier]: young players grow fastest, nobody grows from 34 */
export const AGE_CURVE = [[20, 1], [23, 1], [27, 0.6], [30, 0.3], [34, 0]];
export const KEYS = { bat: Object.keys(BAT_WEIGHTS), pit: Object.keys(PIT_WEIGHTS) };

const isWhole = x => Number.isInteger(x);
export function validateSplit(keys, split) {
  if (!split || typeof split !== 'object' || Array.isArray(split)) return ['split must be an object of percents'];
  const out = [], have = Object.keys(split);
  if (have.length !== keys.length || !keys.every(k => k in split)) return [`split must hold exactly ${keys.join(', ')}`];
  for (const k of keys) if (!isWhole(split[k]) || split[k] < 0 || split[k] > SPLIT_TOTAL) out.push(`split.${k} must be a whole number from 0 to ${SPLIT_TOTAL}`);
  const sum = keys.reduce((s, k) => s + split[k], 0);
  if (!out.length && sum !== SPLIT_TOTAL) out.push(`split adds up to ${sum}, it must be ${SPLIT_TOTAL}`);
  return out;
}
export const evenSplit = keys => Object.fromEntries(keys.map((k, i) => [k, Math.floor(SPLIT_TOTAL / keys.length) + (i < SPLIT_TOTAL % keys.length ? 1 : 0)]));

export function ageFactor(age) {
  const c = AGE_CURVE;
  if (age <= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) if (age <= c[i][0]) { const [a0, f0] = c[i - 1], [a1, f1] = c[i]; return f0 + (f1 - f0) * (age - a0) / (a1 - a0); }
  return c[c.length - 1][1];
}
export const ageOn = s => s.age0 + Math.floor(s.day / DAYS_PER_SEASON);

export const roomFactor = (ovr, pot) => Math.min(1, Math.max(0, (pot - ovr) / POT_SLOW_BAND));

export function trainDay(s, r, bonus = 0) {
  const jitter = r(), age = ageOn(s), room = roomFactor(overallOf(s), s.pot);
  s.day++;
  if (room <= 0) return 0;
  const g = Math.min(DAILY_CAP, BASE_GAIN * ageFactor(age) * (1 - JITTER + 2 * JITTER * jitter) + bonus) * room;
  const next = {};
  let used = 0;
  for (const [k, pct] of Object.entries(s.split)) {
    const v = s.abil[k], add = Math.max(0, Math.min(g * pct / SPLIT_TOTAL, ABIL_MAX - v));
    next[k] = v + add; used += add;
  }
  if (overallOf({ ...s, abil: { ...s.abil, ...next } }) > s.pot) return 0;
  Object.assign(s.abil, next);
  return used;
}

export function overallOf(s) {
  const p = s.pit ? { role: 'SP' } : {};
  for (const k of Object.keys(s.abil)) p[k] = ratingsOf.raw(s.pit, k, Math.round(s.abil[k]));
  p.pot = ratingsOf.raw(s.pit, 'pot', s.pot);
  return ratingsOf(p).ovr;
}
