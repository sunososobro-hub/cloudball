/* #208 item 3, slow cloud shadows crossing the field on the day parks (plain data + pure maths, no three.js, no DOM, no Date / Math.random).
 * game.js draws one flat overlay plane over the field (multiply-dark, no extra pass, 0 bytes of download); its shader uses these constants (TSL value noise
 * instead of the hash noise below), and `cloudAt` is the JS reference with the same scale, drift, cover and depth, so the check can run the behaviour. Strength follows the sky's lamp value: full on the clear parks (afternoon, morning),
 * none at dusk and night. Time is the game clock (curT), so a seek shows the same shadows as playing there (rule: pure function of time). */
export const CLOUD_SCALE = 38;       /* metres per noise cell: big soft banks, not spots */
export const CLOUD_SPEED = [1.6, .7]; /* m/s drift along x, z: slow enough to read as weather */
export const CLOUD_COVER = .52;      /* noise above this casts shadow; lower = cloudier */
export const CLOUD_SOFT = .16;       /* edge width, in noise units */
export const CLOUD_MAX = .26;        /* darkest shadow = 26 % less light (ball stays readable) */
export const CLOUD_LAMP_FULL = .15, CLOUD_LAMP_OFF = .5; /* sky lamp <= FULL = full strength, >= OFF = none */

const hash = (x, z) => { let h = Math.imul(x * 73856093 ^ z * 19349663, 2654435761); h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
const vnoise = (x, z) => { const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi, sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz),
  a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1); return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz; };
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/* sky lamp (0 day .. 1 night) -> 0..1 */
export function strengthOf(lamp) { return smooth(CLOUD_LAMP_OFF, CLOUD_LAMP_FULL, lamp); }
/* shadow depth 0..CLOUD_MAX at world (x, z) and game time t (s), before the sky's strength */
export function cloudAt(x, z, t) {
  const px = x - CLOUD_SPEED[0] * t, pz = z - CLOUD_SPEED[1] * t;
  const n = vnoise(px / CLOUD_SCALE, pz / CLOUD_SCALE) * .65 + vnoise(px / (CLOUD_SCALE * .37) + 11.3, pz / (CLOUD_SCALE * .37) + 4.7) * .35;
  return smooth(CLOUD_COVER - CLOUD_SOFT, CLOUD_COVER + CLOUD_SOFT, n) * CLOUD_MAX;
}
