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
 *   friendlyUrl(a, version)           'play.html?x=...' (+ '&v=<engine version>' when given: the link pins the engine it was made on, #751 part 2)
 *   friendlyPin(v, engineVersion)     null when the link's pin matches (or has none), else a one-line note: same arrangement on another engine may play another game
 *   friendlyProblem(a)                named reason why an arrangement is not playable, or null
 *   friendlyOpening(s, engine)        { arrangement, opening: { seed, game, friendly: s } | null, status, reason } */
export const TEAM_COUNT = 4;
export const STARTERS = 5;
export const X_RE = /^([0-9]{1,2})-([0-9]{1,2})-([0-9]{1,2})-([0-9]{1,2})-([0-9]{1,10})$/;
export const SEED_MAX = 0xffffffff;

export function parseFriendly(s) {
  const m = typeof s === 'string' ? X_RE.exec(s) : null;
  if (!m) return null;
  const n = m.slice(1).map(Number);
  return { away: n[0], home: n[1], sp: [n[2], n[3]], seed: n[4] };
}

export const friendlyParam = a => `${a.away}-${a.home}-${a.sp[0]}-${a.sp[1]}-${a.seed}`;
export const VERSION_RE = /^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,4}$/;
export const friendlyUrl = (a, version) => `play.html?x=${friendlyParam(a)}${version && VERSION_RE.test(version) ? `&v=${version}` : ''}`;

/* Rule 11 promises the same game only on the same engine. The page has no build step and cannot load an older engine by version,
 * so a link made on another version still plays, with a note that the game may differ. */
export function friendlyPin(v, engineVersion) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string' || !VERSION_RE.test(v)) return '連結上的引擎版本看不懂，這場可能和朋友看到的不同';
  return v === engineVersion ? null : `這個連結是用引擎 ${v} 做的，現在是 ${engineVersion}，這場可能和朋友看到的不同`;
}

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
