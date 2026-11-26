/* Ground wear (#209 item 2, part 2a, plain Node). render/wear.js is run, not read:
 *   - no pitches = no dabs; full wear = WEAR_MAX per kind; more pitches never fewer dabs of any kind
 *   - wearDabs(n) is a prefix of wearDabs(n + k) per kind (a seek to n equals playing to n), and the same call twice is identical
 *   - every dab sits near its spot (inside the spread radius), radius and alpha in range, all numbers finite
 * static.mjs runs this file. Usage: node tests/wear.check.mjs */
import { simGame } from '../engine/index.js';
import { slideDrags, dragsBefore, WEAR_DRAG_MAX, WEAR_SLIDE_D, pitchPrefix, wearDabs, wearCount, WEAR_FULL_N, WEAR_MAX, WEAR_SPOTS, WEAR_ALPHA, WEAR_KINDS } from '../render/wear.js';

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
/* pitchPrefix on real simulated games: starts at 0, never decreases, +1 only after a real pitch, ends at the game's pitch count, the same wear for the same index */
for (const seed of [1, 2, 3]) {
  const g = simGame(seed, {}), pre = pitchPrefix(g.ev), real = e => e.k === 'P' && e.r !== 'ibb' && e.r !== 'bk';
  if (pre.length !== g.ev.length || pre[0] !== 0) bad(`seed ${seed}: prefix shape`);
  for (let i = 1; i < pre.length; i++) if (pre[i] !== pre[i - 1] + (real(g.ev[i - 1]) ? 1 : 0)) { bad(`seed ${seed}: prefix step at ${i}`); break; }
  const total = g.ev.filter(real).length;
  if (total < 100) bad(`seed ${seed}: only ${total} pitches`);
  if (JSON.stringify(wearDabs(pre[pre.length >> 1])) !== JSON.stringify(wearDabs(pitchPrefix(simGame(seed, {}).ev)[pre.length >> 1]))) bad(`seed ${seed}: wear differs for the same event`);
  if (wearDabs(pre[pre.length - 1]).length < wearDabs(pre[pre.length >> 1]).length) bad(`seed ${seed}: wear shrank later in the game`);
}
/* #209 part 8: slide drag marks. Real games: found per event, only before the event, prefix growth, hand-made slide line ends at the bag */
const BASES = [[0, 0], [19.4, -19.4], [0, -38.8], [-19.4, -19.4], [0, 0]];
let slides = 0;
for (let seed = 1; seed <= 40; seed++) {
  const g = simGame(seed, {}), dr = slideDrags(g.ev, BASES);
  slides += dr.length;
  if (JSON.stringify(dr) !== JSON.stringify(slideDrags(g.ev, BASES))) bad(`seed ${seed}: drags not deterministic`);
  let last = 0;
  for (let i = 0; i <= g.ev.length; i += 5) {
    const k = dragsBefore(dr, i);
    if (k.some(d => d.i >= i)) bad(`seed ${seed}: drag from event ${i} or later shown at ${i}`);
    if (k.length > WEAR_DRAG_MAX) bad(`seed ${seed}: ${k.length} drags over the cap`);
    if (k.length < Math.min(last, WEAR_DRAG_MAX)) bad(`seed ${seed}: drags shrank at ${i}`);
    last = k.length;
  }
}
if (slides < 5) bad(`only ${slides} slides in 40 games: the check sees nothing`);
const fake = [{ k: 'P', moves: [[1, 2, 'A', { slide: true, slideTime: .5, ts: 1 }]] }, { k: 'P', moves: [[0, 1, 'B', { slide: false, slideTime: 0 }], [2, 2, 'C', null]] }];
const fd = slideDrags(fake, BASES);
if (fd.length !== 1 || fd[0].i !== 0) bad('hand-made: exactly one drag, from event 0');
else {
  const d = fd[0]; if (Math.hypot(d.x0 - d.x1, d.z0 - d.z1) < WEAR_SLIDE_D * .9 - 1) bad('hand-made: drag too short');
  if (Math.hypot(d.x1 - BASES[2][0], d.z1 - BASES[2][1]) > .5) bad('hand-made: drag does not end at the bag');
  if (dragsBefore(fd, 0).length !== 0 || dragsBefore(fd, 1).length !== 1) bad('hand-made: drag shown at the wrong event');
}
if (problems.length) { console.log('wear check FAILED\n' + problems.join('\n')); process.exit(1); }
console.log(`wear check ok (${full.length} dabs at full wear, ${slides} slide drags in 40 games)`);
