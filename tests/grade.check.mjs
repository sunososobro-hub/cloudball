/* Park colour moods (#208 item 5, plain Node). render/grade.js is run, not read:
 *   - grade() with the neutral mood, amt 0 or a (1,1,1) tint returns the colour unchanged; output stays 0..0xffffff
 *   - every park sky (night, dusk, afternoon, morning) has a mood inside the named ranges, and the four moods differ
 *   - a warm mood (dusk) raises red over blue on a grey; a cool mood (night, morning) raises blue over red
 *   - an unknown sky name falls back to the neutral mood; same input = same output
 * static.mjs runs this file. Usage: node tests/grade.check.mjs */
import { MOODS, MOOD_NEUTRAL, MOOD_AMT_MAX, MOOD_EXP_MIN, MOOD_EXP_MAX, MOOD_TINT_MIN, MOOD_TINT_MAX, grade, moodOf } from '../render/grade.js';

const problems = [], bad = m => { if (problems.length < 30) problems.push(m); };
const rgb = h => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const probes = [0xfff1dc, 0xd6e2ff, 0x9fb4e6, 0x808080, 0x000000, 0xffffff, 0x1c1a12];

for (const h of probes) {
  if (grade(h, MOOD_NEUTRAL) !== h) bad(`neutral mood changed ${h.toString(16)}`);
  if (grade(h, { tint: [1.3, .7, 1], amt: 0, exp: 1 }) !== h) bad(`amt 0 changed ${h.toString(16)}`);
  if (grade(h, { tint: [1, 1, 1], amt: .5, exp: 1 }) !== h) bad(`neutral tint changed ${h.toString(16)}`);
  if (grade(h) !== h) bad('missing mood must be neutral');
}
for (const sky of ['night', 'dusk', 'afternoon', 'morning']) {
  const m = MOODS[sky];
  if (!m) { bad(`no mood for ${sky}`); continue; }
  if (!(m.amt >= 0 && m.amt <= MOOD_AMT_MAX)) bad(`${sky}: amt ${m.amt}`);
  if (!(m.exp >= MOOD_EXP_MIN && m.exp <= MOOD_EXP_MAX)) bad(`${sky}: exp ${m.exp}`);
  if (m.tint.length !== 3 || m.tint.some(v => !(v >= MOOD_TINT_MIN && v <= MOOD_TINT_MAX))) bad(`${sky}: tint ${m.tint}`);
  for (const h of probes) { const g = grade(h, m); if (!(g >= 0 && g <= 0xffffff && Number.isInteger(g))) bad(`${sky}: out of range ${g}`); if (g !== grade(h, m)) bad(`${sky}: not deterministic`); }
  if (moodOf(sky) !== m) bad(`moodOf(${sky})`);
}
const sigs = new Set(Object.values(MOODS).map(m => JSON.stringify(m)));
if (sigs.size !== 4) bad('the four moods must differ');
const grey = 0x808080, d = rgb(grade(grey, MOODS.dusk)), n = rgb(grade(grey, MOODS.night)), mo = rgb(grade(grey, MOODS.morning));
if (!(d[0] > d[2])) bad(`dusk grey not warm: ${d}`);
if (!(n[2] > n[0])) bad(`night grey not cool: ${n}`);
if (!(mo[2] > mo[0])) bad(`morning grey not cool: ${mo}`);
if (moodOf('nope') !== MOOD_NEUTRAL) bad('unknown sky must be neutral');

if (problems.length) { console.log('GRADE CHECK FAILED\n' + problems.join('\n')); process.exit(1); }
console.log('grade check ok: 4 moods in range, neutral = identity, warm/cool as named');
