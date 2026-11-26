/* Play-at-the-plate camera weight (#209 item 1, plain Node). render/platecam.js on simulated games:
 *   - weight 0 on every event that is not a fair ball with a tag play at home; always inside 0..1; deterministic
 *   - on every tag play at home the weight reaches 1 around the arrival and is back to 0 PLATE_OUT_AFTER s after it
 *   - the weight never depends on a later event (it reads the one event it is given)
 * static.mjs runs this file. Usage: node tests/platecam.check.mjs */
import { simGame } from '../engine/index.js';
import { plateW, PLATE_IN_BEFORE, PLATE_OUT_AFTER, PLATE_EASE } from '../render/platecam.js';

const problems = [], bad = m => { if (problems.length < 30) problems.push(m); };
const CONTACT = .8;
let plays = 0, others = 0;
for (let seed = 1; seed <= 60; seed++) {
  const g = simGame(seed);
  for (const e of g.ev) {
    const S = e.plan, tag = e.k === 'P' && e.r === 'inplay' && S && S.CV && S.CV.base === 4 && S.tagPlay;
    if (!tag) { others++; for (const u of [0, 2, 5, 9]) if (plateW(e, u, CONTACT) !== 0) bad(`seed ${seed}: weight on a non-plate event ${e.k}/${e.r} at ${u}`); continue; }
    plays++;
    const at = S.arrive + CONTACT;
    if (plateW(e, at, CONTACT) < .999) bad(`seed ${seed}: weight at the arrival is ${plateW(e, at, CONTACT)}`);
    if (plateW(e, at - PLATE_IN_BEFORE - .01, CONTACT) !== 0) bad(`seed ${seed}: weight before the lead-in`);
    if (plateW(e, at + PLATE_OUT_AFTER + .01, CONTACT) !== 0) bad(`seed ${seed}: weight after the tail`);
    for (let u = 0; u < at + 6; u += .05) { const w = plateW(e, u, CONTACT); if (!(w >= 0 && w <= 1)) bad(`seed ${seed}: weight ${w} out of range`); if (w !== plateW(e, u, CONTACT)) bad('not deterministic'); }
  }
}
if (!plays) bad('no tag play at home in 60 seeds: the check saw nothing');
console.log(`platecam: ${plays} plate plays, ${others} other events, ease ${PLATE_EASE} s`);
if (problems.length) { console.error('platecam.check FAILED:\n' + problems.join('\n')); process.exit(1); }
console.log('platecam.check OK');
