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
 *   friendlyOpening(s, engine)        { arrangement, opening: { seed, game, friendly: s } | null, status, reason }
 *
 * Share link (#751 part 2): `play.html?x=<arrangement>&e=<engine commit>`. `e` (7..40 hex) pins the engine commit the game is computed
 * with, so a friend gets the same game byte for byte after the engine moves on (rule 11 only promises that for one commit; same pin as
 * the farm records, league/replay.js). No `e` = the page's own engine (part 1 links keep working).
 *   friendlyPin(e)                    { ok: true, commit: sha | null } or { ok: false, reason } (bad `e` is never ignored)
 *   friendlyShare(a, commit, base)    absolute or relative link carrying the arrangement and the pin
 *   friendlyOpeningAt(s, e, load)     async friendlyOpening with the engine `load(commit)` returns; load is asked only when `e` is given
 *
 * Own player (#751 part 3): `a.own` (optional) puts the visitor's batter into one lineup slot of one side. The link carries a frozen copy of him,
 * so a friend needs no account and the game stays the same whatever he becomes later (same link = same game):
 *   o=<side>.<slot>.<con>.<pow>.<eye>.<spd>.<arm>.<hand>.<age>.<num>.<name>   side 0 away / 1 home, slot 0..8, ratings = the 1..100 display numbers
 *   Pitcher (#751 part 4, role 'P'): o=<side>.<starter>.<stuff>.<ctrl>.<arm>.<hand>.<age>.<num>.<name> (9 fields); he takes the SP place `starter`
 *   (0..4) and must be that side's starting pitcher (sp[side] = starter), so the link says who starts.
 *   ownParam(o) / parseOwn(s)         text <-> { side, slot, con, pow, eye, spd, arm, hand, age, num, name } (parse gives null when it does not fit)
 *   ownProblem(o)                     named reason why an own player is not playable, or null
 * Look (#751 part 6, optional, appearance only: the engine never reads it, so the game is the same with or without it): four more fields
 *   .<slim>.<power>.<heavy>.<ht> after the name (batter 15 fields, pitcher 13): build blend weights 0..100 (league/players.js body x 100) and
 *   height in cm (LOOK_HT_MIN..LOOK_HT_MAX); `o.body = { slim, power, heavy }`, `o.ht`. Links without them draw him with the normal build.
 * He takes the slot's defensive position; his raw ratings come from league/friendly_own.js (ownRosters), which builds the `rosters` argument of
 * friendlyOpening / friendlyOpeningAt. Practice and friendly games never count for anyone's stats (rule 24). */
export const TEAM_COUNT = 4;
export const STARTERS = 5;
export const X_RE = /^([0-9]{1,2})-([0-9]{1,2})-([0-9]{1,2})-([0-9]{1,2})-([0-9]{1,10})$/;
export const SEED_MAX = 0xffffffff;
export const COMMIT_RE = /^[0-9a-f]{7,40}$/;
export const LINEUP_SLOTS = 9;
export const OWN_RATINGS = ['con', 'pow', 'eye', 'spd', 'arm'];
export const OWN_PITCH_RATINGS = ['stuff', 'ctrl', 'arm'];
export const LOOK_KEYS = ['slim', 'power', 'heavy'];
export const LOOK_HT_MIN = 150, LOOK_HT_MAX = 220;   /* cm; the league's players are 1.72..1.92 m (league/freeagents.js CREATE builds) */
const lookParam = o => (o.body ? `.${LOOK_KEYS.map(k => o.body[k]).join('.')}.${o.ht}` : '');
const NAME_RE = /^[^.\u0000-\u001f<>&"'\\]{1,12}$/u;

export const ownParam = o => (o.role === 'P'
  ? `${o.side}.${o.slot}.${OWN_PITCH_RATINGS.map(k => o[k]).join('.')}.${o.hand}.${o.age}.${o.num}.${o.name}${lookParam(o)}`
  : `${o.side}.${o.slot}.${OWN_RATINGS.map(k => o[k]).join('.')}.${o.hand}.${o.age}.${o.num}.${o.name}${lookParam(o)}`);

export function ownProblem(o) {
  if (!o || typeof o !== 'object') return 'no own player';
  if (o.side !== 0 && o.side !== 1) return 'own side is not 0 or 1';
  const pit = o.role === 'P';
  if (o.role !== undefined && !pit) return 'own role is not P';
  if (!Number.isInteger(o.slot) || o.slot < 0 || o.slot >= (pit ? STARTERS : LINEUP_SLOTS)) return pit ? 'own starter slot is not 0..4' : 'own slot is not 0..8';
  for (const k of pit ? OWN_PITCH_RATINGS : OWN_RATINGS) if (!Number.isInteger(o[k]) || o[k] < 1 || o[k] > 100) return `own ${k} is not 1..100`;
  if (o.hand !== 'L' && o.hand !== 'R') return 'own hand is not L or R';
  if (!Number.isInteger(o.age) || o.age < 15 || o.age > 60) return 'own age is not 15..60';
  if (!Number.isInteger(o.num) || o.num < 0 || o.num > 99) return 'own number is not 0..99';
  if (typeof o.name !== 'string' || !NAME_RE.test(o.name)) return 'own name is not 1..12 plain characters';
  if (o.body !== undefined || o.ht !== undefined) {
    if (!o.body || typeof o.body !== 'object' || !LOOK_KEYS.every(k => Number.isInteger(o.body[k]) && o.body[k] >= 0 && o.body[k] <= 100)) return 'own body is not three 0..100 weights';
    if (!Number.isInteger(o.ht) || o.ht < LOOK_HT_MIN || o.ht > LOOK_HT_MAX) return `own height is not ${LOOK_HT_MIN}..${LOOK_HT_MAX} cm`;
  }
  return null;
}

export function parseOwn(s) {
  if (typeof s !== 'string') return null;
  const f = s.split('.');
  if (![9, 11, 13, 15].includes(f.length)) return null;
  const n = i => (/^[0-9]{1,3}$/.test(f[i]) ? Number(f[i]) : NaN);
  const look = (q, i) => (f.length > i ? Object.assign(q, { body: { slim: n(i), power: n(i + 1), heavy: n(i + 2) }, ht: n(i + 3) }) : q);
  if (f.length === 9 || f.length === 13) {
    const q = look({ role: 'P', side: n(0), slot: n(1), stuff: n(2), ctrl: n(3), arm: n(4), hand: f[5], age: n(6), num: n(7), name: f[8] }, 9);
    return ownProblem(q) ? null : q;
  }
  const o = look({ side: n(0), slot: n(1), con: n(2), pow: n(3), eye: n(4), spd: n(5), arm: n(6), hand: f[7], age: n(8), num: n(9), name: f[10] }, 11);
  return ownProblem(o) ? null : o;
}

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
  if (a.own !== undefined && a.own !== null) {
    const why = ownProblem(a.own);
    if (why) return why;
    if (a.own.role === 'P' && a.own.slot !== a.sp[a.own.side]) return 'own starter is not the side\'s starting pitcher';
  }
  return null;
}

export function friendlyOpening(s, engine, rosters) {
  const a = parseFriendly(s);
  if (!a) return { arrangement: null, opening: null, status: 'invalid', reason: 'x is not <away>-<home>-<awaySP>-<homeSP>-<seed>' };
  const why = friendlyProblem(a);
  if (why) return { arrangement: a, opening: null, status: 'invalid', reason: why };
  try {
    const game = engine.simGame(a.seed, {}, rosters ? { teams: [a.away, a.home], starters: a.sp, rosters } : { teams: [a.away, a.home], starters: a.sp });
    return { arrangement: a, opening: { seed: a.seed, game, friendly: s }, status: 'ok', reason: '' };
  } catch (e) {
    return { arrangement: a, opening: null, status: 'unavailable', reason: (e && e.message) || String(e) };
  }
}

export function friendlyCommitPin(e) {
  if (e === null || e === undefined || e === '') return { ok: true, commit: null };
  if (typeof e !== 'string' || !COMMIT_RE.test(e)) return { ok: false, reason: 'e is not a 7..40 hex engine commit' };
  return { ok: true, commit: e };
}

export function friendlyShare(a, commit, base = 'play.html') {
  const pin = friendlyCommitPin(commit || null);
  if (!pin.ok) throw new Error(pin.reason);
  const why = friendlyProblem(a);
  if (why) throw new Error(why);
  return `${base}?x=${friendlyParam(a)}${pin.commit ? `&e=${pin.commit}` : ''}${a.own ? `&o=${encodeURIComponent(ownParam(a.own))}` : ''}`;
}

export async function friendlyOpeningAt(s, e, load, rosters) {
  const pin = friendlyCommitPin(e);
  if (!pin.ok) return { arrangement: parseFriendly(s), opening: null, status: 'invalid', reason: pin.reason };
  if (!pin.commit) return friendlyOpening(s, await load(null), rosters);
  const a = parseFriendly(s), why = a ? friendlyProblem(a) : 'x is not <away>-<home>-<awaySP>-<homeSP>-<seed>';
  if (why) return { arrangement: a, opening: null, status: 'invalid', reason: why };
  let engine;
  try { engine = await load(pin.commit); } catch (err) { return { arrangement: a, opening: null, status: 'unavailable', reason: `engine ${pin.commit}: ${(err && err.message) || err}` }; }
  const r = friendlyOpening(s, engine, rosters);
  if (r.opening) r.opening.engine = pin.commit;
  return r;
}
