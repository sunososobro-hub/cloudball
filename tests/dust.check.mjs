/* Slide dust (#208 item 4, plain Node). render/dust.js on simulated games:
 *   - an event with no slide gives no puffs; every slide gives DUST_PUFFS puffs with positions within SLIDE_D + spread of its bag
 *   - puffAt is null before birth and after DUST_LIFE; inside it opacity is in 0..DUST_ALPHA and the radius grows
 *   - dustEnd is the last puff's death; everything is deterministic (same event + time = same output)
 *   - part 5: onDirt matches the fieldTex spots; a grounder or a hit landing on dirt gives BALL_PUFFS puffs at its landing, born when the
 *     ball lands; a ball caught in the air, a home run or a landing on grass gives none; all of an event's puffs fit the 32 sprites
 * static.mjs runs this file. Usage: node tests/dust.check.mjs */
import { simGame, BASES, SLIDE_D as ENGINE_SLIDE_D, ARRIVE } from '../engine/index.js';
import { slideDust, puffAt, dustEnd, SLIDE_D, DUST_PUFFS, DUST_LIFE, DUST_ALPHA, DUST_SPREAD, ballDust, footDust, FOOT_PUFFS, FOOT_SPREAD, eventDust, onDirt, BALL_ARRIVE, BALL_PUFFS, BALL_SPREAD } from '../render/dust.js';

const problems = [], bad = m => { if (problems.length < 30) problems.push(m); };
if (BALL_ARRIVE !== ARRIVE) bad(`BALL_ARRIVE ${BALL_ARRIVE} != engine ARRIVE ${ARRIVE}`);
/* spots from game.js fieldTex: [x, z, dirt?] */
for (const [x, z, want] of [[0, -18.4, true], [0, 0, true], [19.4, -19.4, true], [-10, -33, true], [12, -34, true], [0, -108, true], [40, -100, true],
  [0, -10, false], [0, -30, false], [8, -19, false], [0, -70, false], [-60, -10, false], [0, -112, false], [-90, -50, false]])
  if (onDirt(x, z) !== want) bad(`onDirt(${x}, ${z}) should be ${want}`);
let ballPuffs = 0, ballLand = 0;
if (SLIDE_D !== ENGINE_SLIDE_D) bad(`SLIDE_D ${SLIDE_D} != engine ${ENGINE_SLIDE_D}`);
/* the renderer (game.js DUST_BASES) uses these bag spots: home, 1B, 2B, 3B, home */
if (JSON.stringify(BASES) !== JSON.stringify([[0, 0], [19.4, -19.4], [0, -38.8], [-19.4, -19.4], [0, 0]])) bad('engine BASES differ from the renderer DUST_BASES: ' + JSON.stringify(BASES));
let slides = 0, events = 0, footPuffs = 0;
for (let seed = 1; seed <= 60; seed++) {
  const g = simGame(seed);
  for (const e of g.ev) {
    events++;
    const hasSlide = (e.moves || []).some(([, to, , tl]) => tl && tl.slide && to >= 1 && to <= 4 && tl.slideTime > 0);
    const puffs = slideDust(e, BASES), bd = ballDust(e), fd = footDust(e, BASES), all = eventDust(e, BASES);
    const plants = (e.moves || []).filter(([, to, , tl]) => tl && !tl.slide && to >= 1 && to <= 3 && tl.arriveT > 0).length;
    if (fd.length !== plants * FOOT_PUFFS) bad(`seed ${seed}: ${fd.length} foot puffs for ${plants} plants`);
    for (const q of fd) { const [bx, bz] = BASES[q.to]; if (!(Math.hypot(q.x - bx, q.z - bz) <= FOOT_SPREAD + 1e-9)) bad('foot puff far from its bag'); }
    footPuffs += fd.length;
    if (JSON.stringify(puffs) !== JSON.stringify(slideDust(e, BASES)) || JSON.stringify(bd) !== JSON.stringify(ballDust(e))) bad('not deterministic');
    if (all.length !== puffs.length + bd.length + fd.length) bad('eventDust is not slides + ball + foot');
    if (all.length > 32) bad(`seed ${seed}: ${all.length} puffs > the renderer's 32 sprites`);
    const p = e.r === 'inplay' && e.play, ground = p && p.res !== 'HR' && (p.type === 'GB' || (e.plan && e.plan.hit));
    if (bd.length) {
      if (!ground) bad(`seed ${seed}: ball dust on a ${p && p.type} ${p && p.res} that never touched the ground`);
      if (!onDirt(p.lx, p.lz)) bad(`seed ${seed}: ball dust on grass`);
      if (bd.length !== BALL_PUFFS) bad(`seed ${seed}: ${bd.length} ball puffs`);
      for (const q of bd) {
        if (!(Math.hypot(q.x - p.lx, q.z - p.lz) <= BALL_SPREAD + 1e-9)) bad('ball puff far from the landing');
        if (!(q.t0 >= ARRIVE + p.hang - 1e-9 && q.t0 < ARRIVE + p.hang + .5)) bad('ball puff not born at the landing');
        if (!(dustEnd(e, BASES) >= q.t0 + DUST_LIFE - 1e-9)) bad('dustEnd misses a ball puff');
      }
      ballPuffs += bd.length; ballLand++;
    } else if (ground && p.hang > 0 && onDirt(p.lx, p.lz)) bad(`seed ${seed}: a ball on dirt with no dust`);
    if (!hasSlide) { if (puffs.length) bad(`seed ${seed}: puffs without a slide`); if (!bd.length && !fd.length && dustEnd(e, BASES) !== 0) bad('dustEnd without dust'); continue; }
    const n = e.moves.filter(([, to, , tl]) => tl && tl.slide && to >= 1 && to <= 4 && tl.slideTime > 0).length;
    slides += n;
    if (puffs.length !== n * DUST_PUFFS) bad(`seed ${seed}: ${puffs.length} puffs for ${n} slides`);
    for (const p of puffs) {
      const [bx, bz] = BASES[p.to], d = Math.hypot(p.x - bx, p.z - bz);
      if (!(d <= SLIDE_D + DUST_SPREAD + 1e-6)) bad(`seed ${seed}: puff ${d.toFixed(2)} m from its bag`);
      if (puffAt(p, p.t0 - .01) !== null || puffAt(p, p.t0 + DUST_LIFE + .01) !== null) bad('puff alive outside its life');
      let prev = 0;
      for (let t = 0; t < 1; t += .05) {
        const s = puffAt(p, p.t0 + t * DUST_LIFE);
        if (!s) { bad('puff missing inside its life'); break; }
        if (!(s.a >= 0 && s.a <= DUST_ALPHA + 1e-9)) bad(`opacity ${s.a}`);
        if (s.r < prev - 1e-9) bad('radius shrank'); prev = s.r;
      }
    }
    const end = dustEnd(e, BASES);
    if (Math.abs(end - Math.max(...all.map(p => p.t0 + DUST_LIFE))) > 1e-9) bad('dustEnd is not the last death');
  }
}
if (!slides) bad('no slide in 60 seeds: the check saw nothing');
if (!footPuffs) bad('no foot plant in 60 seeds: the check saw nothing');
if (!ballLand) bad('no ball on dirt in 60 seeds: the check saw nothing');
console.log(`dust: ${slides} slides, ${ballLand} balls on dirt (${ballPuffs} puffs), ${footPuffs} foot-plant puffs, ${events} events`);
if (problems.length) { console.error('dust.check FAILED:\n' + problems.join('\n')); process.exit(1); }
console.log('dust.check OK');
