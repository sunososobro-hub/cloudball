/* Dust puffs on slides (#208 item 4, part 3). Pure: no three.js, no DOM, no clock, no Math.random / Date (hash of the puff index only).
 * `slideDust(e, bases)` reads the runner moves of ONE event (engine's 4th move element: slide, ts, slideTime, arriveT) and returns the
 * puffs a slide kicks up; `puffAt(p, u)` is the state of one puff at event time u. Both are pure functions of (event, time), so a bar
 * jump shows the same dust as playing there (rule 12: the engine event says a slide happened, nothing is invented).
 * game.js draws `eventDust` (slides + the ball on dirt) as sprites; a cut that skips a puff is covered by cpEvents
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
/* #208 item 4 part 5: a batted ball that comes down on dirt kicks up a puff. The dirt is the field map of game.js fieldTex (named here so a
 * plain Node check can see it): the skin circle around the mound minus the grass diamond, the cut-outs at the plate, mound and bags, and the
 * warning track. The ball touches the ground at event time BALL_ARRIVE + play.hang at (play.lx, play.lz): grounders (out or hit) and every
 * hit that is not a home run; a ball caught in the air never touches the ground, so it gets no dust. */
export const BALL_ARRIVE = 2.05;               /* same as engine/constants.js ARRIVE (the pitch reaches the plate; play times count from it) */
export const SKIN_C = [0, -18.4], SKIN_R = 29; /* infield dirt circle (fieldTex arc) */
export const GRASS_C = [0, -19.4], GRASS_HALF = 16.2; /* infield grass diamond: |x| + |z - cz| < GRASS_HALF */
export const DIRT_CUTS = [[0, -18.4, 2.7], [0, 0, 4], [19.4, -19.4, 2.2], [0, -38.8, 2.2], [-19.4, -19.4, 2.2]]; /* mound, plate, bags: x, z, r */
export const TRACK_R0 = 106, TRACK_R1 = 110, FAIR_DEG = 45; /* warning track ring inside the fair wedge */
export const BALL_PUFFS = 4, BALL_SPREAD = .35, BALL_RISE = .35; /* puffs per landing, m of scatter, m of climb */
export function onDirt(x, z) {
  for (const [cx, cz, r] of DIRT_CUTS) if (Math.hypot(x - cx, z - cz) < r) return true;
  const d = Math.hypot(x, z), a = Math.abs(Math.atan2(x, -z)) * 180 / Math.PI;
  if (d >= TRACK_R0 && d < TRACK_R1 && a <= FAIR_DEG) return true;
  if (Math.hypot(x - SKIN_C[0], z - SKIN_C[1]) >= SKIN_R) return false;
  return Math.abs(x - GRASS_C[0]) + Math.abs(z - GRASS_C[1]) >= GRASS_HALF;
}
export function ballDust(e) {
  const out = [], p = e && e.r === 'inplay' && e.play;
  if (!p || p.res === 'HR' || !(p.type === 'GB' || (e.plan && e.plan.hit)) || !(p.hang > 0) || !onDirt(p.lx, p.lz)) return out;
  const t0 = BALL_ARRIVE + p.hang, seed = Math.round(p.lx * 13 + p.lz * 7);
  for (let i = 0; i < BALL_PUFFS; i++) {
    const h = hash(seed + i * 11), a = hash(seed * 3 + i * 5) * 2 * Math.PI, r = BALL_SPREAD * (.3 + .7 * h);
    out.push({ name: 'ball', to: 0, t0: t0 + i * .04, x: p.lx + Math.cos(a) * r, z: p.lz + Math.sin(a) * r, rise: BALL_RISE * (.6 + .8 * h), r0: DUST_R0 * .8, r1: DUST_R1 * (.6 + .3 * h) });
  }
  return out;
}
/* #208 item 4 part 6: a hard foot plant. A runner who reaches 1B, 2B or 3B on his feet (no slide) kicks a small puff off the bag when he
 * arrives (the engine's arriveT, event time). Fewer, smaller and lower than a slide. */
export const FOOT_PUFFS = 2, FOOT_SPREAD = .3, FOOT_RISE = .25, FOOT_SCALE = .6;
export function footDust(e, bases) {
  const out = [];
  if (!e || !e.moves || !bases) return out;
  e.moves.forEach(([from, to, name, tl], mi) => {
    if (!tl || tl.slide || !(to >= 1 && to <= 3) || !(tl.arriveT > 0)) return;
    const [bx, bz] = bases[to];
    for (let i = 0; i < FOOT_PUFFS; i++) {
      const h = hash(to * 41 + mi * 13 + i * 3), a = hash(to * 23 + mi * 5 + i * 7) * 2 * Math.PI, r = FOOT_SPREAD * (.3 + .7 * h);
      out.push({ name, to, t0: tl.arriveT + i * .05, x: bx + Math.cos(a) * r, z: bz + Math.sin(a) * r, rise: FOOT_RISE * (.6 + .8 * h), r0: DUST_R0 * FOOT_SCALE, r1: DUST_R1 * FOOT_SCALE * (.8 + .4 * h) });
    }
  });
  return out;
}
/* Every puff of one event: slides, then the ball on dirt, then foot plants. */
export function eventDust(e, bases) { return slideDust(e, bases).concat(ballDust(e), footDust(e, bases)); }
/* Event time when the last puff of this event is gone (0 = no dust): cpEvents must treat the event as moving until then. */
export function dustEnd(e, bases) { let m = 0; for (const p of eventDust(e, bases)) m = Math.max(m, p.t0 + DUST_LIFE); return m; }
