/* Video finish maths (#209 item 3, plain Node). render/finish.js:
 *   - roll() is the identity up to the knee, continuous and increasing above it, and never passes ROLL_MAX
 *   - the slope at the knee is 1 (no visible kink), bad input gives 0
 *   - grainFrame() is a pure function of game time: same time, same frame; steps at GRAIN_FPS; bad time gives 0
 *   - the constants are in sane ranges. static.mjs runs this file. Usage: node tests/finish.check.mjs */
import { roll, grainFrame, GRAIN_AMT, GRAIN_FPS, ROLL_KNEE, ROLL_MAX } from '../render/finish.js';
const problems = [], bad = m => problems.push(m);
for (const x of [0, .1, .5, ROLL_KNEE]) if (roll(x) !== x) bad(`roll(${x}) should be the identity`);
let prev = -1;
for (let x = 0; x <= 8; x += .05) { const y = roll(x); if (y < prev - 1e-12) bad(`roll not increasing at ${x}`); if (x > ROLL_KNEE && y <= prev) bad(`roll flat at ${x}`); if (y > ROLL_MAX + 1e-12) bad(`roll(${x}) above ROLL_MAX`); prev = y; }
if (Math.abs(roll(ROLL_KNEE + 1e-6) - ROLL_KNEE - 1e-6) > 1e-9) bad('slope at the knee is not 1');
if (roll(1000) < ROLL_MAX - 1e-6) bad('roll does not settle at ROLL_MAX');
if (roll(1.6) >= 1.6 || roll(1.6) <= ROLL_KNEE) bad('bloom-level highlight not bent');
for (const b of [NaN, Infinity, undefined]) if (roll(b) !== 0) bad(`roll(${b}) should be 0`);
for (const t of [NaN, undefined, -3, 0]) if (grainFrame(t) !== 0) bad(`grainFrame(${t}) should be 0`);
if (grainFrame(12.34) !== grainFrame(12.34)) bad('grainFrame not deterministic');
if (grainFrame(1) !== GRAIN_FPS) bad('one second is GRAIN_FPS frames');
if (grainFrame(.5 / GRAIN_FPS) !== 0 || grainFrame(1.5 / GRAIN_FPS) !== 1) bad('grain frame steps wrong');
if (!(GRAIN_AMT > 0 && GRAIN_AMT <= .08)) bad('GRAIN_AMT out of range');
if (!(GRAIN_FPS >= 12 && GRAIN_FPS <= 30)) bad('GRAIN_FPS out of range');
if (!(ROLL_KNEE > .5 && ROLL_KNEE < 1 && ROLL_MAX > ROLL_KNEE && ROLL_MAX <= 1.5)) bad('roll constants out of range');
console.log(`finish: grain ${GRAIN_AMT} at ${GRAIN_FPS}/s, knee ${ROLL_KNEE}, max ${ROLL_MAX}`);
if (problems.length) { console.error('finish.check FAILED:\n' + problems.join('\n')); process.exit(1); }
console.log('finish.check OK');
