/* Inactive fans (#628, part 1): a fan who does not come back frees his player's seat. Pure: no DOM, network, clock or RNG; the
 * caller says what day it is (whole days, same unit as `created` / `lastSeen`). Display and roster only (rule 10): no ability,
 * age or game result is touched, so seeds and replays stay the same.
 *
 *   releaseInactive(players, { today, lastSeen })   -> { players, released: [id] }  (input never mutated)
 *       a fan-owned player (`owner` set, not `system`) whose owner was last seen INACTIVE_DAYS or more days ago (no lastSeen:
 *       the player's `created` day) loses the owner, goes to tier 3 (自由市場), team null; ratings and age stay. He keeps
 *       `former` (the old owner) and `releasedOn` (today). A 一軍 seat he leaves is open for league/callup.js (#500).
 *   canClaim(player, fan, today)                    only the old owner for RECLAIM_DAYS after the release, then anyone.
 * `players` = id -> player (league/site/players.json format) or an array of it; the result is keyed by id when given a map. */
export const INACTIVE_DAYS = 30;     /* days without a visit before the player is released (owner 2026-11-27, #628) */
export const RECLAIM_DAYS = 30;      /* days after the release when only the old owner can take him back */
export const FREE_TIER = 3;          /* 自由市場, as in league/turnover.js */

export function releaseInactive(players, { today, lastSeen = {} }) {
  const isArr = Array.isArray(players), out = {}, released = [];
  for (const [k, p] of Object.entries(players)) {
    const id = p.id ?? k;
    if (p.owner && !p.system) {
      const seen = Number.isFinite(lastSeen[p.owner]) ? lastSeen[p.owner] : p.created;
      if (today - seen >= INACTIVE_DAYS) {
        const { owner, ...rest } = p;
        out[k] = { ...rest, tier: FREE_TIER, team: null, former: owner, releasedOn: today };
        released.push(id);
        continue;
      }
    }
    out[k] = p;
  }
  return { players: isArr ? Object.values(out) : out, released: released.sort() };
}

export function canClaim(p, fan, today) {
  if (p.owner || p.tier !== FREE_TIER || p.releasedOn === undefined) return false;
  return p.former === fan || today - p.releasedOn >= RECLAIM_DAYS;
}
