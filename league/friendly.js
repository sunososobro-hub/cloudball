/* 友誼賽 (#751 part 1): a game a visitor arranges in the browser. Pure: no imports, no clock, no randomness, no DOM, no network.
 * Never official (rule 24): nothing here reads or writes the ledger, standings, farm records or any player's stats or growth.
 * The game is computed by the engine the page already loaded (window.ENGINE) from the arrangement alone: same link = same game.
 *
 * Arrangement `x` (one URL parameter, play.html?x=<away>-<home>-<awaySP>-<homeSP>-<seed>), all unsigned integers:
 *   away, home      team index (0..TEAM_COUNT-1), different
 *   awaySP, homeSP  starting pitcher: index into that team's `pit` list, one of the first STARTERS (the five SP)
 *   seed            uint32
 *
 *   parseFriendly(s)                  { away, home, sp: [awaySP, homeSP], seed } or null
 *   friendlyParam(a)                  the `x` value of an arrangement
 *   friendlyUrl(a)                    'play.html?x=...'
 *   friendlyProblem(a)                named reason why an arrangement is not playable, or null
 *   friendlyOpening(s, engine)        { arrangement, opening: { seed, game, friendly: s } | null, status, reason }
 *
 * Share link (#751 part 2): `play.html?x=<arrangement>&e=<engine commit>`. `e` (7..40 hex) pins the engine commit the game is computed
 * with, so a friend gets the same game byte for byte after the engine moves on (rule 11 only promises that for one commit; same pin as
 * the farm records, league/replay.js). No `e` = the page's own engine (part 1 links keep working).
 *   friendlyPin(e)                    { ok: true, commit: sha | null } or { ok: false, reason } (bad `e` is never ignored)
 *   friendlyShare(a, commit, base)    absolute or relative link carrying the arrangement and the pin
 *   friendlyOpeningAt(s, e, load)     async friendlyOpening with the engine `load(commit)` returns; load is asked only when `e` is given */
export const TEAM_COUNT = 4;
export const STARTERS = 5;
export const X_RE = /^([0-9]{1,2})-([0-9]{1,2})-([0-9]{1,2})-([0-9]{1,2})-([0-9]{1,10})$/;
export const SEED_MAX = 0xffffffff;
export const COMMIT_RE = /^[0-9a-f]{7,40}$/;

export function parseFriendly(s) {
  const m = typeof s === 'string' ? X_RE.exec(s) : null;
  if (!m) return null;
  const n = m.slice(1).map(Number);
  return { away: n[0], home: n[1], sp: [n[2], n[3]], seed: n[4] };
}

export const friendlyParam = a => `${a.away}-${a.home}-${a.sp[0]}-${a.sp[1]}-${a.seed}`;
export const friendlyUrl = a => `play.html?x=${friendlyParam(a)}`;

export function friendlyProblem(a) {
  if (!a || typeof a !== 'object') return 'no arrangement';
  const team = t => Number.isInteger(t) && t >= 0 && t < TEAM_COUNT;
  if (!team(a.away) || !team(a.home)) return 'team is not 0..3';
  if (a.away === a.home) return 'a team cannot play itself';
  if (!Array.isArray(a.sp) || a.sp.length !== 2 || !a.sp.every(i => Number.isInteger(i) && i >= 0 && i < STARTERS)) return 'starter is not one of the five SP';
  if (!Number.isInteger(a.seed) || a.seed < 0 || a.seed > SEED_MAX) return 'seed is not a uint32';
  return null;
}

export function friendlyOpening(s, engine) {
  const a = parseFriendly(s);
  if (!a) return { arrangement: null, opening: null, status: 'invalid', reason: 'x is not <away>-<home>-<awaySP>-<homeSP>-<seed>' };
  const why = friendlyProblem(a);
  if (why) return { arrangement: a, opening: null, status: 'invalid', reason: why };
  try {
    const game = engine.simGame(a.seed, {}, { teams: [a.away, a.home], starters: a.sp });
    return { arrangement: a, opening: { seed: a.seed, game, friendly: s }, status: 'ok', reason: '' };
  } catch (e) {
    return { arrangement: a, opening: null, status: 'unavailable', reason: (e && e.message) || String(e) };
  }
}

export function friendlyPin(e) {
  if (e === null || e === undefined || e === '') return { ok: true, commit: null };
  if (typeof e !== 'string' || !COMMIT_RE.test(e)) return { ok: false, reason: 'e is not a 7..40 hex engine commit' };
  return { ok: true, commit: e };
}

export function friendlyShare(a, commit, base = 'play.html') {
  const pin = friendlyPin(commit || null);
  if (!pin.ok) throw new Error(pin.reason);
  const why = friendlyProblem(a);
  if (why) throw new Error(why);
  return `${base}?x=${friendlyParam(a)}${pin.commit ? `&e=${pin.commit}` : ''}`;
}

export async function friendlyOpeningAt(s, e, load) {
  const pin = friendlyPin(e);
  if (!pin.ok) return { arrangement: parseFriendly(s), opening: null, status: 'invalid', reason: pin.reason };
  if (!pin.commit) return friendlyOpening(s, await load(null));
  const a = parseFriendly(s), why = a ? friendlyProblem(a) : 'x is not <away>-<home>-<awaySP>-<homeSP>-<seed>';
  if (why) return { arrangement: a, opening: null, status: 'invalid', reason: why };
  let engine;
  try { engine = await load(pin.commit); } catch (err) { return { arrangement: a, opening: null, status: 'unavailable', reason: `engine ${pin.commit}: ${(err && err.message) || err}` }; }
  const r = friendlyOpening(s, engine);
  if (r.opening) r.opening.engine = pin.commit;
  return r;
}
