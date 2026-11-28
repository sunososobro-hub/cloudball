/* #379 part 1: temperament, a per-player trait (火爆 / 平穩 / 溫和). Pure, no RNG draw, no Math.random / Date.
 * It never changes ability ratings or a game today: the engine does not read it yet (grudges and scuffles are
 * later parts of #379, and only the engine will decide them, rule 10).
 * - A created player may choose one (`temper` in the create choice, freeagents.js validateCreate); it is stored on the player.
 * - A player without a stored one (the factory players, older created players) gets a fixed default from his id:
 *   a string hash bucketed by TEMPER_SHARE, so the same id always reads the same temperament. */
export const TEMPERS = ['火爆', '平穩', '溫和'];
/* league share of each temperament for players without a chosen one, in TEMPERS order (percent, adds to 100);
 * a first guess: most players even-tempered, hot heads the smallest group. */
export const TEMPER_SHARE = [25, 45, 30];
export const TEMPER_DEFAULT = TEMPERS[1];

/* FNV-1a 32-bit over the UTF-16 code units of the id */
export function idHash(id) {
  let h = 0x811c9dc5;
  const s = String(id);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

export const isTemper = t => TEMPERS.includes(t);

/* default temperament from the id alone */
export function temperOfId(id) {
  if (id === undefined || id === null || id === '') return TEMPER_DEFAULT;
  let b = idHash(id) % 100;
  for (let i = 0; i < TEMPERS.length; i++) { if (b < TEMPER_SHARE[i]) return TEMPERS[i]; b -= TEMPER_SHARE[i]; }
  return TEMPER_DEFAULT;
}

/* the temperament a player shows: his stored one when valid, else the default of his id */
export const temperOf = p => (p && isTemper(p.temper) ? p.temper : temperOfId(p && p.id));
