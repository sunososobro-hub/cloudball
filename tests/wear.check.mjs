/* Ground wear (#209 item 2, part 2a, plain Node). render/wear.js is run, not read:
 *   - no pitches = no dabs; full wear = WEAR_MAX per kind; more pitches never fewer dabs of any kind
 *   - wearDabs(n) is a prefix of wearDabs(n + k) per kind (a seek to n equals playing to n), and the same call twice is identical
 *   - every dab sits near its spot (inside the spread radius), radius and alpha in range, all numbers finite
 * static.mjs runs this file. Usage: node tests/wear.check.mjs */
import { wearDabs, wearCount, WEAR_FULL_N, WEAR_MAX, WEAR_SPOTS, WEAR_ALPHA, WEAR_KINDS } from '../render/wear.js';

const problems = [], bad = m => { if (problems.length < 30) problems.push(m); };
const by = (a, k) => a.filter(d => d.kind === k);
if (wearDabs(0).length !== 0 || wearDabs(-5).length !== 0) bad('wear before the first pitch');
const full = wearDabs(WEAR_FULL_N);
for (const k of WEAR_KINDS) { if (by(full, k).length !== WEAR_MAX[k]) bad(`${k}: full wear ${by(full, k).length} != ${WEAR_MAX[k]}`); }
if (wearDabs(WEAR_FULL_N * 5).length !== full.length) bad('wear grows past full');
let prev = null;
for (let n = 0; n <= WEAR_FULL_N + 20; n += 7) {
  const a = wearDabs(n);
  if (JSON.stringify(a) !== JSON.stringify(wearDabs(n))) bad(`n ${n}: not deterministic`);
  for (const k of WEAR_KINDS) {
    const cur = by(a, k);
    if (cur.length !== wearCount(k, n)) bad(`n ${n} ${k}: count`);
    if (prev) { const p = by(prev, k); if (cur.length < p.length) bad(`n ${n} ${k}: fewer dabs`); else if (JSON.stringify(cur.slice(0, p.length)) !== JSON.stringify(p)) bad(`n ${n} ${k}: not a prefix`); }
  }
  prev = a;
}
for (const d of full) {
  if (![d.x, d.z, d.r, d.a].every(Number.isFinite)) { bad('non-finite dab'); break; }
  if (!(d.r >= .03 && d.r <= .12 + 1e-9) || !(d.a > 0 && d.a <= WEAR_ALPHA[d.kind] + 1e-9)) bad(`${d.kind}: r ${d.r} a ${d.a}`);
  if (!WEAR_SPOTS[d.kind].some(s => Math.hypot(d.x - s[0], d.z - s[1]) <= s[2] + 1e-9)) { bad(`${d.kind}: dab off its spot (${d.x}, ${d.z})`); break; }
}
if (problems.length) { console.log('wear check FAILED\n' + problems.join('\n')); process.exit(1); }
console.log(`wear check ok (${full.length} dabs at full wear)`);
