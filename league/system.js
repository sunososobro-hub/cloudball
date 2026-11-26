/* 系統 players (#437 part 2): fillers of the free market and the 二軍 until real fans replace them. Pure, no RNG, no clock.
 * A 系統 player is a roster-format player with `system: true` (a real fan player has no such key). Display and placement only:
 * nothing here changes an ability or a game result (rule 10). */
export const isSystem = p => !!p && p.system === true;
export const SYSTEM_TAG = '系統';

/* placeFans(pool, fans) -> { pool, replaced }
 * pool: [{ kind: 'bat'|'pit', player, ratings: { ovr } }], fans: the same shape (real fan players).
 * Each fan takes the place of ONE 系統 player of the same kind, the weakest (lowest ovr, then lowest id) first, so the
 * pool keeps its size. A fan with no 系統 player of his kind left is added. A player without `system: true` (a factory
 * 一軍 player, another fan) is never removed. `replaced` lists the ids of the 系統 players that went out. Inputs are not changed. */
export function placeFans(pool, fans) {
  const out = pool.slice(), replaced = [];
  const weakest = kind => {
    let at = -1;
    out.forEach((e, i) => {
      if (e.kind !== kind || !isSystem(e.player)) return;
      if (at < 0) { at = i; return; }
      const a = out[at], ao = a.ratings.ovr, eo = e.ratings.ovr;
      if (eo < ao || (eo === ao && String(e.player.id) < String(a.player.id))) at = i;
    });
    return at;
  };
  for (const f of fans) {
    if (isSystem(f.player)) continue;
    const at = weakest(f.kind);
    if (at < 0) out.push(f); else { replaced.push(out[at].player.id); out[at] = f; }
  }
  return { pool: out, replaced };
}
