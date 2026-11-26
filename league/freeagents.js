/* Created free agents, first version of #167 (slice 1, #178). Pure: no DOM, network, clock or unseeded
 * randomness; the caller gives every seed. Data format: CC0.
 *
 *   drawName(seed, n)        the n-th name drawn for that seed (n = 0 first, 1 after one redraw, ...). No free text (#167 X3).
 *   CREATE                   what a fan chooses, and the one fixed point budget on the 1 to 100 display scale.
 *   validateCreate(choice)   list of plain reasons; empty = fine.
 *   makePlayer(seed, choice) { player, ratings }: the player in the roster format of league/players.js, and
 *                            ratingsOf(player) on the factory scale (league/ratings.js).
 *
 * A choice: { kind: 'bat', pos, bats, build | (body, ht), look, points: {con, pow, eye, spd, arm}, nameDraw, train }
 *        or { kind: 'pit', role, throws, build, look, points: {stuff, ctrl, arm}, nameDraw, train, pitches }.
 * pitches (#378 part 2, optional): the pitcher's starter list, names from CREATE.pitches (the engine's PITCH_TYPES),
 * 1 to CREATE.starterPitches of them, no repeats, always with the fastball CREATE.pitches[0]. Each starts at his stuff
 * points and is stored on the player as `pitches: { name: display rating }`; the training split then holds each pitch
 * too (league/training.js). The engine throws only the listed pitches, at their factory shares (engine/sim/game.js mixOf);
 * the pitch is a look there (name, km/h), never an outcome.
 * points.def (#378 part 6, batters, optional): fielder defence (range and glove), FLOOR to CAP like the rest; with it the
 * budget is CREATE.budget.bat + CREATE.defBudget over all six, so defence trades against the bat. Stored as the
 * engine's raw `def` (league/ratings.js defRaw; the engine's fielding code reads it through the roster), shown 1 to
 * 100, not in the overall. Left out (choices made before it) = the factory fielder, def 1.0. positionFit(pos, ratings)
 * is the plain text of how his def and arm suit the position he picked.
 * role (#378): SP 先發, MR 中繼, RP 後援, CL 終結. The engine starts an SP and puts every other role in the bullpen.
 * train (#369, optional): the daily training split, whole percents over the same ability keys, sum 100
 * (league/training.js); left out = defaultSplit (by pitcher role, even for batters). It is stored on the player as `train`.
 * body + ht (#442, instead of build): the body mix as whole percents { slim, power, heavy } (each 0 to 100, sum at most
 * 100, so the mix stays the one MakeHuman blends) and the height in whole centimetres, as metres, inside CREATE.htRange.
 * Stored on the player as weights (percent / 100) and ht. Exactly one of `build` (a preset, drawn height) or `body` + `ht`.
 * Nothing here reads the body: display points and games do not depend on it (rule 10).
 * The points are spent in full (sum = the budget of the kind), each between FLOOR and CAP. Potential, age, height
 * and shirt number are not chosen: they are drawn from the seed (potential is the luck people talk about).
 * Nothing here touches ROSTERS: a created player reaches a game only through a roster given to the engine (rule 10). */
import { ROSTERS } from './players.js';
import { STAFF, UMPIRES } from './staff.js';
import { SURNAMES, GIVEN } from './namepool.js';
import { ratingsOf, BAT_WEIGHTS, PIT_WEIGHTS, RATING_MID } from './ratings.js';
import { validateSplit, defaultSplit, trainKeys } from './training.js';
import { PITCH_TYPES } from '../engine/constants.js';

/* Free agents are young: given names of the youngest pool. */
export const NAME_DECADE = 1990;
/* Full names of that pool that are real athletes (league/tools/blocklist.txt); tests/freeagents.check.mjs keeps this
 * list equal to the pool crossed with the blocklist, so it cannot fall behind. */
export const BLOCKED = ['陳柏豪', '陳冠穎', '陳子豪', '陳冠勳', '陳冠傑', '陳柏均', '陳冠宇', '陳俊傑', '林書豪', '林子豪', '林家瑋', '林威廷',
  '林彥廷', '黃柏豪', '黃俊傑', '張建勳', '張家豪', '李建勳', '王宇翔', '吳承翰', '劉家豪', '蔡家宏', '曾冠傑', '蘇立偉', '施冠宇'];
const NAME_TRIES = 1000;
const NAME_SALT = 0x9e3779b1;

export const CREATE = {
  kinds: ['bat', 'pit'],
  positions: ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'],
  roles: ['SP', 'MR', 'RP', 'CL'],
  /* the engine's pitches; the first (直球) is in every list. starterPitches: the most a created pitcher starts with */
  pitches: PITCH_TYPES.map(t => t[0]),
  starterPitches: 3,
  hands: ['L', 'R'],
  /* build -> body blend weights (render) and height range in metres */
  builds: {
    normal: { body: { slim: 0, power: 0, heavy: 0 }, ht: [1.74, 1.86] },
    slim: { body: { slim: 0.6, power: 0, heavy: 0 }, ht: [1.72, 1.84] },
    power: { body: { slim: 0, power: 0.7, heavy: 0 }, ht: [1.78, 1.90] },
    heavy: { body: { slim: 0, power: 0.5, heavy: 0.7 }, ht: [1.78, 1.92] },
  },
  /* #442 body sliders: the height range of the builds above (min to max), the most a body mix may add up to */
  htRange: [1.72, 1.92],
  bodyKeys: ['slim', 'power', 'heavy'],
  bodyMax: 100,
  /* look: whole numbers, checked by range only; the render window decides what each number draws */
  look: { head: [0, 7], skin: [0, 5], hair: [0, 9] },
  keys: { bat: Object.keys(BAT_WEIGHTS), pit: Object.keys(PIT_WEIGHTS) },
  /* the one fixed budget per kind, and the floor and cap of each ability (display points, 1 to 100) */
  budget: { bat: 305, pit: 183 },
  /* the optional fielder defence point (#378 part 6) and what it adds to the batter budget: one average ability,
   * so 366 over six keys stays divisible (the UI splits it evenly) */
  defKey: 'def',
  defBudget: 61,
  floor: 40,
  cap: { bat: 70, pit: 66 },
  maxNameDraw: 999,
};
/* the point keys of a choice: a batter who sets points.def spends it from the same pool */
export const pointKeys = c => [...CREATE.keys[c.kind], ...(c.kind === 'bat' && c.points && CREATE.defKey in c.points ? [CREATE.defKey] : [])];
export const budgetOf = c => CREATE.budget[c.kind] + (pointKeys(c).includes(CREATE.defKey) ? CREATE.defBudget : 0);

/* How a position asks for glove and arm (#378 part 6), display only (rule 10: the engine never reads it). need = the
 * 1-100 mix of def and arm the position wants, by the usual defensive spectrum (C, SS, CF, 2B, 3B, RF, LF, 1B);
 * first guesses, not tuned: an even created batter (61 everywhere) reads 適任 at C and SS, a 70/70 one 拿手 there. FIT_BAND: within this many points of the need reads 適任, above it 拿手, below it 吃力. */
export const POS_NEED = {
  C: { def: 0.5, arm: 0.5, need: 64 }, SS: { def: 0.65, arm: 0.35, need: 64 }, CF: { def: 0.7, arm: 0.3, need: 62 },
  '2B': { def: 0.8, arm: 0.2, need: 60 }, '3B': { def: 0.5, arm: 0.5, need: 58 }, RF: { def: 0.4, arm: 0.6, need: 56 },
  LF: { def: 0.7, arm: 0.3, need: 52 }, '1B': { def: 1, arm: 0, need: 46 },
};
export const FIT_BAND = 4;
export const FIT_TEXT = { good: '拿手', ok: '適任', poor: '吃力', none: '不守備' };
export function positionFit(pos, r) {
  const n = POS_NEED[pos];
  if (!n) return FIT_TEXT.none;
  const v = n.def * (r.def ?? RATING_MID) + n.arm * r.arm;
  return v >= n.need + FIT_BAND ? FIT_TEXT.good : v >= n.need - FIT_BAND ? FIT_TEXT.ok : FIT_TEXT.poor;
}

/* drawn, not chosen */
export const AGE = [20, 24];
export const NUM = [1, 99];
/* Potential (#374): a target for the OVERALL on the display scale (league/training.js), drawn once at creation, locked
 * and hidden from fans (owner 2026-11-25). Two parts: with chance POT_GOD_SHARE a "god roll" drawn evenly from POT_GOD,
 * else the body POT_BODY[0] + span * u^POT_SKEW (more draws low, a tail toward the top of the body). potDraw() gives the
 * value, potShareAtLeast() its exact share, so tests/training.check.mjs checks the shape against the 一軍 of
 * league/site/players.json (median >= the 一軍 median, about a fifth above the 一軍 p75, a rare tail of stars). */
export const POT_BODY = [52, 89];
export const POT_SKEW = 1.75;
export const POT_GOD = [90, 99];
export const POT_GOD_SHARE = 0.03;
export const potDraw = (u, v) => Math.round(v < POT_GOD_SHARE ? POT_GOD[0] - 0.5 + (POT_GOD[1] - POT_GOD[0] + 1) * u
  : POT_BODY[0] + (POT_BODY[1] - POT_BODY[0]) * u ** POT_SKEW);
/* exact share of draws with potential >= t (whole display number) */
export function potShareAtLeast(t) {
  const [g0, g1] = POT_GOD, [b0, b1] = POT_BODY;
  const god = Math.min(1, Math.max(0, (g1 + 0.5 - Math.max(t - 0.5, g0 - 0.5)) / (g1 - g0 + 1)));
  const x = Math.min(1, Math.max(0, (t - 0.5 - b0) / (b1 - b0)));
  return POT_GOD_SHARE * god + (1 - POT_GOD_SHARE) * (1 - x ** (1 / POT_SKEW));
}
const HT_STEP = 100;                  /* heights in whole centimetres */

/* mulberry32, the same small seeded PRNG as league/tools/names.mjs */
const rng = seed => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (r, items) => { const total = items.reduce((s, [, w]) => s + w, 0); let x = r() * total; for (const [v, w] of items) if ((x -= w) < 0) return v; return items[items.length - 1][0]; };
const between = (r, [a, b]) => a + Math.floor(r() * (b - a + 1));
const POOL = Object.entries(GIVEN[NAME_DECADE]).flatMap(([w, s]) => s.split(' ').map(g => [g, Number(w)]));
/* names already in league data: factory players, coaches, umpires */
const TAKEN = new Set([...ROSTERS.flatMap(t => [...t.bat, ...t.pit]), ...STAFF, ...UMPIRES].map(p => p.name));
const NOT_FREE = new Set([...BLOCKED, ...TAKEN]);

export function drawName(seed, n) {
  const r = rng(((seed >>> 0) ^ Math.imul((n >>> 0) + 1, NAME_SALT)) >>> 0);
  for (let i = 0; i < NAME_TRIES; i++) { const name = pick(r, SURNAMES) + pick(r, POOL); if (!NOT_FREE.has(name)) return name; }
  throw new Error(`no free name for seed ${seed}, draw ${n}`);
}

/* a preset build as slider percents (a mix over bodyMax is scaled down to it): what the sliders show for that preset */
export function presetBody(build) {
  const B = CREATE.builds[build] || CREATE.builds.normal, raw = Object.fromEntries(CREATE.bodyKeys.map(k => [k, Math.round((B.body[k] || 0) * 100)]));
  const sum = CREATE.bodyKeys.reduce((t, k) => t + raw[k], 0), f = sum > CREATE.bodyMax ? CREATE.bodyMax / sum : 1;
  return Object.fromEntries(CREATE.bodyKeys.map(k => [k, Math.floor(raw[k] * f)]));
}
export const presetHt = build => { const [a, b] = (CREATE.builds[build] || CREATE.builds.normal).ht; return Math.round((a + b) / 2 * 100) / 100; };

const isWhole = x => Number.isInteger(x);
const inRange = (x, [a, b]) => isWhole(x) && x >= a && x <= b;
const sameKeys = (o, keys) => o && typeof o === 'object' && Object.keys(o).length === keys.length && keys.every(k => k in o);

export function validateCreate(c) {
  const out = [], C = CREATE;
  if (!c || typeof c !== 'object') return ['no choice given'];
  if (!C.kinds.includes(c.kind)) return [`kind must be one of ${C.kinds.join(', ')}`];
  const bat = c.kind === 'bat', allowed = ['kind', bat ? 'pos' : 'role', bat ? 'bats' : 'throws', 'build', 'body', 'ht', 'look', 'points', 'nameDraw', 'train', ...(bat ? [] : ['pitches'])];
  for (const k of Object.keys(c)) if (!allowed.includes(k)) out.push(`unknown field ${k}`);
  if (bat && !C.positions.includes(c.pos)) out.push(`position must be one of ${C.positions.join(', ')}`);
  if (!bat && !C.roles.includes(c.role)) out.push(`role must be one of ${C.roles.join(', ')}`);
  if (!C.hands.includes(bat ? c.bats : c.throws)) out.push(`${bat ? 'bats' : 'throws'} must be L or R`);
  const custom = c.body !== undefined || c.ht !== undefined;
  if (custom) {
    if (c.build !== undefined) out.push('give a build or a body with a height, not both');
    const bk = C.bodyKeys, bodyOk = sameKeys(c.body, bk) && bk.every(k => inRange(c.body[k], [0, C.bodyMax]));
    if (!bodyOk) out.push(`body must hold exactly ${bk.join(', ')}, each a whole percent from 0 to ${C.bodyMax}`);
    else if (bk.reduce((t, k) => t + c.body[k], 0) > C.bodyMax) out.push(`body adds up to more than ${C.bodyMax} percent`);
    const cm = [C.htRange[0] * HT_STEP, C.htRange[1] * HT_STEP].map(Math.round);
    if (!(typeof c.ht === 'number' && isWhole(Math.round(c.ht * HT_STEP)) && Math.abs(c.ht * HT_STEP - Math.round(c.ht * HT_STEP)) < 1e-6 && Math.round(c.ht * HT_STEP) >= cm[0] && Math.round(c.ht * HT_STEP) <= cm[1])) out.push(`ht must be whole centimetres from ${C.htRange[0]} to ${C.htRange[1]} m`);
  } else if (!(c.build in C.builds)) out.push(`build must be one of ${Object.keys(C.builds).join(', ')}`);
  const lk = Object.keys(C.look);
  if (!sameKeys(c.look, lk)) out.push(`look must hold exactly ${lk.join(', ')}`);
  else for (const k of lk) if (!inRange(c.look[k], C.look[k])) out.push(`look.${k} must be a whole number from ${C.look[k][0]} to ${C.look[k][1]}`);
  if (c.nameDraw !== undefined && !inRange(c.nameDraw, [0, C.maxNameDraw])) out.push(`nameDraw must be a whole number from 0 to ${C.maxNameDraw}`);
  if (!bat && c.pitches !== undefined) {
    const ok = Array.isArray(c.pitches) && c.pitches.length >= 1 && c.pitches.length <= C.starterPitches;
    if (!ok) out.push(`pitches must be a list of 1 to ${C.starterPitches} pitches`);
    else {
      for (const n of c.pitches) if (!C.pitches.includes(n)) out.push(`pitch ${n} must be one of ${C.pitches.join(', ')}`);
      if (new Set(c.pitches).size !== c.pitches.length) out.push('pitches must not repeat');
      if (!c.pitches.includes(C.pitches[0])) out.push(`pitches must include ${C.pitches[0]}`);
    }
  }
  if (c.train !== undefined) out.push(...validateSplit(trainKeys(c.kind, Array.isArray(c.pitches) ? c.pitches : null), c.train));
  const keys = pointKeys(c), budget = budgetOf(c), cap = C.cap[c.kind];
  if (!sameKeys(c.points, keys)) out.push(`points must hold exactly ${keys.join(', ')}`);
  else {
    for (const k of keys) if (!inRange(c.points[k], [C.floor, cap])) out.push(`${k} must be a whole number from ${C.floor} to ${cap}`);
    const sum = keys.reduce((s, k) => s + c.points[k], 0);
    if (sum !== budget) out.push(`points add up to ${sum}, the budget is exactly ${budget}`);
  }
  return out;
}

const r3 = x => Math.round(x * 1000) / 1000;
/* the display avg placeholder follows contact, least squares over the factory batters (as league/tools/abilities.mjs) */
const AVG_FIT = (() => {
  const b = ROSTERS.flatMap(t => t.bat), mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  const mc = mean(b.map(p => p.con)), ma = mean(b.map(p => p.avg));
  let xy = 0, xx = 0; for (const p of b) { xy += (p.con - mc) * (p.avg - ma); xx += (p.con - mc) ** 2; }
  return con => r3(ma + (xx ? xy / xx : 0) * (con - mc));
})();

export function makePlayer(seed, c) {
  const why = validateCreate(c);
  if (why.length) throw new Error(`invalid choice: ${why.join('; ')}`);
  seed >>>= 0;
  const r = rng(seed), pit = c.kind === 'pit', B = CREATE.builds[c.build] || CREATE.builds.normal;
  const age = between(r, AGE), num = between(r, NUM);
  const drawn = between(r, B.ht.map(h => Math.round(h * HT_STEP))) / HT_STEP;   /* always drawn, so a chosen height leaves the other draws (potential) as they were */
  const custom = !c.build, ht = custom ? Math.round(c.ht * HT_STEP) / HT_STEP : drawn;
  const pot = potDraw(r(), r());
  const raw = (k, d) => ratingsOf.raw(pit, k, d);
  const p = { id: `fa-${seed.toString(36)}`, name: drawName(seed, c.nameDraw || 0), num };
  if (pit) Object.assign(p, { role: c.role, stuff: raw('stuff', c.points.stuff), ctrl: raw('ctrl', c.points.ctrl), age, pot: raw('pot', pot), throws: c.throws, arm: r3(raw('arm', c.points.arm)) });
  else {
    const con = raw('con', c.points.con);
    Object.assign(p, { pos: c.pos, con, pow: raw('pow', c.points.pow), eye: raw('eye', c.points.eye), age, pot: raw('pot', pot), arm: r3(raw('arm', c.points.arm)), avg: AVG_FIT(con), spd: r3(raw('spd', c.points.spd)), hand: c.bats });
    if (CREATE.defKey in c.points) p.def = r3(raw('def', c.points.def));
  }
  if (pit && c.pitches) p.pitches = Object.fromEntries(CREATE.pitches.filter(n => c.pitches.includes(n)).map(n => [n, c.points.stuff]));
  const tk = trainKeys(c.kind, pit && c.pitches ? Object.keys(p.pitches) : null), split = c.train || defaultSplit(c.kind, c.role, pit && c.pitches ? Object.keys(p.pitches) : null);
  Object.assign(p, { body: custom ? Object.fromEntries(CREATE.bodyKeys.map(k => [k, c.body[k] / 100])) : { ...B.body }, ht, look: { ...c.look }, train: Object.fromEntries(tk.map(k => [k, split[k]])) });
  return { player: p, ratings: ratingsOf(p) };
}
