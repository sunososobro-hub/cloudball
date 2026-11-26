/* Dust puffs on slides (#208 item 4, part 3). Pure: no three.js, no DOM, no clock, no Math.random / Date (hash of the puff index only).
 * `slideDust(e, bases)` reads the runner moves of ONE event (engine's 4th move element: slide, ts, slideTime, arriveT) and returns the
 * puffs a slide kicks up; `puffAt(p, u)` is the state of one puff at event time u. Both are pure functions of (event, time), so a bar
 * jump shows the same dust as playing there (rule 12: the engine event says a slide happened, nothing is invented).
 * Not drawn yet: game.js wiring (instanced sprites, tiers 0-1 only) is the next part; a cut that skips a slide is covered by cpEvents
 * through `dustEnd(e, bases)` (the second the last puff is gone). Positions are the last SLIDE_D m of the final base path. */
export const SLIDE_D = 3;                      /* same as engine/constants.js SLIDE_D (the slide covers the last 3 m before the bag) */
export const DUST_PUFFS = 6, DUST_LIFE = 1.2;  /* puffs per slide, seconds each puff lives */
export const DUST_RISE = .5, DUST_SPREAD = .6; /* m a puff climbs over its life, m of sideways scatter */
export const DUST_R0 = .25, DUST_R1 = .9;      /* puff radius at birth / at death (m) */
export const DUST_ALPHA = .55;                 /* peak opacity */
const sat = x => Math.max(0, Math.min(1, x)), L = 27.43;
const hash = i => { const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };

export function slideDust(e, bases) {
  const out = [];
  if (!e || !e.moves || !bases) return out;
  e.moves.forEach(([from, to, name, tl], mi) => {
    if (!tl || !tl.slide || !(to >= 1 && to <= 4) || !(tl.slideTime > 0)) return;
    const [x0, z0] = bases[to - 1], [x1, z1] = bases[to], dx = x1 - x0, dz = z1 - z0;
    for (let i = 0; i < DUST_PUFFS; i++) {
      const k = (i + 1) / DUST_PUFFS, sl = 1 - (1 - k) * (1 - k);          /* the engine's slide ease: 1-(1-s)^2 */
      const along = sat((L - SLIDE_D + SLIDE_D * sl) / L), h = hash(to * 31 + mi * 7 + i);
      const side = (hash(to * 17 + mi * 3 + i * 5) - .5) * 2 * DUST_SPREAD;
      out.push({ name, to, t0: tl.ts + tl.slideTime * k * .35, x: x0 + dx * along - dz / L * side, z: z0 + dz * along + dx / L * side, rise: DUST_RISE * (.6 + .8 * h), r0: DUST_R0, r1: DUST_R1 * (.8 + .4 * h) });
    }
  });
  return out;
}
/* One puff at event time u: null before it is born or after it is gone. */
export function puffAt(p, u) {
  const t = (u - p.t0) / DUST_LIFE;
  if (!(t >= 0 && t < 1)) return null;
  return { x: p.x, y: .1 + p.rise * t, z: p.z, r: p.r0 + (p.r1 - p.r0) * Math.sqrt(t), a: DUST_ALPHA * (1 - t) * Math.min(1, t * 8) };
}
/* Event time when the last puff of this event is gone (0 = no slide): cpEvents must treat the event as moving until then. */
export function dustEnd(e, bases) { let m = 0; for (const p of slideDust(e, bases)) m = Math.max(m, p.t0 + DUST_LIFE); return m; }
