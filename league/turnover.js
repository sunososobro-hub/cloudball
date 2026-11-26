/* Season-end turnover of #565: the league keeps moving (retire, cull, rookies, call-ups) so the first fan joins a league that
 * is already running. Pure and seeded: no DOM, network, clock or Math.random; nothing here touches the engine (rule 10),
 * it works on the display data (league/site/players.json format: id -> { team, tier, pos, age, overall, abilities }).
 *
 *   advanceYear(players)            a copy with every player one year older (training and decline are league/training.js).
 *   seasonEnd(players, { seed })    one turnover step, in this order:
 *     1. retire: every player at or past RETIRE_AGE (league/callup.js) leaves the data, whatever the tier.
 *     2. cull: per position, the CULL_PER_POS lowest-overall 一軍 starters of the whole league drop to the 自由市場
 *        (tier FREE_TIER, team null); they are not deleted. Ties by id.
 *     3. call-up: the seats that opened go through callup.decide (#500): ready 二軍 players by overall, then days waited.
 *        `waited` on a row = days since he was ready; a ready player who got no seat gains DAYS_PER_SEASON, one who
 *        was called up or is not ready yet has none.
 *     4. rookies: each team gets code-generated rookies (league/freeagents.js makePlayer, age ROOKIE_AGE, seeded,
 *        a random legal point spread, `system: true`) until its 一軍 + 二軍 count is what it was, so roster size stays constant.
 *   Returns { players, retired, culled, called: [{ id, team, pos }], waiting, rookies } (ids; `players` is a new object). */
import { RETIRE_AGE, FIRST_TIER, slotPos, slotTemplate, teamsOf, decide } from './callup.js';
import { CREATE, makePlayer, drawName } from './freeagents.js';
import { DAYS_PER_SEASON } from './training.js';

export const CULL_PER_POS = 1;              /* 一軍 starters per position who leave each season (start value of #565, to be tuned by the sim) */
export const SECOND_TIER = 2, FREE_TIER = 3;
export const ROOKIE_AGE = [18, 22];
export const SEED_SALT = 0x9e3779b1;
const NAME_TRIES = 1000;

const rng = seed => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const mix = (...n) => n.reduce((h, x) => Math.imul(h ^ (x >>> 0), SEED_SALT) >>> 0, 0x811c9dc5);
const between = (r, [a, b]) => a + Math.floor(r() * (b - a + 1));
const byId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const league = (players, id) => players[id].tier === FIRST_TIER || players[id].tier === SECOND_TIER;

export function advanceYear(players) {
  const out = structuredClone(players);
  for (const p of Object.values(out)) p.age++;
  return out;
}

/* integer parts that sum to total, each in [lo, hi], spread at random (the shape of a fan's choice) */
function spread(r, keys, total, lo, hi) {
  const out = Object.fromEntries(keys.map(k => [k, lo])); let left = total - lo * keys.length;
  while (left > 0) { const k = keys[Math.floor(r() * keys.length)]; if (out[k] < hi) { out[k]++; left--; } }
  return out;
}

/* one rookie in the players.json row format, for `pos` (a batting position or a pitcher role) on `team` */
export function makeRookie(seed, pos, team, taken) {
  const r = rng(seed), kind = CREATE.positions.includes(pos) ? 'bat' : 'pit', keys = CREATE.keys[kind];
  const points = spread(r, keys, CREATE.budget[kind], CREATE.floor, CREATE.cap[kind]), look = { head: 0, skin: 0, hair: 0 };
  const c = kind === 'bat' ? { kind, pos, bats: r() < 0.3 ? 'L' : 'R', build: 'normal', look, points }
    : { kind, role: pos, throws: r() < 0.3 ? 'L' : 'R', build: 'normal', look, points };
  let made, n = 0;
  for (; n < NAME_TRIES; n++) { made = makePlayer(seed, { ...c, nameDraw: n }); if (!taken.has(made.player.name)) break; }
  const { player: p, ratings } = made, { ovr, ...abilities } = ratings;
  abilities.pot = Math.max(abilities.pot, ovr);      /* nobody starts over his potential */
  taken.add(p.name);
  return [p.id, { name: p.name, num: p.num, age: between(r, ROOKIE_AGE), role: kind === 'pit' ? 'P' : 'B', pos,
    hand: kind === 'pit' ? p.throws : p.hand, overall: ovr, abilities, team, tier: SECOND_TIER, system: true }];
}

export function seasonEnd(players, { seed, retireAge = RETIRE_AGE, cullPerPos = CULL_PER_POS } = {}) {
  const next = structuredClone(players), ids = Object.keys(next).sort(byId);
  const size = Object.fromEntries(teamsOf(players).map(t => [t, ids.filter(i => next[i].team === t && league(next, i)).length]));
  const retired = ids.filter(i => next[i].age >= retireAge);
  const gone = new Set(retired);
  /* the seats of the leavers stay in the template (callup.slotTemplate counts them), so the view keeps them as retired starters */
  const view = structuredClone(players);
  for (const i of retired) delete next[i];

  const culled = [];
  const starters = ids.filter(i => next[i] && next[i].tier === FIRST_TIER), byPos = {};
  for (const i of starters) (byPos[slotPos(next[i])] ??= []).push(i);
  for (const pos of Object.keys(byPos).sort())
    for (const i of byPos[pos].sort((a, b) => next[a].overall - next[b].overall || byId(a, b)).slice(0, cullPerPos)) {
      Object.assign(next[i], { team: null, tier: FREE_TIER }); delete next[i].waited; culled.push(i);
    }
  for (const i of [...retired, ...culled]) view[i].age = Math.max(view[i].age, retireAge);

  const waiting = ids.filter(i => next[i] && next[i].tier === SECOND_TIER)
    .map(i => ({ id: i, pos: slotPos(next[i]), overall: next[i].overall, waited: next[i].waited || 0 }));
  const d = decide(view, waiting);
  for (const c of d.called) { Object.assign(next[c.id], { team: c.team, tier: FIRST_TIER }); delete next[c.id].waited; }
  for (const w of d.waiting) next[w.id].waited = (next[w.id].waited || 0) + DAYS_PER_SEASON;
  for (const f of d.farm) delete next[f.id].waited;

  /* rookies refill each team's 二軍 to its old size; positions are drawn from the seats of the template */
  const tpl = slotTemplate(players), seats = Object.entries(tpl).flatMap(([pos, n]) => Array(n).fill(pos));
  const taken = new Set(Object.values(next).map(p => p.name)), rookies = [];
  Object.keys(size).sort().forEach((team, ti) => {
    const have = Object.keys(next).filter(i => next[i].team === team && league(next, i)).length;
    for (let k = 0; k < size[team] - have; k++) {
      const s = mix(seed, ti, k), pos = seats[Math.floor(rng(s)() * seats.length)];
      let [id, row] = makeRookie(s, pos, team, taken);
      for (let bump = 1; next[id] || gone.has(id) || players[id]; bump++) [id, row] = makeRookie(mix(s, bump), pos, team, taken);
      next[id] = row; rookies.push(id);
    }
  });
  return { players: next, retired, culled, called: d.called, waiting: d.waiting, rookies };
}
