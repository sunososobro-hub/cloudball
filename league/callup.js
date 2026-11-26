/* Call-up rule of #500: reaching the 一軍 level is not the same as being called up. Pure: no DOM, network, clock or RNG;
 * nothing here touches the engine (rule 10), it is display and model only, like league/training.js.
 *
 *   starters(players)              the 一軍 (tier 1) players who have not retired (age under RETIRE_AGE).
 *   slotTemplate(players)          slots per position of one team, counted from the data (most any team has), never typed.
 *   teamsOf(players)               the team ids in the data, sorted.
 *   openSlots(players, teams)      [{ team, pos }] a team has free: its template minus its starters. A slot opens only when a
 *                                  starter leaves (retires) or a team is added (a team with no players has the whole template).
 *   weakestAt(players, pos)        the lowest overall among the starters at pos (undefined when none).
 *   isReady(p, players)            ready = overall at or above that weakest starter. By ability only.
 *   decide(players, waiting, o)    who is called up now and who waits. `waiting` = [{ id, pos | role, overall, waited }]
 *                                  (waited = days since he was ready). Ordered by overall, then days waited, then id.
 *                                  Returns { called: [{ id, team, pos }], waiting: [{ id, pos, status: 等位置, queue }],
 *                                  farm: [{ id, pos, status: 二軍 }] } (farm = not ready yet).
 * `players` is the format of league/site/players.json (id -> { team, tier, pos, age, overall }), or an array of it.
 * Options { teams, retireAge }: teams defaults to teamsOf(players); a new team id adds its slots with no code change. */
import { DECLINE_CURVE } from './training.js';

export const RETIRE_AGE = DECLINE_CURVE[DECLINE_CURVE.length - 1][0];   /* the last point of the decline curve: a starter this old retires */
export const FIRST_TIER = 1;                                            /* tier of the 一軍 in the data */
export const STATUS = { farm: '二軍', wait: '等位置', up: '一軍' };

const list = players => (Array.isArray(players) ? players : Object.values(players));
/* a created pitcher has a role (SP, MR, RP, CL), the roster has the slot position SP or RP */
export const slotPos = p => p.pos || (p.role === 'SP' ? 'SP' : 'RP');

export const starters = (players, retireAge = RETIRE_AGE) => list(players).filter(p => p.tier === FIRST_TIER && p.age < retireAge);
export const teamsOf = players => [...new Set(list(players).filter(p => p.tier === FIRST_TIER).map(p => p.team))].sort();

/* slots per position of a team: the most any team has in the data (retired players still count, the slot is the seat) */
export function slotTemplate(players) {
  const per = {};
  for (const p of list(players)) if (p.tier === FIRST_TIER) { const t = (per[p.team] ??= {}); t[slotPos(p)] = (t[slotPos(p)] || 0) + 1; }
  const out = {};
  for (const t of Object.values(per)) for (const [pos, n] of Object.entries(t)) out[pos] = Math.max(out[pos] || 0, n);
  return Object.fromEntries(Object.keys(out).sort().map(k => [k, out[k]]));
}

export function openSlots(players, { teams = teamsOf(players), retireAge = RETIRE_AGE } = {}) {
  const tpl = slotTemplate(players), have = {};
  for (const p of starters(players, retireAge)) { const k = `${p.team}/${slotPos(p)}`; have[k] = (have[k] || 0) + 1; }
  return teams.flatMap(team => Object.entries(tpl).flatMap(([pos, n]) => Array.from({ length: Math.max(0, n - (have[`${team}/${pos}`] || 0)) }, () => ({ team, pos }))));
}

export function weakestAt(players, pos, retireAge = RETIRE_AGE) {
  const o = starters(players, retireAge).filter(p => slotPos(p) === pos).map(p => p.overall);
  return o.length ? Math.min(...o) : undefined;
}
export function isReady(p, players, retireAge = RETIRE_AGE) {
  const w = weakestAt(players, slotPos(p), retireAge);
  return w === undefined || p.overall >= w;
}

/* the order of the queue: higher overall first, then more days waited, then id (so it is the same every run) */
export const queueOrder = (a, b) => b.overall - a.overall || (b.waited || 0) - (a.waited || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function decide(players, waiting, { teams = teamsOf(players), retireAge = RETIRE_AGE } = {}) {
  const slots = openSlots(players, { teams, retireAge }), out = { called: [], waiting: [], farm: [] };
  const ready = [];
  for (const w of waiting) {
    const pos = slotPos(w);
    if (isReady({ ...w, pos }, players, retireAge)) ready.push({ ...w, pos }); else out.farm.push({ id: w.id, pos, status: STATUS.farm });
  }
  for (const pos of [...new Set(ready.map(w => w.pos))].sort()) {
    const q = ready.filter(w => w.pos === pos).sort(queueOrder), free = slots.filter(s => s.pos === pos);
    q.forEach((w, i) => {
      if (i < free.length) out.called.push({ id: w.id, team: free[i].team, pos });
      else out.waiting.push({ id: w.id, pos, status: STATUS.wait, queue: i - free.length + 1 });
    });
  }
  return out;
}
