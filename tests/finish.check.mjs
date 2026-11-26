/* Video finish (#209 item 3, plain Node). render/finish.js is run, not read:
 *   - rollOff leaves everything at or below the knee unchanged, rises with the input above it, stays below the ceiling, has slope near 1 at the knee
 *   - every park sky has a grain amplitude in 0..FINISH_GRAIN_MAX, an unknown sky falls back to the neutral amplitude
 *   - finishParams: off or max-less = grain 0 (pass-through); the seed is a pure function of the event time (same u = same seed, steps at FINISH_FPS, bounded)
 *   - bad input (NaN, negative) never throws and never makes NaN
 * static.mjs runs this file. Usage: node tests/finish.check.mjs */
import { rollOff, grainOf, finishParams, FINISH_KNEE, FINISH_CEIL, FINISH_FPS, FINISH_GRAIN, FINISH_GRAIN_MAX, FINISH_GRAIN_NEUTRAL, FINISH_SEED_MOD } from '../render/finish.js';
const problems = [], bad = m => problems.push(m);
for (const x of [0, .1, .5, 1, FINISH_KNEE]) if (rollOff(x) !== x) bad(`below the knee must be unchanged: ${x} -> ${rollOff(x)}`);
let prev = -1;
for (const x of [FINISH_KNEE + .01, 1.5, 2, 3, 5, 10]) { const y = rollOff(x); if (!(y > prev)) bad(`roll-off must rise: ${x}`); if (!(y < FINISH_CEIL)) bad(`roll-off must stay under the ceiling: ${x} -> ${y}`); if (y > x) bad(`roll-off must not brighten: ${x} -> ${y}`); prev = y; }
{ const e = 1e-4, s = (rollOff(FINISH_KNEE + e) - FINISH_KNEE) / e; if (Math.abs(s - 1) > .01) bad(`slope at the knee should be 1, got ${s}`); }
for (const v of [NaN, undefined, Infinity, -3]) { const y = rollOff(v); if (!Number.isFinite(y) && v !== Infinity) bad(`bad input ${v} gave ${y}`); }
for (const x of [100, 1e6, Infinity]) if (!(rollOff(x) <= FINISH_CEIL + 1e-9)) bad(`huge input ${x} must not pass the ceiling`);
if (!(rollOff(Infinity) <= FINISH_CEIL + 1e-9)) bad('infinite input must not exceed the ceiling');
for (const sky of Object.keys(FINISH_GRAIN)) { const g = grainOf(sky); if (!(g > 0 && g <= FINISH_GRAIN_MAX)) bad(`grain out of range for ${sky}: ${g}`); }
if (grainOf('nope') !== FINISH_GRAIN_NEUTRAL || grainOf(undefined) !== FINISH_GRAIN_NEUTRAL) bad('unknown sky must use the neutral grain');
if (new Set(['night', 'dusk', 'afternoon', 'morning'].map(grainOf)).size < 3) bad('parks should not all share one grain');
if (!(grainOf('night') > grainOf('afternoon'))) bad('lamp night should be grainier than clean afternoon');
{ const off = finishParams('night', 3, false); if (off.grain !== 0 || off.knee < FINISH_CEIL) bad('off must be a pass-through'); }
{ const a = finishParams('dusk', 12.34), b = finishParams('dusk', 12.34); if (JSON.stringify(a) !== JSON.stringify(b)) bad('not deterministic');
  if (finishParams('dusk', 1 / FINISH_FPS - 1e-6).seed !== 0 || finishParams('dusk', 1 / FINISH_FPS + 1e-6).seed !== 1) bad('seed must step at FINISH_FPS');
  for (const u of [0, 1, 7.7, 1e5, 1e9]) { const s = finishParams('dusk', u).seed; if (!(s >= 0 && s < FINISH_SEED_MOD)) bad(`seed out of range at ${u}: ${s}`); }
  for (const u of [NaN, -5, undefined]) { const p = finishParams('dusk', u); if (p.seed !== 0 || !Number.isFinite(p.grain)) bad(`bad time ${u} must give seed 0`); } }
console.log(`finish: knee ${FINISH_KNEE} ceil ${FINISH_CEIL} grain ${JSON.stringify(FINISH_GRAIN)}`);
if (problems.length) { console.error('finish.check FAILED:\n' + problems.join('\n')); process.exit(1); }
console.log('finish.check OK');
