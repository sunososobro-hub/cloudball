/* #208 item 3 (part 6), damp sheen on the grass of the night parks (plain data + pure maths, no three.js, no DOM, no Date / Math.random).
 * game.js draws one flat pale overlay over the fair ground (no extra pass, 0 bytes of download); its shader uses these constants (TSL value noise),
 * and `dampAt` is the JS reference with the same scale, patchiness and fair-ground mask. Strength follows the sky's lamp value: full at night,
 * a little at dusk, none by day. It does not move, so it needs no clock: a seek shows what playing shows. */
export const DAMP_SCALE = 14;        /* metres per noise cell: dew patches, not spots */
export const DAMP_COVER = .45;       /* noise above this is damp; lower = wetter */
export const DAMP_SOFT = .22;        /* patch edge width, in noise units */
export const DAMP_MAX = .09;         /* brightest sheen = 9 % pale overlay (the ball stays readable) */
export const DAMP_COLOR = [.55, .66, .85]; /* cool lamp light on wet blades */
export const DAMP_LAMP_OFF = .6, DAMP_LAMP_FULL = 1; /* sky lamp <= OFF = none, >= FULL = full strength */
export const DAMP_R = [95, 12];      /* fair ground: full inside radius R0 m from home, gone by R0 + R1 */

const hash = (x, z) => { let h = Math.imul(x * 73856093 ^ z * 19349663, 2654435761); h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
const vnoise = (x, z) => { const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi, sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz),
  a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1); return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz; };
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/* sky lamp (0 day .. 1 night) -> 0..1 */
export function strengthOf(lamp) { return smooth(DAMP_LAMP_OFF, DAMP_LAMP_FULL, lamp); }
/* fair-ground mask 0..1 at world (x, z): in front of home (-z), inside the foul lines (|x| <= -z) and DAMP_R from home */
export function fairMask(x, z) { if (z >= 0) return 0; const wedge = smooth(-2, 6, -z - Math.abs(x)); return wedge * (1 - smooth(DAMP_R[0], DAMP_R[0] + DAMP_R[1], Math.hypot(x, z))); }
/* sheen depth 0..DAMP_MAX at world (x, z), before the sky's strength */
export function dampAt(x, z) {
  const n = vnoise(x / DAMP_SCALE, z / DAMP_SCALE) * .65 + vnoise(x / (DAMP_SCALE * .41) + 7.1, z / (DAMP_SCALE * .41) + 2.9) * .35;
  return smooth(DAMP_COVER - DAMP_SOFT, DAMP_COVER + DAMP_SOFT, n) * DAMP_MAX * fairMask(x, z);
}
