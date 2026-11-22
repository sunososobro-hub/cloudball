/* 1 to 100 ratings for display (#169 item 8, shown by the guide page, #170). Data format: CC0.
 * Display only: the engine keeps using the raw 1.0-centred values and never imports this file (rule 10).
 *
 * ratingsOf(player) -> { ovr, con, pow, eye, spd, arm, pot } for a batter, { ovr, stuff, ctrl, arm, pot } for a pitcher,
 * whole numbers from 1 to 100. Each number is placed among the factory players of his group (batters or pitchers,
 * league/players.js), piecewise linear: the group mean reads RATING_MID, the TOP_Q quantile reads RATING_TOP, the
 * LOW_Q quantile reads RATING_LOW. So the few clearly best (the stars) read 90 or more and the obvious holes under 45.
 * The overall is the weighted mean of the standard scores plus BEST_WEIGHT times his best one (a one-skill star is
 * still a star).
 * The scale comes from the factory values only, so it stays fixed once official games change abilities (ledger). */
import { ROSTERS } from './players.js';

export const RATING_MID = 62, RATING_TOP = 90, RATING_LOW = 42, TOP_Q = 0.92, LOW_Q = 0.08, RATING_MIN = 1, RATING_MAX = 100;
export const BAT_WEIGHTS = { con: 0.3, pow: 0.3, eye: 0.15, spd: 0.15, arm: 0.1 };
export const PIT_WEIGHTS = { stuff: 0.5, ctrl: 0.4, arm: 0.1 };
export const BEST_WEIGHT = 1;

const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))) || 1; };
const quantile = (a, q) => { const s = [...a].sort((x, y) => x - y), i = q * (s.length - 1), j = Math.floor(i); return s[j] + (s[Math.min(j + 1, s.length - 1)] - s[j]) * (i - j); };
/* maps a raw value onto 1..100 by the mean and the two quantiles of the factory values */
const mapper = v => {
  const m = mean(v), hi = quantile(v, TOP_Q), lo = quantile(v, LOW_Q);
  return x => Math.max(RATING_MIN, Math.min(RATING_MAX, Math.round(x >= m ? RATING_MID + (RATING_TOP - RATING_MID) * (x - m) / ((hi - m) || 1)
    : RATING_MID - (RATING_MID - RATING_LOW) * (m - x) / ((m - lo) || 1))));
};
const scaleOf = (players, weights) => {
  const keys = [...Object.keys(weights), 'pot'], s = {}, map = {};
  for (const k of keys) { const v = players.map(p => p[k]); s[k] = { m: mean(v), sd: sd(v) }; map[k] = mapper(v); }
  const z = (p, k) => (p[k] - s[k].m) / s[k].sd;
  const sum = p => Object.entries(weights).reduce((t, [k, w]) => t + w * z(p, k), 0) + BEST_WEIGHT * Math.max(...Object.keys(weights).map(k => z(p, k)));
  return { keys, map, sum, ovr: mapper(players.map(sum)) };
};

/* ratingScale(rosters) -> ratingsOf on the scale of those rosters (used by league/tools/abilities.mjs on a draw) */
export function ratingScale(rosters) {
  const BAT = scaleOf(rosters.flatMap(t => t.bat), BAT_WEIGHTS), PIT = scaleOf(rosters.flatMap(t => t.pit), PIT_WEIGHTS);
  return p => {
    const S = p.role ? PIT : BAT, out = { ovr: S.ovr(S.sum(p)) };
    for (const k of S.keys) out[k] = S.map[k](p[k]);
    return out;
  };
}
export const ratingsOf = ratingScale(ROSTERS);
