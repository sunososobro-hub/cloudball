/* Created free agents, first version of #167 (slice 1, #178). Pure: no DOM, network, clock or unseeded
 * randomness; the caller gives every seed. Data format: CC0.
 *
 *   drawName(seed, n)        the n-th name drawn for that seed (n = 0 first, 1 after one redraw, ...). No free text (#167 X3).
 *   CREATE                   what a fan chooses, and the one fixed point budget on the 1 to 100 display scale.
 *   validateCreate(choice)   list of plain reasons; empty = fine.
 *   makePlayer(seed, choice) { player, ratings }: the player in the roster format of league/players.js, and
 *                            ratingsOf(player) on the factory scale (league/ratings.js).
 *
 * A choice: { kind: 'bat', pos, bats, build, look, points: {con, pow, eye, spd, arm}, nameDraw, train }
 *        or { kind: 'pit', role, throws, build, look, points: {stuff, ctrl, arm}, nameDraw, train }.
 * role (#378): SP 先發, MR 中繼, RP 後援, CL 終結. The engine starts an SP and puts every other role in the bullpen.
 * train (#369, optional): the daily training split, whole percents over the same ability keys, sum 100
 * (league/training.js); left out = defaultSplit (by pitcher role, even for batters). It is stored on the player as `train`.
 * The points are spent in full (sum = the budget of the kind), each between FLOOR and CAP. Potential, age, height
 * and shirt number are not chosen: they are drawn from the seed (potential is the luck people talk about).
 * Nothing here touches ROSTERS: a created player reaches a game only through a roster given to the engine (rule 10). */
import { ROSTERS } from './players.js';
import { STAFF, UMPIRES } from './staff.js';
import { SURNAMES, GIVEN } from './namepool.js';
import { ratingsOf, BAT_WEIGHTS, PIT_WEIGHTS } from './ratings.js';
import { validateSplit, defaultSplit } from './training.js';

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
  hands: ['L', 'R'],
  /* build -> body blend weights (render) and height range in metres */
  builds: {
    normal: { body: { slim: 0, power: 0, heavy: 0 }, ht: [1.74, 1.86] },
    slim: { body: { slim: 0.6, power: 0, heavy: 0 }, ht: [1.72, 1.84] },
    power: { body: { slim: 0, power: 0.7, heavy: 0 }, ht: [1.78, 1.90] },
    heavy: { body: { slim: 0, power: 0.5, heavy: 0.7 }, ht: [1.78, 1.92] },
  },
  /* look: whole numbers, checked by range only; the render window decides what each number draws */
  look: { head: [0, 7], skin: [0, 5], hair: [0, 9] },
  keys: { bat: Object.keys(BAT_WEIGHTS), pit: Object.keys(PIT_WEIGHTS) },
  /* the one fixed budget per kind, and the floor and cap of each ability (display points, 1 to 100) */
  budget: { bat: 305, pit: 183 },
  floor: 40,
  cap: { bat: 70, pit: 66 },
  maxNameDraw: 999,
};
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

const isWhole = x => Number.isInteger(x);
const inRange = (x, [a, b]) => isWhole(x) && x >= a && x <= b;
const sameKeys = (o, keys) => o && typeof o === 'object' && Object.keys(o).length === keys.length && keys.every(k => k in o);

export function validateCreate(c) {
  const out = [], C = CREATE;
  if (!c || typeof c !== 'object') return ['no choice given'];
  if (!C.kinds.includes(c.kind)) return [`kind must be one of ${C.kinds.join(', ')}`];
  const bat = c.kind === 'bat', allowed = ['kind', bat ? 'pos' : 'role', bat ? 'bats' : 'throws', 'build', 'look', 'points', 'nameDraw', 'train'];
  for (const k of Object.keys(c)) if (!allowed.includes(k)) out.push(`unknown field ${k}`);
  if (bat && !C.positions.includes(c.pos)) out.push(`position must be one of ${C.positions.join(', ')}`);
  if (!bat && !C.roles.includes(c.role)) out.push(`role must be one of ${C.roles.join(', ')}`);
  if (!C.hands.includes(bat ? c.bats : c.throws)) out.push(`${bat ? 'bats' : 'throws'} must be L or R`);
  if (!(c.build in C.builds)) out.push(`build must be one of ${Object.keys(C.builds).join(', ')}`);
  const lk = Object.keys(C.look);
  if (!sameKeys(c.look, lk)) out.push(`look must hold exactly ${lk.join(', ')}`);
  else for (const k of lk) if (!inRange(c.look[k], C.look[k])) out.push(`look.${k} must be a whole number from ${C.look[k][0]} to ${C.look[k][1]}`);
  if (c.nameDraw !== undefined && !inRange(c.nameDraw, [0, C.maxNameDraw])) out.push(`nameDraw must be a whole number from 0 to ${C.maxNameDraw}`);
  if (c.train !== undefined) out.push(...validateSplit(C.keys[c.kind], c.train));
  const keys = C.keys[c.kind], budget = C.budget[c.kind], cap = C.cap[c.kind];
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
  const r = rng(seed), pit = c.kind === 'pit', B = CREATE.builds[c.build];
  const age = between(r, AGE), num = between(r, NUM);
  const ht = between(r, B.ht.map(h => Math.round(h * HT_STEP))) / HT_STEP;
  const pot = potDraw(r(), r());
  const raw = (k, d) => ratingsOf.raw(pit, k, d);
  const p = { id: `fa-${seed.toString(36)}`, name: drawName(seed, c.nameDraw || 0), num };
  if (pit) Object.assign(p, { role: c.role, stuff: raw('stuff', c.points.stuff), ctrl: raw('ctrl', c.points.ctrl), age, pot: raw('pot', pot), throws: c.throws, arm: r3(raw('arm', c.points.arm)) });
  else {
    const con = raw('con', c.points.con);
    Object.assign(p, { pos: c.pos, con, pow: raw('pow', c.points.pow), eye: raw('eye', c.points.eye), age, pot: raw('pot', pot), arm: r3(raw('arm', c.points.arm)), avg: AVG_FIT(con), spd: r3(raw('spd', c.points.spd)), hand: c.bats });
  }
  Object.assign(p, { body: { ...B.body }, ht, look: { ...c.look }, train: Object.fromEntries(CREATE.keys[c.kind].map(k => [k, (c.train || defaultSplit(c.kind, c.role))[k]])) });
  return { player: p, ratings: ratingsOf(p) };
}
