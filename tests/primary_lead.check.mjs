/* Runner leads (#23 part 1, plain Node), on the engine's real streams (seeds 1..300):
 *   - leadAt starts and ends a pitch frame at LEAD_PRIMARY, so a runner standing through consecutive pitches never jumps;
 *   - a runner who tags up on a caught fly leaves from the bag (timeline lead LEAD_STAND, tagLeadAt reaches it by st0);
 *   - every other base runner starts from leadAt(st0) and a stealing runner leaves with at least the primary lead;
 *   - the catcher's hold on a steal (release after catch + CATCHER_POP) is under HOLD_MAX s on safe and out steals
 *     (600 games: median 1.94 / 1.30 s before this part, 1.62 / 0.98 s after part 1, 0.17 / 0.10 s after part 2).
 * static.mjs runs this file. Usage: node tests/lead.check.mjs */
import { simGame, leadAt, tagLeadAt, LEAD_PRIMARY, LEAD_STAND, PITCH_DUR, ARRIVE, CATCH_SNAP, CATCHER_POP } from '../engine/index.js';

const HOLD_MAX = 0.3;            /* longest hold: 2.24 s before #23, 1.92 s after part 1; part 2 (jump fitted to the draw) */
const problems = [], bad = m => { if (problems.length < 30) problems.push(m); };
const near = (a, b) => Math.abs(a - b) < 1e-9;
if (!near(leadAt(0), LEAD_PRIMARY)) bad(`leadAt(0) = ${leadAt(0)}, wanted LEAD_PRIMARY ${LEAD_PRIMARY}`);
for (const d of new Set(Object.values(PITCH_DUR))) if (!near(leadAt(d), LEAD_PRIMARY)) bad(`leadAt(${d}) = ${leadAt(d)} at a pitch frame's end`);
let tags = 0, moves = 0, steals = 0, maxHold = 0;
for (let seed = 1; seed <= 300; seed++) for (const e of simGame(seed).ev) {
  if (e.k !== 'P') continue;
  for (const [from, , name, tl] of e.moves || []) {
    if (from === 0) continue;
    moves++;
    if (tl.tag) {
      tags++;
      if (tl.lead !== LEAD_STAND) bad(`seed ${seed} t ${e.t}: ${name} tags up from ${tl.lead} m, not the bag`);
      if (!near(tagLeadAt(tl.st0, tl.st0), LEAD_STAND)) bad(`seed ${seed} t ${e.t}: ${name} is not back on the bag at the tag-up`);
    } else if (!near(tl.lead, leadAt(tl.st0))) bad(`seed ${seed} t ${e.t}: ${name} starts from ${tl.lead} m, leadAt says ${leadAt(tl.st0)}`);
  }
  if (e.plan && e.plan.steal) {
    steals++;
    const hold = e.plan.t0 - (ARRIVE + CATCH_SNAP + CATCHER_POP);
    maxHold = Math.max(maxHold, hold);
    if (hold > HOLD_MAX) bad(`seed ${seed} t ${e.t}: catcher holds the ball ${hold.toFixed(2)} s on a steal`);
    const m = (e.moves || []).find(x => x[0] > 0 && x[3].st0 < ARRIVE);
    if (m && !(m[3].lead >= LEAD_PRIMARY - 1e-9)) bad(`seed ${seed} t ${e.t}: stealing runner leaves with ${m[3].lead} m`);
  }
}
if (!tags || !steals) bad(`sample has ${tags} tag-ups and ${steals} steals`);
if (problems.length) { console.error('lead.check FAILED\n' + problems.join('\n')); process.exit(1); }
console.log(`lead.check OK (${moves} runner moves, ${tags} tag-ups, ${steals} steals, longest catcher hold ${maxHold.toFixed(2)} s)`);
