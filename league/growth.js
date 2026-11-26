/* Lazy daily growth of created players (#564). Pure: no DOM, network, clock or unseeded randomness; the caller says how many
 * whole days have passed. The server (functions/lib/agents.js) runs it on read: no cron, no worker (rules 19-20).
 * The model is league/training.js `trainDay`; this file only seeds it and keeps a checkpoint. Display only (rule 10): nothing
 * here touches ROSTERS, a game or the engine.
 *
 *   dayRng(id, day)                 the RNG of one training day: seeded from the player id and the day number, so day N of a player
 *                                   is the same numbers whether it is replayed from creation or from a checkpoint.
 *   bonusOn(player, day)            the plain bonus number a mini-game gave on that day: player.bonus = { "<day>": n }; none = 0 (hands-off).
 *   growTo(player, ratings, days, ckpt)  the training state after `days` whole days. ratings = his CREATION ratings (never overwritten);
 *                                   ckpt = { day, abil } of an earlier run (floats, exact), or null. Stops at RETIRE_AGE.
 *   viewOf(player, ratings, state)  { player, ratings } with the grown whole numbers (ratings keys, ovr, pitches, age); pot is unchanged.
 *   checkpointOf(state)             { day, abil } to store beside the player. */
import { mulberry32 } from '../engine/rng.js';
import { trainDay, overallOf, ageOn, KEYS } from './training.js';
import { RETIRE_AGE } from './callup.js';

export const CKPT_EVERY = 30;           /* days between written checkpoints (the replay from one is at most this long) */
const hashSeed = text => { let h = 2166136261; for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619); return h >>> 0; };
export const dayRng = (id, day) => mulberry32(hashSeed(`${id}#${day}`));
export const bonusOn = (player, day) => { const b = player.bonus && player.bonus[day]; return typeof b === 'number' && b > 0 ? b : 0; };

export function growTo(player, ratings, days, ckpt = null) {
  const pit = !!player.role, keys = Object.keys(player.train);
  const abil = ckpt ? { ...ckpt.abil } : Object.fromEntries(keys.map(k => [k, k in ratings ? ratings[k] : player.pitches[k]]));
  const s = { pit, age0: player.age, day: ckpt ? ckpt.day : 0, pot: ratings.pot, split: player.train, abil };
  while (s.day < days && ageOn(s) < RETIRE_AGE) trainDay(s, dayRng(player.id, s.day), bonusOn(player, s.day));
  return s;
}
export const checkpointOf = s => ({ day: s.day, abil: { ...s.abil } });

export function viewOf(player, ratings, s) {
  if (s.day === 0) return { player: { ...player }, ratings: { ...ratings } };   /* day 0 = creation, exactly (the stored overall is from the raw numbers, not the rounded ones) */
  const out = { ...ratings }, whole = k => Math.round(s.abil[k]);
  for (const k of KEYS[s.pit ? 'pit' : 'bat']) out[k] = whole(k);
  out.ovr = overallOf({ ...s, abil: Object.fromEntries(Object.keys(s.abil).map(k => [k, whole(k)])) });
  const p = { ...player, age: ageOn(s) };
  if (player.pitches) p.pitches = Object.fromEntries(Object.keys(player.pitches).map(k => [k, whole(k)]));
  return { player: p, ratings: out };
}
