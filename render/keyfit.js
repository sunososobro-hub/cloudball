/* Tight key-shadow frustum on the players in the shot (#211 item 2, last part). Pure: no three.js, no DOM, no clock. render/game.js loads it by
 * dynamic import and, on `max` only, re-fits the key light's shadow camera while the tight batter shot is on (tightW > 0): the light keeps its
 * direction (position - target stays KEY_OFFSET), the target moves to the batter and the ortho box shrinks from the whole park to a few metres, so
 * the same 4096 map spends its texels on the people in the picture. Visual only: no event timing, no pose, no engine input (rules 10 and 12). */
export const KEY_OFFSET = [-45, 85, 35];            /* key.position - key.target: the light direction, unchanged by the fit */
export const KEY_PARK_TARGET = [0, 0, -38];         /* the whole-park fit (game.js key.target) */
export const KEY_PARK_HALF = 75;                    /* m, half-width of the ortho box over the park */
export const KEY_TIGHT_HALF = 9;                    /* m, half-width around the batter (batter, catcher, umpire, plate stay inside) */
export function keyFit(focus) {
  const t = focus && [focus.x, focus.y, focus.z].every(Number.isFinite) ? [focus.x, 0, focus.z] : null, c = t || KEY_PARK_TARGET;
  return { target: c, position: [c[0] + KEY_OFFSET[0], c[1] + KEY_OFFSET[1], c[2] + KEY_OFFSET[2]], half: t ? KEY_TIGHT_HALF : KEY_PARK_HALF, tight: !!t };
}
