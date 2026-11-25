/* 九宮格棒球 practice (#332 part 1): both practice modes run PRACTICE_PITCHES pitches, then return {side, mode, hits, pitches, tier};
 * tier is 'full' at FULL_AT successes, else 'half'. Seeded rng, so the run is repeatable. Usage: node tests/baseball9.check.mjs */
import { createPractice, PRACTICE_PITCHES, FULL_AT, HIT_Q, PT, guessSet, MODE } from '../ui/baseball9/practice.js';
import { describeOutcome, describeResult } from '../ui/baseball9/text.js';
import { readFileSync } from 'node:fs';
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
/* part 2: the screen text covers every outcome the rules produce, and the page has every id screen.js reads */
{ const seen = new Set(), g = createPractice('bat', { rnd: seeded(7) }), p = createPractice('pitch', { rnd: seeded(8) });
  for (const k of ['bat', 'pitch']) for (let s = 1; s <= 40; s++) { const pr = createPractice(k, { rnd: seeded(s * 31) }); let last = { done: false }, n = 0;
    while (!last.done && n++ < 40) { last = k === 'bat' ? pr.swing({ mode: Object.keys(MODE)[n % 6], r: 1 + n % 3, c: 1 + n % 2 }) : pr.pitch({ pt: n % 2 ? 'fb' : 'change', r: n % 5, c: (n >> 1) % 5 });
      const t = describeOutcome(last.out, k, HIT_Q); seen.add(last.out.kind); if (!t || /undefined/.test(t) || t.includes(last.out.kind) && !['contact'].includes(last.out.kind) && /^[a-zA-Z]/.test(t.split('：').pop())) bad('no text for ' + last.out.kind); } }
  if (!/練習結束/.test(describeResult(g.result())) || !/完整|一半/.test(describeResult(p.result()))) bad('describeResult');
  const html = readFileSync(new URL('../baseball9.html', import.meta.url), 'utf8'), js = readFileSync(new URL('../ui/baseball9/screen.js', import.meta.url), 'utf8');
  for (const id of new Set([...js.matchAll(/\$\('([a-zA-Z]+)'\)/g)].map(m => m[1]))) if (!html.includes(`id="${id}"`)) bad('baseball9.html has no #' + id);
  if (/^import .*(three|engine\/)/m.test(js)) bad('screen.js must not import three.js or engine/'); }
/* part 3a: batted-ball physics (ball.js): deterministic per seed, every ball ends, a hard fly can leave the park, a weak grounder is fielded */
{ const B = await import('../ui/baseball9/ball.js'), kinds = {}, again = [];
  for (let s = 1; s <= 300; s++) { const q = [0.2, 0.6, 0.8, 1.0, 1.2][s % 5], r = batBallRun(B, s, q); kinds[r.kind] = (kinds[r.kind] || 0) + 1; if (s < 5) again.push(JSON.stringify(r) === JSON.stringify(batBallRun(B, s, q))); 
    if (!(r.fl.pts.length > 1 && r.fl.pts.length <= 30 * B.MAX_FLIGHT_S + 1)) bad('ball path length ' + r.fl.pts.length); if (r.fl.pts.some(p => !Number.isFinite(p.x + p.y + p.z + p.t))) bad('non-finite ball point'); }
  if (again.includes(false)) bad('batBall is not deterministic for the same seed');
  for (const k of ['HR', 'caught', 'ground']) if (!kinds[k]) bad('300 balls never gave ' + k + ': ' + JSON.stringify(kinds));
  const bunt = B.batBall(0.5, { bunt: true, rnd: seeded(3) }); if (bunt.kind === 'HR' || bunt.L.v > 8.5) bad('a bunt must stay in the infield');
  if (B.fenceR(0) !== 108 || B.POS_N.length !== 9 || B.FSPD.length !== 9 || B.FNAME.length !== 9) bad('field constants'); }
function batBallRun(B, s, q) { return B.batBall(q, { app: ['pull', 'mid', 'push'][s % 3], pow: s % 4, rnd: seeded(s * 17) }); }
if (problems.length) { console.error('baseball9.check FAIL\n- ' + problems.join('\n- ')); process.exit(1); }
console.log('baseball9.check ok (60 seeds, both sides, tiers', [...tiers].join('/') + ')');
