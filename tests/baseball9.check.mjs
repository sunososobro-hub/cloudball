/* 九宮格棒球 practice (#332 part 1): both practice modes run PRACTICE_PITCHES pitches, then return {side, mode, hits, pitches, tier};
 * tier is 'full' at FULL_AT successes, else 'half'. Seeded rng, so the run is repeatable. Usage: node tests/baseball9.check.mjs */
import { createPractice, PRACTICE_PITCHES, FULL_AT, PT, guessSet, MODE } from '../ui/baseball9/practice.js';
const problems = [], bad = m => problems.push(m);
const seeded = s => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
const KEYS = ['side', 'mode', 'hits', 'pitches', 'tier'];
const shape = (r, side, tag) => {
  if (JSON.stringify(Object.keys(r)) !== JSON.stringify(KEYS)) bad(`${tag}: result keys ${Object.keys(r)}`);
  if (r.side !== side || r.pitches !== PRACTICE_PITCHES || !(r.hits >= 0 && r.hits <= r.pitches)) bad(`${tag}: bad result ${JSON.stringify(r)}`);
  if (r.tier !== (r.hits >= FULL_AT ? 'full' : 'half')) bad(`${tag}: tier ${r.tier} for ${r.hits}`);
};
const tiers = new Set();
for (let seed = 1; seed <= 60; seed++) {
  const bat = createPractice('bat', { rnd: seeded(seed) }), modes = Object.keys(MODE);
  let last = null, n = 0;
  while (!(last && last.done)) { last = bat.swing({ mode: modes[n % modes.length], r: 1 + n % 3, c: 1 + (n >> 1) % 3 }); n++; if (n > 50) { bad('bat never finished'); break; } }
  shape(last.result, 'bat', `bat seed ${seed}`); tiers.add(last.result.tier);
  const pit = createPractice('pitch', { rnd: seeded(seed + 1000), batterType: 'pull' }), kinds = Object.keys(PT);
  last = null; n = 0;
  while (!(last && last.done)) { last = pit.pitch({ pt: kinds[n % 2 ? 0 : 3], r: 1 + n % 3, c: 1 + (n >> 1) % 3 }); n++; if (n > 50) { bad('pitch never finished'); break; } }
  shape(last.result, 'pitch', `pitch seed ${seed}`); tiers.add(last.result.tier);
  try { bat.swing({ mode: 'one', r: 2, c: 2 }); bad('swing after the end was accepted'); } catch { /* expected */ }
}
if (!tiers.has('full') || !tiers.has('half')) bad('60 seeds never reached both tiers: ' + [...tiers]);
if (guessSet('box', 3, 3).length !== 4 || guessSet('row', 2, 2).length !== 3 || guessSet('one', 1, 1).length !== 1 || guessSet('take', 1, 1).length) bad('guessSet sizes');
if (problems.length) { console.error('baseball9.check FAIL\n- ' + problems.join('\n- ')); process.exit(1); }
console.log('baseball9.check ok (60 seeds, both sides, tiers', [...tiers].join('/') + ')');
