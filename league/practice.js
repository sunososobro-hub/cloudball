/* 練習賽 (#810 part 1): a practice game is computed in the browser at $0 and never touches the server.
 * Pure: no imports of the network, no clock, no randomness, no DOM. The caller hands in the engine, a storage-like object and today's date.
 * Never official (rule 24): nothing here reads or writes the ledger, standings or any player's stats.
 *
 *   PRACTICE_PER_DAY               daily limit per browser; kept in localStorage only (the server spends nothing on a practice game)
 *   practiceLeft(store, day)       games left today; `day` is 'YYYY-MM-DD'; a missing / broken / blocked store reads as a fresh day
 *   practiceUse(store, day)        takes one game: { ok, left }; at the limit { ok: false, left: 0 } and nothing is written
 *   practiceLink(a, commit, base)  share link: everything is in the URL (arrangement + engine pin), no server row (same format as 友誼賽, league/friendly.js)
 *   practiceOpening(a, engine, store, day, rosters)  uses one game and plays it: { status, reason, left, opening } */
import { friendlyShare, friendlyProblem, friendlyParam, friendlyOpening } from './friendly.js';

export const PRACTICE_PER_DAY = 20;   // first guess: a practice game costs the server nothing, the limit only keeps the page calm
export const PRACTICE_KEY = 'cloudball.practice';
export const DAY_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

function read(store, day) {
  try {
    const v = JSON.parse(store.getItem(PRACTICE_KEY));
    if (v && v.day === day && Number.isInteger(v.n) && v.n >= 0) return v.n;
  } catch (e) { /* no store, bad JSON: a fresh day */ }
  return 0;
}

export function practiceLeft(store, day) {
  if (!DAY_RE.test(day)) throw new Error('day is not YYYY-MM-DD');
  return Math.max(0, PRACTICE_PER_DAY - read(store, day));
}

export function practiceUse(store, day) {
  const left = practiceLeft(store, day);
  if (left <= 0) return { ok: false, left: 0 };
  try { store.setItem(PRACTICE_KEY, JSON.stringify({ day, n: PRACTICE_PER_DAY - left + 1 })); } catch (e) { /* storage blocked: the game still plays */ }
  return { ok: true, left: left - 1 };
}

export const practiceLink = (a, commit, base = 'play.html') => friendlyShare(a, commit, base);

export function practiceOpening(a, engine, store, day, rosters) {
  const why = friendlyProblem(a);
  if (why) return { status: 'invalid', reason: why, left: practiceLeft(store, day), opening: null };
  const u = practiceUse(store, day);
  if (!u.ok) return { status: 'limit', reason: `practice limit ${PRACTICE_PER_DAY} per day`, left: 0, opening: null };
  const r = friendlyOpening(friendlyParam(a), engine, rosters);
  return { status: r.status, reason: r.reason, left: u.left, opening: r.opening };
}
