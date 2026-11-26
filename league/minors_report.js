/* 二軍 daily text report (#586). Pure display model: no DOM, network, clock or Math.random, nothing in engine/ (rule 10).
 * The line is derived from a player's display abilities (the 1 to 100 scale of league/ratings.js) and a seed made of his id and the day,
 * so the same id + day gives the same line in every run (rule 11). It never changes ROSTERS, stats or a game.
 *
 *   minorsLine(id, player, day)       { id, day, kind: 'bat'|'pit', stat: {...}, text }
 *                                     batter  stat { ab, h, hr, rbi, bb, k };  pitcher stat { outs, h, er, bb, k }
 *   minorsDays(id, player, day, n)    the n lines ending at `day` (default REPORT_DAYS), newest first
 *   lineText(kind, stat)              the one-line Chinese text of a stat */
import { mulberry32 } from '../engine/rng.js';

export const REPORT_DAYS = 7;
/* batter: per at-bat chances, from the display abilities (con, pow, eye; 50 reads as the middle) */
export const AB_MIN = 3, AB_MAX = 5;
export const HIT_BASE = 0.24, HIT_SLOPE = 0.002;     /* chance of a hit per AB = HIT_BASE + HIT_SLOPE * (0.6 con + 0.2 pow + 0.2 eye - MID) */
export const HR_BASE = 0.08, HR_SLOPE = 0.003;       /* share of hits that are home runs = HR_BASE + HR_SLOPE * (pow - MID) */
export const BB_BASE = 0.09, BB_SLOPE = 0.0015;      /* walks per plate appearance, from eye */
export const K_BASE = 0.20, K_SLOPE = 0.002;         /* strikeouts per AB that is not a hit, from con (more contact, fewer K) */
export const RBI_RUNNER = 0.35;                      /* chance a non-HR hit drives a run in */
/* pitcher: outs recorded, then per-out chances */
export const MID = 50;
export const OUTS = { SP: [15, 21], default: [3, 6] };   /* [min, max] outs by role; anything not SP uses default */
export const H_BASE = 0.36, H_SLOPE = 0.003;        /* hits allowed per out, falls with stuff */
export const BB_P_BASE = 0.14, BB_P_SLOPE = 0.002;  /* walks per out, falls with ctrl */
export const K_P_BASE = 0.7, K_P_SLOPE = 0.006;     /* strikeouts per out, rises with stuff, capped at 1 */
export const ER_SHARE = 0.45;                        /* share of runners (H + BB) that score and count as earned */
const SALT = 0x9e3779b1;

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const num = (v, d = MID) => (Number.isFinite(+v) && v !== null && v !== '' ? +v : d);
const hashId = s => { let h = 0x811c9dc5; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 0x01000193); } return h >>> 0; };
const draws = (id, day) => mulberry32((hashId(id) ^ Math.imul((day | 0) + 1, SALT)) >>> 0);
const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));

function batter(r, a) {
  const hitP = clamp(HIT_BASE + HIT_SLOPE * (0.6 * num(a.con) + 0.2 * num(a.pow) + 0.2 * num(a.eye) - MID), 0.05, 0.6);
  const hrP = clamp(HR_BASE + HR_SLOPE * (num(a.pow) - MID), 0, 0.5);
  const bbP = clamp(BB_BASE + BB_SLOPE * (num(a.eye) - MID), 0.01, 0.3);
  const kP = clamp(K_BASE - K_SLOPE * (num(a.con) - MID), 0.02, 0.6);
  const pa = int(r, AB_MIN, AB_MAX);
  const s = { ab: 0, h: 0, hr: 0, rbi: 0, bb: 0, k: 0 };
  for (let i = 0; i < pa; i++) {
    if (r() < bbP) { s.bb++; continue; }
    s.ab++;
    if (r() < hitP) { s.h++; if (r() < hrP) { s.hr++; s.rbi++; } else if (r() < RBI_RUNNER) s.rbi++; }
    else if (r() < kP / (1 - hitP)) s.k++;
  }
  return s;
}
function pitcher(r, a, pos) {
  const [lo, hi] = OUTS[pos] || OUTS.default, outs = int(r, lo, hi);
  const hP = clamp(H_BASE - H_SLOPE * (num(a.stuff) - MID), 0.05, 0.9), bbP = clamp(BB_P_BASE - BB_P_SLOPE * (num(a.ctrl) - MID), 0.01, 0.6), kP = clamp(K_P_BASE + K_P_SLOPE * (num(a.stuff) - MID), 0.05, 1);
  const s = { outs, h: 0, er: 0, bb: 0, k: 0 };
  for (let i = 0; i < outs; i++) { if (r() < kP * 0.5) s.k++; if (r() < hP) s.h++; if (r() < bbP) s.bb++; }
  for (let i = 0; i < s.h + s.bb; i++) if (r() < ER_SHARE) s.er++;
  s.k = Math.min(s.k, outs);
  return s;
}

export const ipText = outs => `${Math.floor(outs / 3)}.${outs % 3}`;
export function lineText(kind, s) {
  return kind === 'pit' ? `投 ${ipText(s.outs)} 局　被安打 ${s.h}　責失 ${s.er}　四壞 ${s.bb}　三振 ${s.k}`
    : `${s.ab} 打數 ${s.h} 安打　全壘打 ${s.hr}　打點 ${s.rbi}　四壞 ${s.bb}　三振 ${s.k}`;
}
export function minorsLine(id, p, day) {
  const a = (p && p.abilities) || {}, kind = p && p.role === 'P' ? 'pit' : 'bat', r = draws(id, day);
  const stat = kind === 'pit' ? pitcher(r, a, p && p.pos) : batter(r, a);
  return { id: String(id), day: day | 0, kind, stat, text: lineText(kind, stat) };
}
export const minorsDays = (id, p, day, n = REPORT_DAYS) => Array.from({ length: n }, (_, i) => day - i).filter(d => d >= 1).map(d => minorsLine(id, p, d));
