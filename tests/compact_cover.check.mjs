/* Covered half-inning cut (#144, plain Node). render/compact.js on made-up events and on the frozen game's half-inning breaks:
 *   - a half event with jogEnd gets one cut {cover:true} from CP_COVER_SHOW to jogEnd - CP_COVER_LAND; the stretch after the jog still keeps CP_HALF_GAP
 *   - a booth line playing at the start moves the cut's start to its end; a line later in the span ends the cut before it (never clipped)
 *   - too short a span: no cut; no jogEnd: no covered cut; deterministic
 *   - dipAlpha is 0 away from a covered cut, rises to 1 at `at`, is 1 at `to` and falls back to 0 after CP_DIP; plain cuts never dip
 * static.mjs runs this file. Usage: node tests/compact_cover.check.mjs */
import { compactCuts, compactClock, dipAlpha, CP_COVER_SHOW, CP_COVER_LAND, CP_COVER_MIN, CP_DIP, CP_HALF_GAP } from '../render/compact.js';

const problems = [], bad = m => { if (problems.length < 30) problems.push(m); };
const near = (a, b) => Math.abs(a - b) < 1e-9;
const ev = (jogEnd = 28) => [
  { t: 0, d: 5, head: 0, tail: 2, kind: 'pitch' },
  { t: 5, d: 40, head: 1, tail: jogEnd + 1, kind: 'half', jogEnd },
  { t: 45, d: 5, head: 0, tail: 2, kind: 'pitch' },
];
const cov = cuts => cuts.filter(c => c.cover);

let c = compactCuts(ev());
if (cov(c).length !== 1) bad(`expected one covered cut, got ${cov(c).length}`);
else {
  const k = cov(c)[0];
  if (!near(k.at, 5 + CP_COVER_SHOW) || !near(k.to, 5 + 28 - CP_COVER_LAND)) bad(`cover cut ${k.at}..${k.to}`);
}
const plain = c.filter(x => !x.cover);
if (!plain.some(x => x.at >= 5 + 29 + CP_HALF_GAP - 1e-9)) bad('the still stretch after the jog lost its CP_HALF_GAP cut');
if (c.some((x, i) => i && x.at < c[i - 1].to)) bad('cuts overlap');
if (JSON.stringify(c) !== JSON.stringify(compactCuts(ev()))) bad('not deterministic');
if (cov(compactCuts([{ ...ev()[1], jogEnd: 0 }])).length) bad('cover without jogEnd');
if (cov(compactCuts(ev(CP_COVER_SHOW + CP_COVER_LAND + CP_COVER_MIN - 1))).length) bad('cover on a too short jog');

/* lines: playing at the start -> wait; due inside the span -> end before it */
const k1 = cov(compactCuts(ev(), [{ time: 6, end: 12 }]))[0];
if (!k1 || !near(k1.at, 12 + 0.3)) bad(`line at the start: cut starts ${k1 && k1.at}, wanted 12.3`);
const k2 = cov(compactCuts(ev(), [{ time: 20, end: 24 }]))[0];
if (!k2 || !near(k2.to, 20 - 0.5) || !near(k2.at, 8)) bad(`line inside: cut ${k2 && k2.at}..${k2 && k2.to}`);
if (cov(compactCuts(ev(), [{ time: 9, end: 30 }])).length) bad('a line over the whole jog still got a cut');
for (const [at, to] of [[k1 && k1.at, k1 && k1.to], [k2 && k2.at, k2 && k2.to]]) if (!(to - at >= CP_COVER_MIN)) bad('cover shorter than CP_COVER_MIN');

/* the clock and the dip */
const clock = compactClock(c, 60);
if (!clock.cuts.some(x => x.cover)) bad('clock lost the cover flag');
const k = cov(c)[0];
if (dipAlpha(c, k.at - CP_DIP - 0.01) !== 0 || dipAlpha(c, k.to + CP_DIP) !== 0) bad('dip outside the fade');
if (!near(dipAlpha(c, k.at - CP_DIP / 2), 0.5) || !near(dipAlpha(c, k.to + CP_DIP / 2), 0.5)) bad('dip ramp not linear');
if (dipAlpha(c, k.to) !== 1) bad('dip not 1 at the cut end');
if (dipAlpha(c, (k.at + k.to) / 2) !== 0) bad('dip inside the cut (a seek played in real time) not 0');
if (dipAlpha(plain, 20) !== 0 || dipAlpha([], 3) !== 0) bad('plain cuts dip');
if (clock.dip(k.at - CP_DIP / 2) !== dipAlpha(clock.cuts, k.at - CP_DIP / 2)) bad('clock.dip differs from dipAlpha');
const t0 = clock.toView(k.at - CP_DIP), t1 = clock.step(k.at - 0.01, k.at + 0.01);
if (!(t1 >= k.to)) bad('clock.step did not go on from the end of the cover cut');
if (!near(clock.removed, c.reduce((a, x) => a + x.to - x.at, 0))) bad('removed time != sum of cuts');

if (problems.length) { console.error('compact_cover.check FAIL\n' + problems.join('\n')); process.exit(1); }
console.log(`compact_cover.check OK (cover ${k.to - k.at}s of a ${ev()[1].d}s half-inning change, dip ${CP_DIP}s each side)`);
