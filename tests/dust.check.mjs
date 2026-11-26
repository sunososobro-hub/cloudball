/* Slide dust (#208 item 4, plain Node). render/dust.js on simulated games:
 *   - an event with no slide gives no puffs; every slide gives DUST_PUFFS puffs with positions within SLIDE_D + spread of its bag
 *   - puffAt is null before birth and after DUST_LIFE; inside it opacity is in 0..DUST_ALPHA and the radius grows
 *   - dustEnd is the last puff's death; everything is deterministic (same event + time = same output)
 * static.mjs runs this file. Usage: node tests/dust.check.mjs */
import { simGame, BASES, SLIDE_D as ENGINE_SLIDE_D } from '../engine/index.js';
import { slideDust, puffAt, dustEnd, SLIDE_D, DUST_PUFFS, DUST_LIFE, DUST_ALPHA, DUST_SPREAD } from '../render/dust.js';

const problems = [], bad = m => { if (problems.length < 30) problems.push(m); };
if (SLIDE_D !== ENGINE_SLIDE_D) bad(`SLIDE_D ${SLIDE_D} != engine ${ENGINE_SLIDE_D}`);
/* the renderer (game.js DUST_BASES) uses these bag spots: home, 1B, 2B, 3B, home */
if (JSON.stringify(BASES) !== JSON.stringify([[0, 0], [19.4, -19.4], [0, -38.8], [-19.4, -19.4], [0, 0]])) bad('engine BASES differ from the renderer DUST_BASES: ' + JSON.stringify(BASES));
let slides = 0, events = 0;
for (let seed = 1; seed <= 60; seed++) {
  const g = simGame(seed);
  for (const e of g.ev) {
    events++;
    const hasSlide = (e.moves || []).some(([, to, , tl]) => tl && tl.slide && to >= 1 && to <= 4 && tl.slideTime > 0);
    const puffs = slideDust(e, BASES);
    if (JSON.stringify(puffs) !== JSON.stringify(slideDust(e, BASES))) bad('not deterministic');
    if (!hasSlide) { if (puffs.length) bad(`seed ${seed}: puffs without a slide`); if (dustEnd(e, BASES) !== 0) bad('dustEnd without a slide'); continue; }
    const n = e.moves.filter(([, to, , tl]) => tl && tl.slide && to >= 1 && to <= 4 && tl.slideTime > 0).length;
    slides += n;
    if (puffs.length > 32) bad(`seed ${seed}: ${puffs.length} puffs > the renderer's 32 sprites`);
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
    if (Math.abs(end - Math.max(...puffs.map(p => p.t0 + DUST_LIFE))) > 1e-9) bad('dustEnd is not the last death');
  }
}
if (!slides) bad('no slide in 60 seeds: the check saw nothing');
console.log(`dust: ${slides} slides, ${events} events`);
if (problems.length) { console.error('dust.check FAILED:\n' + problems.join('\n')); process.exit(1); }
console.log('dust.check OK');
