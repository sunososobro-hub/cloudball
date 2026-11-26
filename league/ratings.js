/* 1 to 100 ratings for display (#169 item 8, shown by the guide page, #170). Data format: CC0.
 * Display only: the engine keeps using the raw 1.0-centred values and never imports this file (rule 10).
 *
 * ratingsOf(player) -> { ovr, con, pow, eye, spd, arm, pot } for a batter (plus def when he carries one), { ovr, stuff, ctrl, arm, pot } for a pitcher,
 * whole numbers from 1 to 100. Each number is placed among the factory players of his group (batters or pitchers,
 * league/players.js), piecewise linear: the group mean reads RATING_MID, the TOP_Q quantile reads RATING_TOP, the
 * LOW_Q quantile reads RATING_LOW. So the few clearly best (the stars) read 90 or more and the obvious holes under 45.
 * Above RATING_TOP and below KNEE_LOW the line bends instead of clamping (a knee): the top approaches RATING_CEIL,
 * the bottom RATING_FLOOR, so the best players still differ from each other and nobody reads 100 or 1.
 * The overall is the weighted mean of the standard scores plus BEST_WEIGHT times his best one (a one-skill star is
 * still a star).
 * The scale comes from the factory values only, so it stays fixed once official games change abilities (ledger). */
import { ROSTERS } from './players.js';
import { DEF_MIN, DEF_MAX } from '../engine/constants.js';

export const RATING_MID = 62, RATING_TOP = 90, RATING_LOW = 42, TOP_Q = 0.92, LOW_Q = 0.08, RATING_MIN = 1, RATING_MAX = 100;
/* the knees: asymptotes that round to 99 and 2; KNEE_SOFT is how slowly the top bends (larger = the stars spread
 * over more numbers below the ceiling); the bottom bends with slope 1 */
export const RATING_CEIL = 99.4, KNEE_SOFT = 25, KNEE_LOW = 20, RATING_FLOOR = 1.6;
export const BAT_WEIGHTS = { con: 0.3, pow: 0.3, eye: 0.15, spd: 0.15, arm: 0.1 };
export const PIT_WEIGHTS = { stuff: 0.5, ctrl: 0.4, arm: 0.1 };
export const BEST_WEIGHT = 1;
/* Fielder defence `def` (#378 part 6, range and glove): the factory players carry none (engine: missing = 1.0), so it
 * has no factory spread to place it among. A straight line each side instead: raw 1.0 (the factory fielder) reads
 * RATING_MID, RATING_MAX reads the engine's DEF_MAX, RATING_MIN its DEF_MIN. Not in the overall (BAT_WEIGHTS), which
 * keeps the factory scale and every factory overall unchanged. */
export const DEF_RAW_MID = 1;
export const defRaw = d => (d >= RATING_MID ? DEF_RAW_MID + (DEF_MAX - DEF_RAW_MID) * (d - RATING_MID) / (RATING_MAX - RATING_MID)
  : DEF_RAW_MID - (DEF_RAW_MID - DEF_MIN) * (RATING_MID - d) / (RATING_MID - RATING_MIN));
export const defRating = x => Math.max(RATING_MIN, Math.min(RATING_MAX, Math.round(x >= DEF_RAW_MID
  ? RATING_MID + (RATING_MAX - RATING_MID) * (x - DEF_RAW_MID) / (DEF_MAX - DEF_RAW_MID)
  : RATING_MID - (RATING_MID - RATING_MIN) * (DEF_RAW_MID - x) / (DEF_RAW_MID - DEF_MIN))));

const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))) || 1; };
const quantile = (a, q) => { const s = [...a].sort((x, y) => x - y), i = q * (s.length - 1), j = Math.floor(i); return s[j] + (s[Math.min(j + 1, s.length - 1)] - s[j]) * (i - j); };
/* maps a raw value onto 1..100 by the mean and the two quantiles of the factory values; .raw is the inverse
 * (a display number back to the raw value it reads as, so a whole number goes there and back unchanged) */
const SPAN_TOP = RATING_CEIL - RATING_TOP, SPAN_LOW = KNEE_LOW - RATING_FLOOR;
const bend = x => (x > RATING_TOP ? RATING_TOP + SPAN_TOP * (1 - Math.exp(-(x - RATING_TOP) / KNEE_SOFT))
  : x < KNEE_LOW ? KNEE_LOW - SPAN_LOW * (1 - Math.exp(-(KNEE_LOW - x) / SPAN_LOW)) : x);
const unbend = d => (d > RATING_TOP ? RATING_TOP - KNEE_SOFT * Math.log(1 - (d - RATING_TOP) / SPAN_TOP)
  : d < KNEE_LOW ? KNEE_LOW + SPAN_LOW * Math.log(1 - (KNEE_LOW - d) / SPAN_LOW) : d);
const mapper = v => {
  const m = mean(v), hi = quantile(v, TOP_Q), lo = quantile(v, LOW_Q);
  const line = x => (x >= m ? RATING_MID + (RATING_TOP - RATING_MID) * (x - m) / ((hi - m) || 1)
    : RATING_MID - (RATING_MID - RATING_LOW) * (m - x) / ((m - lo) || 1));
  const f = x => Math.max(RATING_MIN, Math.min(RATING_MAX, Math.round(bend(line(x)))));
  f.raw = d => { const l = unbend(Math.max(RATING_FLOOR + 0.1, Math.min(RATING_CEIL - 0.1, d)));
    return l >= RATING_MID ? m + (l - RATING_MID) * ((hi - m) || 1) / (RATING_TOP - RATING_MID) : m - (RATING_MID - l) * ((m - lo) || 1) / (RATING_MID - RATING_LOW); };
  return f;
};
const scaleOf = (players, weights) => {
  const keys = [...Object.keys(weights), 'pot'], s = {}, map = {};
  for (const k of keys) { const v = players.map(p => p[k]); s[k] = { m: mean(v), sd: sd(v) }; map[k] = mapper(v); }
  const z = (p, k) => (p[k] - s[k].m) / s[k].sd;
  const sum = p => Object.entries(weights).reduce((t, [k, w]) => t + w * z(p, k), 0) + BEST_WEIGHT * Math.max(...Object.keys(weights).map(k => z(p, k)));
  return { keys, map, sum, ovr: mapper(players.map(sum)) };
};

/* ratingScale(rosters) -> ratingsOf on the scale of those rosters (used by league/tools/abilities.mjs on a draw);
 * its .raw(isPitcher, key, display) gives the raw value a display number stands for (league/freeagents.js, #178) */
export function ratingScale(rosters) {
  const BAT = scaleOf(rosters.flatMap(t => t.bat), BAT_WEIGHTS), PIT = scaleOf(rosters.flatMap(t => t.pit), PIT_WEIGHTS);
  const rate = p => {
    const S = p.role ? PIT : BAT, out = { ovr: S.ovr(S.sum(p)) };
    for (const k of S.keys) out[k] = S.map[k](p[k]);
    if (!p.role && p.def !== undefined) out.def = defRating(p.def);   /* only a player who carries one (created fielders) */
    return out;
  };
  rate.raw = (isPitcher, key, d) => (!isPitcher && key === 'def' ? defRaw(d) : (isPitcher ? PIT : BAT).map[key].raw(d));
  return rate;
}
export const ratingsOf = ratingScale(ROSTERS);
