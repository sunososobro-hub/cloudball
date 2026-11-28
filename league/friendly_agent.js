/* 友誼賽 / practice link: the own player's 經紀人 set (#795 part 8, the 試試看 link). Pure: imports only league/agentset.js; no clock,
 * no randomness, no DOM, no network, no storage. Never official (rule 24): the set only reaches the engine as simGame opts.agents of
 * this one browser game.
 *
 * Link field `t=<digits>`: the RESOLVED grid of the set, one digit LEVEL_MIN..LEVEL_MAX per cell, rows SITUATIONS[kind] x columns
 * FREQS[kind] in league/agentset.js order (12 digits). The kind is not in the field: it is the own player's (`o=`, role 'P' = pit).
 * Same resolved grid = same engine behaviour, so the digits are the whole set; parse returns the canonical (freezeSet) form.
 *
 *   agentParam(set)              the `t` digits of a valid set
 *   parseAgent(s, kind)          canonical set or null (wrong length, digit out of range, over the pool)
 *   ownKind(own)                 'pit' for a pitcher own player, else 'bat'
 *   friendlyAgents(own, set)     simGame opts.agents { <own name>: set }, or undefined when there is no own player or the set is
 *                                neutral (a neutral set must play the plain game, and leaving opts.agents out guarantees it)
 *   withAgent(link, own, set)    the share link plus `&t=` when friendlyAgents gives something, else the link unchanged */
import { SITUATIONS, FREQS, KINDS, LEVEL_MIN, LEVEL_MAX, AGENT_SET_VERSION, resolveSet, freezeSet, validateSet, isNeutral } from './agentset.js';

const cells = kind => SITUATIONS[kind].flatMap(s => FREQS[kind].map(f => [s, f]));

export function agentParam(set) {
  const g = resolveSet(set);
  return cells(set.kind).map(([s, f]) => String(g[s][f])).join('');
}

export function parseAgent(s, kind) {
  if (!KINDS.includes(kind) || typeof s !== 'string') return null;
  const c = cells(kind);
  if (s.length !== c.length || !/^[0-9]+$/.test(s)) return null;
  const rows = {};
  for (const [i, [sit, f]] of c.entries()) {
    const lv = Number(s[i]);
    if (lv < LEVEL_MIN || lv > LEVEL_MAX) return null;
    (rows[sit] = rows[sit] || {})[f] = lv;
  }
  const set = { v: AGENT_SET_VERSION, kind, rows };
  return validateSet(set).length ? null : freezeSet(set);
}

export const ownKind = own => (own && own.role === 'P' ? 'pit' : 'bat');

export function friendlyAgents(own, set) {
  if (!own || !set || set.kind !== ownKind(own) || validateSet(set).length || isNeutral(set)) return undefined;
  return { [own.name]: freezeSet(set) };
}

export const withAgent = (link, own, set) => (friendlyAgents(own, set) ? `${link}&t=${agentParam(set)}` : link);
