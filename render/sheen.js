/* #208 item 3 (part 6): damp sheen on the grass at night (plain data + pure maths, no three.js, no DOM, no Date / Math.random).
 * game.js draws one flat additive overlay over the field (no extra pass, 0 bytes of download); its shader uses these constants and `sheenAt` is the JS reference
 * with the same scale and shimmer, so the check runs the behaviour. Strength follows the sky's lamp value: none on the clear parks, full at night.
 * Time is the game clock (curT), so a seek shows the same sheen as playing there. */
export const SHEEN_SCALE = 14;      /* metres per noise cell: wet patches, not speckle */
export const SHEEN_DRIFT = .05;     /* noise units per second the patches shimmer: barely moves */
export const SHEEN_COVER = .45;     /* noise above this is damp; lower = wetter */
export const SHEEN_SOFT = .25;      /* edge width, in noise units */
export const SHEEN_MAX = .09;       /* brightest glint = 9 % added light (ball stays readable) */
export const SHEEN_LAMP_OFF = .6, SHEEN_LAMP_FULL = .95; /* sky lamp <= OFF = none, >= FULL = full strength */
export const SHEEN_RGB = [.78, .88, 1]; /* pale cool light off the tower lamps */

const hash = (x, z) => { let h = Math.imul(x * 73856093 ^ z * 19349663, 2654435761); h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
const vnoise = (x, z) => { const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi, sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz),
  a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1); return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz; };
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/* sky lamp (0 day .. 1 night) -> 0..1 */
export function sheenStrength(lamp) { return smooth(SHEEN_LAMP_OFF, SHEEN_LAMP_FULL, lamp); }
/* added light 0..SHEEN_MAX at world (x, z) and game time t (s), before the sky's strength */
export function sheenAt(x, z, t) {
  const s = t * SHEEN_DRIFT, n = vnoise(x / SHEEN_SCALE + s, z / SHEEN_SCALE - s * .6) * .7 + vnoise(x / (SHEEN_SCALE * .4) - s * 1.3 + 7.1, z / (SHEEN_SCALE * .4) + 3.9) * .3;
  return smooth(SHEEN_COVER - SHEEN_SOFT, SHEEN_COVER + SHEEN_SOFT, n) * SHEEN_MAX;
}
