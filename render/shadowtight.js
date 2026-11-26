/* #211 item 2 (rest): the tight key-shadow frustum on `max` (plain data + pure maths, no three.js, no DOM, no Date / Math.random).
 * game.js adds a second directional light on `max` only. It points the same way as the key light, its shadow camera covers only TIGHT_HALF metres
 * around the shot's aim point, so the same 4096 map gives about 5x the texels per metre on the players. The aim point is a pure function of the
 * shot (the camera target), snapped to a grid so the map does not shimmer while the camera eases: a seek shows what playing there shows.
 * The two lights share the key's intensity (TIGHT_SHARE goes to the tight one); outside the tight box the tight light is unshadowed. */
export const TIGHT_HALF = 14;      /* half-width of the tight shadow box, metres (infield + both dugout lines fit) */
export const TIGHT_SHARE = .5;     /* share of the key light's intensity carried by the tight light */
export const TIGHT_SNAP = .25;     /* aim point snap, metres (>= one texel: 2 * TIGHT_HALF / 4096 = 6.8 mm, so this is a few cm of margin) */
export const TIGHT_NEAR = 10, TIGHT_FAR = 260; /* same depth range as the wide key shadow */
export const FIELD_X = [-60, 60], FIELD_Z = [-130, 20]; /* the aim never leaves the field box */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
/* aim point (x, z) of the shot -> centre of the tight box, snapped and kept on the field */
export function tightCenter(tx, tz) {
  const sn = v => Math.round(v / TIGHT_SNAP) * TIGHT_SNAP;
  return [sn(clamp(tx, FIELD_X[0], FIELD_X[1])), sn(clamp(tz, FIELD_Z[0], FIELD_Z[1]))];
}
/* split of the key light's intensity: [wide, tight]; off = the wide light keeps all of it (every tier but max) */
export function splitKey(intensity, on) { return on ? [intensity * (1 - TIGHT_SHARE), intensity * TIGHT_SHARE] : [intensity, 0]; }
