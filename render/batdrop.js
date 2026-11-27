/* #43 items 2-3: the bat leaves the batter's hands when he sets off (plain data + pure maths, no three.js, no DOM, no Date / Math.random).
 * Until now the bat vanished with the batter figure at the engine's st0 (the runner body that takes over carries no bat). Now, at st0,
 * the bat is let go from wherever his hands hold it and flies on its own, under gravity, to a spot just outside the box on the side
 * away from the plate, and lies there for the rest of the event:
 *   - 'flip' (home run, item 3): tossed up high, two turns end over end: a bat flip, not the swing follow-through;
 *   - 'toss' (any other ball in play, bunts included): a low one-turn toss aside as he breaks for first;
 *   - 'lay'  (walk, intentional walk, hit by pitch): a short underhand drop by the plate, no turn, then the jog.
 * Rule 12: timing is the engine's (st0 = when he leaves); this only draws the bat. game.js reads the release pose from the held bat at
 * st0 (pure in (event, time)), then `batFlight` gives position and progress. Left: the bat boy who fetches it (#43 item 2).
 * World frame: x toward first base side of the plate (+x), z toward the backstop (+z); a righty's box is at x < 0 (side = -1). */
export const BAT_G = 9.8;                 /* m/s^2 */
export const BAT_REST_Y = .025;           /* handle origin height of a bat lying on the dirt (barrel radius ~.034, handle ~.016) */
/* per kind: peak above the release point (m), landing offset [away from the plate, toward the backstop] (m) from the box centre,
 * whole turns end over end, the lying bat's heading (rad from +z, + = barrel turned away from the plate). Spots keep the lying bat
 * >= .5 m from the catcher (0, 1.3), the plate umpire's give-way spot (2, 2.1) and the next batter's BAT_FROM (2.6, 1), either side. */
export const BAT_LEN = .82;              /* handle origin to barrel end (players.js makeBat) */
export const BAT_KINDS = {
  flip: { peak: 2.2, land: [.8, .4], turns: 2, head: .2 },
  toss: { peak: .45, land: [.7, .35], turns: 1, head: -.3 },
  lay:  { peak: .12, land: [.45, .3], turns: 0, head: 0 },
};
export const BAT_BOX_X = .9, BAT_BOX_Z = .15; /* |x| and z of the box centre (game.js BAT_BOX) */

/* which kind for a pitch event, or null when the batter does not run off with it (strikeout walk-off keeps his bat) */
export function batKind(e) {
  if (!e || e.k !== 'P' || !(e.moves || []).some(m => m[0] === 0)) return null;
  if (e.r === 'inplay') return e.play && e.play.res === 'HR' ? 'flip' : 'toss';
  return 'lay';
}
/* the batter's st0 (event-local s) for that event */
export function batRelease(e) { const m = (e.moves || []).find(m => m[0] === 0); return m ? m[3].st0 : Infinity; }
/* landing spot (world x, z) and heading for kind k, batter side (-1 righty box at x < 0, +1 lefty) */
export function batLand(k, side) {
  const K = BAT_KINDS[k];
  return { x: side * (BAT_BOX_X + K.land[0]), z: BAT_BOX_Z + K.land[1], head: side * K.head };
}
/* flight time from release height y0 (m) for kind k: up to y0 + peak, then down to the dirt */
export function batFlightT(k, y0) {
  const H = BAT_KINDS[k].peak, v = Math.sqrt(2 * BAT_G * H);
  return v / BAT_G + Math.sqrt(2 * Math.max(0, y0 + H - BAT_REST_Y) / BAT_G);
}
/* pose tau s after release from p0 = [x, y, z]: {p: [x, y, z] of the handle origin, s: 0..1 flight progress, spin: rad end over end, done} */
export function batFlight(k, p0, side, tau) {
  const K = BAT_KINDS[k], L = batLand(k, side), T = batFlightT(k, p0[1]), t = Math.max(0, Math.min(T, tau)), s = T > 0 ? t / T : 1;
  const v = Math.sqrt(2 * BAT_G * K.peak), y = s >= 1 ? BAT_REST_Y : Math.max(BAT_REST_Y, p0[1] + v * t - BAT_G * t * t / 2);
  return { p: [p0[0] + (L.x - p0[0]) * s, y, p0[2] + (L.z - p0[2]) * s], s, spin: 2 * Math.PI * K.turns * s, done: tau >= T, head: L.head };
}
