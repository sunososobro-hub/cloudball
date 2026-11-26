/* Video finish (#209 item 3, plain Node). render/film.js is run, not read:
 *   - rolloff: identity up to KNEE, continuous at the knee, strictly increasing, always below 1 past the knee, 0 for bad input
 *   - grainSeed: deterministic, steps FILM_FPS times a second, stays in the ring, bad input -> 0
 *   - every park film (and the neutral) is inside the allowed ranges; unknown sky name -> neutral
 * static.mjs runs this file. Usage: node tests/film.check.mjs */
import { rolloff, grainSeed, filmOf, FILMS, FILM_NEUTRAL, KNEE, FILM_FPS, FILM_SEEDS, FILM_GRAIN_MAX, FILM_SAT_MIN, FILM_SAT_MAX, FILM_TINT_MIN, FILM_TINT_MAX } from '../render/film.js';
const problems = [], bad = m => { if (problems.length < 30) problems.push(m); };
for (const x of [0, .1, .5, KNEE]) if (rolloff(x) !== x) bad(`rolloff(${x}) must be identity below the knee`);
if (Math.abs(rolloff(KNEE + 1e-9) - KNEE) > 1e-6) bad('rolloff not continuous at the knee');
let prev = rolloff(KNEE);
for (let x = KNEE + .05; x <= 6; x *= 1.15) { const y = rolloff(x); if (!(y > prev)) bad(`rolloff not increasing at ${x}`); if (!(y < 1)) bad(`rolloff(${x}) = ${y} reaches 1`); prev = y; }
for (const x of [NaN, -1, undefined, Infinity * 0, -Infinity]) if (rolloff(x) !== 0) bad(`rolloff(${x}) should be 0`);
if (rolloff(1e9) > 1) bad('rolloff above 1');
if (grainSeed(1.234) !== grainSeed(1.234)) bad('grainSeed not deterministic');
if (grainSeed(0) !== 0 || grainSeed(-3) !== 0 || grainSeed(NaN) !== 0) bad('grainSeed bad input');
if (grainSeed(1 / FILM_FPS + 1e-6) === grainSeed(0)) bad('grain must change every 1/FILM_FPS s');
if (grainSeed(.5 / FILM_FPS) !== 0) bad('grain must hold inside one frame');
for (let T = 0; T < 4000; T += 7.31) { const s = grainSeed(T); if (!(s >= 0 && s < FILM_SEEDS && Number.isInteger(s))) bad(`seed out of ring at ${T}`) }
for (const [k, f] of Object.entries({ ...FILMS, neutral: FILM_NEUTRAL })) {
  if (!(f.grain >= 0 && f.grain <= FILM_GRAIN_MAX)) bad(`${k}: grain ${f.grain}`);
  if (!(f.sat >= FILM_SAT_MIN && f.sat <= FILM_SAT_MAX)) bad(`${k}: sat ${f.sat}`);
  if (f.tint.length !== 3 || f.tint.some(v => !(v >= FILM_TINT_MIN && v <= FILM_TINT_MAX))) bad(`${k}: tint ${f.tint}`);
}
if (filmOf('nope') !== FILM_NEUTRAL || filmOf() !== FILM_NEUTRAL) bad('unknown sky should give neutral');
for (const k of ['night', 'dusk', 'afternoon', 'morning']) if (!FILMS[k]) bad(`missing film for ${k}`);
console.log(`film: knee ${KNEE}, ${FILM_FPS} grain fps, ${Object.keys(FILMS).length} park films`);
if (problems.length) { console.error('film.check FAILED:\n' + problems.join('\n')); process.exit(1); }
console.log('film.check OK');
