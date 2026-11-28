/* Daily training of created players (#369). Pure: no DOM, network, clock or unseeded randomness; the caller gives
 * every seed. Display only in this ticket: nothing here changes ROSTERS or a game (rule 10); it is the model a later
 * season-1 ticket can run server-side, and the model league/tools/train_sim.mjs measures. Data format: CC0.
 *
 *   validateSplit(keys, split)   list of plain reasons; empty = fine. A split: { <ability key>: whole percent }, sum 100.
 *   evenSplit(keys)              an even split over those keys.
 *   defaultSplit(kind, role, pitches)  the split used when a fan leaves the sliders alone: by pitcher role (ROLE_SPLIT,
 *                                #378), even for batters and for a role without an entry. With a pitch list (#378 part 2)
 *                                each pitch takes PITCH_SHARE percent and the abilities share the rest in the same ratio.
 *   trainKeys(kind, pitches)     the keys a split must hold: the abilities, plus each pitch of a pitcher's list.
 *   ageFactor(age)               growth multiplier of that age (AGE_CURVE, straight lines between its points).
 *   trainDay(state, r, bonus)    one day: state { pit, age0, day, pot, split, abil: { key: display value } } grows
 *                                in place; r is the seeded RNG; bonus is the plain number a training mini-game
 *                                gave that day (0 = hands-off). Returns the display points gained that day.
 *   roomFactor(ovr, pot)         share of the day's gain left this close to the potential (1 far away, 0 at it).
 *   overallOf(state)             the overall a state reads as (league/ratings.js, whole display numbers).
 *   learnPitch(state, name, split)  start learning a pitch he does not throw (#378 part 5): list of plain reasons, empty =
 *                                done (the pitch enters abil at 0 and the split; split left out = learnSplit).
 *   learnSplit(split, name, pct) the split after adding that pitch: pct (default LEARN_SHARE) percent on it, the rest in
 *                                the old ratio.
 *   knownPitches(state)          the pitches he throws: those at LEARN_AT or above (the caller copies them to the player).
 *   declineFactor(age)           decline multiplier of that age (DECLINE_CURVE, straight lines between its points, #433).
 *   declineDay(age, key)         display points that ability loses in one day at that age, before DECLINE_FLOOR.
 *
 * The model, in display points (the 1 to 100 scale of league/ratings.js):
 *   gain of the day = min(DAILY_CAP, BASE_GAIN * ageFactor(age) * jitter + bonus), jitter uniform in 1 +- JITTER;
 *   potential caps the OVERALL, not each ability (#374): the gain is multiplied by roomFactor, which falls in a straight
 *   line over the last POT_SLOW_BAND overall points below the potential, so growth slows near the ceiling and stops at
 *   it; a day that would lift the overall past the potential gains nothing. Each ability takes its split share of the
 *   gain (the split decides which abilities grow) up to ABIL_MAX, the top of the display scale; the share it cannot use
 *   is lost (the fan chose the split).
 *   Decline (#433): after the peak every ability loses DECLINE_PER_SEASON * declineFactor(age) * DECLINE_RATE[key] display
 *   points a season (spread evenly over the days, no jitter, no RNG draw), never below DECLINE_FLOOR; it is applied after
 *   the day's growth whatever the split or the bonus (hands-off and active lose the same), so a 0 % ability declines too.
 *   A pitch still being learned (below LEARN_AT) does not decline.
 *   Pitches (#378 part 2): a pitcher's own pitches are split keys too, each a display rating that grows like an ability
 *   but does not count in the overall (league/ratings.js knows stuff, ctrl, arm only), so every percent on a pitch is a
 *   percent the overall does not get: more pitches, slower to the 一軍 (train_sim prints it for 1, 3 and 5 pitches).
 *   Learning (#378 part 5): a new pitch starts at 0 and takes its split share LEARN_SPEED times over until it reaches
 *   LEARN_AT (the creation floor); below that he cannot throw it. Learning costs the same split percents as any pitch;
 *   it does not count in the overall, so neither roomFactor nor the potential stop slows it.
 *   Age: one season is one year (DAYS_PER_SEASON days of training), so age = age at creation + whole seasons passed. */
import { ratingsOf, BAT_WEIGHTS, PIT_WEIGHTS } from './ratings.js';
import { PITCH_TYPES } from '../engine/constants.js';

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
/* decline after the peak (#433). First guesses, not tuned: [age, multiplier of DECLINE_PER_SEASON], straight lines
 * between the points; nothing is lost up to 30, a little from 31, the full rate at 34, double at 38 and after. */
export const DECLINE_CURVE = [[30, 0], [31, 0.25], [34, 1], [38, 2]];
export const DECLINE_PER_SEASON = 3;    /* display points a season an ability with rate 1 loses at multiplier 1 */
export const DECLINE_FLOOR = 40;        /* decline never takes an ability below this (the creation floor, CREATE.floor) */
/* per-ability rate of the decline: legs, stuff and arm go first, the eye and control last; a key not listed
 * (con, pow) is 1; a pitch declines like stuff */
export const DECLINE_RATE = { spd: 1.5, stuff: 1.4, arm: 1.3, eye: 0.6, ctrl: 0.6 };
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
/* default emphasis by pitcher role (#378). First guess, not tuned: there is no stamina ability yet, so a starter
 * leans on control (fewer pitches per out, deeper starts) and short relievers on stuff; MR stays even. Each sums to
 * SPLIT_TOTAL over KEYS.pit. */
export const ROLE_SPLIT = {
  SP: { stuff: 30, ctrl: 45, arm: 25 },
  RP: { stuff: 50, ctrl: 35, arm: 15 },
  CL: { stuff: 60, ctrl: 30, arm: 10 },
};
/* default percent of the daily training on each pitch of the list (#378 part 2). First guess, not tuned: 8 keeps a
 * five-pitch pitcher at 60 % on his abilities. */
export const PITCH_SHARE = 8;
/* learning a new pitch (#378 part 5). First guesses, not tuned: LEARN_AT is the creation floor (league/freeagents.js
 * CREATE.floor), the weakest pitch a created pitcher can throw; LEARN_SPEED 4 at LEARN_SHARE 15 % is about 135 days
 * (most of a season) for a 20-year-old hands-off, a fan who puts more on it learns sooner (train_sim prints both). */
export const PITCH_NAMES = PITCH_TYPES.map(t => t[0]);
export const LEARN_AT = 40;
export const LEARN_SPEED = 4;
export const LEARN_SHARE = 15;
const isPitch = k => PITCH_NAMES.includes(k);
export const knownPitches = s => PITCH_NAMES.filter(n => n in s.abil && s.abil[n] >= LEARN_AT);
export const trainKeys = (kind, pitches) => [...KEYS[kind], ...(kind === 'pit' && pitches ? pitches : [])];
/* whole percents in the ratio of w summing to total, largest remainder (ties: key order) */
function scaleTo(w, total) {
  const keys = Object.keys(w), sum = keys.reduce((t, k) => t + w[k], 0) || 1, out = {};
  const exact = keys.map(k => w[k] * total / sum);
  keys.forEach((k, i) => { out[k] = Math.floor(exact[i]); });
  let left = total - keys.reduce((t, k) => t + out[k], 0);
  for (const i of keys.map((k, i) => i).sort((a, b) => (exact[b] - Math.floor(exact[b])) - (exact[a] - Math.floor(exact[a])) || a - b)) { if (left <= 0) break; out[keys[i]]++; left--; }
  return out;
}
export const evenSplit = keys => Object.fromEntries(keys.map((k, i) => [k, Math.floor(SPLIT_TOTAL / keys.length) + (i < SPLIT_TOTAL % keys.length ? 1 : 0)]));

export function defaultSplit(kind, role, pitches) {
  const base = kind === 'pit' && ROLE_SPLIT[role] ? { ...ROLE_SPLIT[role] } : evenSplit(KEYS[kind]);
  if (kind !== 'pit' || !pitches || !pitches.length) return base;
  return { ...scaleTo(base, SPLIT_TOTAL - PITCH_SHARE * pitches.length), ...Object.fromEntries(pitches.map(n => [n, PITCH_SHARE])) };
}

export function learnSplit(split, name, pct = LEARN_SHARE) {
  return { ...scaleTo(split, SPLIT_TOTAL - pct), [name]: pct };
}
export function learnPitch(s, name, split) {
  if (!s.pit) return ['only a pitcher learns pitches'];
  if (!isPitch(name)) return [`pitch ${name} must be one of ${PITCH_NAMES.join(', ')}`];
  if (name in s.abil) return [`he already has ${name}`];
  const next = split || learnSplit(s.split, name), why = validateSplit([...Object.keys(s.split), name], next);
  if (why.length) return why;
  s.abil[name] = 0; s.split = { ...next };
  return [];
}

export function ageFactor(age) {
  const c = AGE_CURVE;
  if (age <= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) if (age <= c[i][0]) { const [a0, f0] = c[i - 1], [a1, f1] = c[i]; return f0 + (f1 - f0) * (age - a0) / (a1 - a0); }
  return c[c.length - 1][1];
}
export function declineFactor(age) {
  const c = DECLINE_CURVE;
  if (age <= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) if (age <= c[i][0]) { const [a0, f0] = c[i - 1], [a1, f1] = c[i]; return f0 + (f1 - f0) * (age - a0) / (a1 - a0); }
  return c[c.length - 1][1];
}
export const declineRate = k => (isPitch(k) ? DECLINE_RATE.stuff : DECLINE_RATE[k] ?? 1);
/* display points ability k loses in one day at that age (before the floor) */
export const declineDay = (age, k) => DECLINE_PER_SEASON * declineFactor(age) * declineRate(k) / DAYS_PER_SEASON;
export const ageOn = s => s.age0 + Math.floor(s.day / DAYS_PER_SEASON);

export const roomFactor = (ovr, pot) => Math.min(1, Math.max(0, (pot - ovr) / POT_SLOW_BAND));

export function trainDay(s, r, bonus = 0) {
  const jitter = r(), age = ageOn(s), room = roomFactor(overallOf(s), s.pot);
  s.day++;
  const g = Math.min(DAILY_CAP, BASE_GAIN * ageFactor(age) * (1 - JITTER + 2 * JITTER * jitter) + bonus);
  /* a pitch still being learned does not count in the overall, so the potential never holds it back */
  const grow = keep => {
    const next = {};
    let used = 0;
    for (const [k, pct] of Object.entries(s.split)) {
      const v = s.abil[k], learning = isPitch(k) && v < LEARN_AT;
      if (!keep(learning)) continue;
      const add = Math.max(0, Math.min(g * (learning ? LEARN_SPEED : room) * pct / SPLIT_TOTAL, ABIL_MAX - v));
      next[k] = v + add; used += add;
    }
    return { next, used };
  };
  let day = grow(() => true);
  if (overallOf({ ...s, abil: { ...s.abil, ...day.next } }) > s.pot) day = grow(learning => learning);
  Object.assign(s.abil, day.next);
  const f = declineFactor(age);
  if (f > 0) for (const k of Object.keys(s.abil)) {
    const v = s.abil[k];
    if ((isPitch(k) && v < LEARN_AT) || v <= DECLINE_FLOOR) continue;
    s.abil[k] = Math.max(DECLINE_FLOOR, v - declineDay(age, k));
  }
  return day.used;
}

export function overallOf(s) {
  const p = s.pit ? { role: 'SP' } : {};
  for (const k of KEYS[s.pit ? 'pit' : 'bat']) p[k] = ratingsOf.raw(s.pit, k, Math.round(s.abil[k]));
  p.pot = ratingsOf.raw(s.pit, 'pot', s.pot);
  return ratingsOf(p).ovr;
}
