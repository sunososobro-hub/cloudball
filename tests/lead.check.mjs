/* Runner lead stance (#268, plain Node). render/lead.js and the engine's leadAt / runnerTimeline are run, not read:
 *   - the stance is off on the bag and full from LEAD_POSE_D out; since #23 part 1 a held runner is at the primary lead through
 *     the whole pitch frame, so it stays on; a tag-up runner going back to the bag stands up without a snap
 *   - the shuffle: legs spread inside [stance, stance + step], close back to the stance at every step, >= 3 steps to LEAD_PITCH
 *   - he faces the pitcher: from each base his facing is across the base path (a side shuffle), not along it
 *   - no snap: stance weight, leg spread and yaw change by small amounts between 5 ms frames over a whole pitch frame
 *   - on the break the stance fades over LEAD_TURN, and the run starts from the lead spot (runnerTimeline lead = leadAt(st0))
 * static.mjs runs this file. Usage: node tests/lead.check.mjs */
import { LEAD_POSE_D, LEAD_STEP, LEAD_SPLAY, LEAD_STEP_SPLAY, LEAD_TURN,
  leadW, leadSplay, leadYaw, breakW, yawMix } from '../render/lead.js';
import { leadAt, tagLeadAt, runnerTimeline, BASES, FIELD_HOME } from '../engine/rules/field.js';
import { LEAD_PITCH } from '../engine/constants.js';

const problems = [], bad = m => { if (problems.length < 30) problems.push(m); };
const DT = .005, END = 6;

if (leadW(0) !== 0) bad(`stance on while standing on the bag: ${leadW(0)}`);
if (leadW(LEAD_POSE_D) !== 1) bad(`stance not full at LEAD_POSE_D: ${leadW(LEAD_POSE_D)}`);
if (leadW(leadAt(0)) !== 1) bad(`stance not on at the start of the set (primary lead ${leadAt(0)} m)`);
let prevW = leadW(leadAt(0)), prevS = leadSplay(leadAt(0), prevW), maxDW = 0, maxDS = 0;
for (let u = DT; u <= END; u += DT) {
  const ld = leadAt(u), w = leadW(ld), sp = leadSplay(ld, w);
  if (ld >= LEAD_POSE_D && w < 1 - 1e-9) bad(`u ${u.toFixed(3)}: ${ld.toFixed(2)} m off the bag but stance only ${w.toFixed(3)}`);
  if (!(sp >= 0 && sp <= LEAD_SPLAY + LEAD_STEP_SPLAY + 1e-12)) bad(`u ${u.toFixed(3)}: spread ${sp}`);
  maxDW = Math.max(maxDW, Math.abs(w - prevW)); maxDS = Math.max(maxDS, Math.abs(sp - prevS)); prevW = w; prevS = sp;
}
for (const tagUpAt of [5.5, 6.8]) {   /* tag-up (real ones start 5.5 to 6.8 s into the frame): back to the bag, he stands up as he gets there */
  let pw = leadW(tagLeadAt(0, tagUpAt));
  for (let u = DT; u <= tagUpAt; u += DT) { const w = leadW(tagLeadAt(u, tagUpAt)); maxDW = Math.max(maxDW, Math.abs(w - pw)); pw = w; }
  if (pw !== 0) bad(`tag-up at ${tagUpAt}: stance ${pw} on the bag`);
}
if (maxDW > .05) bad(`stance weight snaps: ${maxDW.toFixed(3)} in ${DT} s`);
if (maxDS > .03) bad(`leg spread snaps: ${maxDS.toFixed(3)} rad in ${DT} s`);
for (let k = 0; k * LEAD_STEP <= LEAD_PITCH; k++) if (Math.abs(leadSplay(k * LEAD_STEP, 1) - LEAD_SPLAY) > 1e-9) bad(`step ${k}: feet not back to the stance`);
if (Math.abs(leadSplay(LEAD_STEP / 2, 1) - (LEAD_SPLAY + LEAD_STEP_SPLAY)) > 1e-9) bad('mid-step spread must be the widest');
const steps = LEAD_PITCH / LEAD_STEP;
if (steps < 3) bad(`only ${steps.toFixed(1)} shuffle steps to the full lead`);

const P = FIELD_HOME.P;
for (let i = 0; i < 3; i++) {
  const [x, z] = BASES[i + 1], [nx, nz] = BASES[i + 2], L = Math.hypot(nx - x, nz - z), y = leadYaw(x, z, P[0], P[1]);
  const c = Math.sin(y) * (nx - x) / L + Math.cos(y) * (nz - z) / L;     /* facing . base path */
  if (Math.abs(c) > .75) bad(`base ${i + 1}: facing the pitcher runs along the path (cos ${c.toFixed(2)}): no side shuffle`);
  const toP = [P[0] - x, P[1] - z], f = (Math.sin(y) * toP[0] + Math.cos(y) * toP[1]) / Math.hypot(...toP);
  if (f < .999) bad(`base ${i + 1}: not facing the pitcher (${f.toFixed(3)})`);
}

for (const kind of ['steal', 'inplay', 'walk']) for (let from = 1; from <= 3; from++) {
  const tl = runnerTimeline(from, from + 1, { kind });
  if (Math.abs(tl.lead - leadAt(tl.st0)) > 1e-12) bad(`${kind} from ${from}: run starts ${tl.lead} m out, lead was ${leadAt(tl.st0)}`);
  if (breakW(tl.st0, tl.st0) !== 1 || breakW(tl.st0 + LEAD_TURN, tl.st0) !== 0) bad(`${kind}: break fade not over [st0, st0 + LEAD_TURN]`);
  let pb = 1;
  for (let u = tl.st0; u <= tl.st0 + LEAD_TURN + DT; u += DT) { const b = breakW(u, tl.st0); if (b > pb + 1e-12 || pb - b > .05) bad(`${kind}: break fade jumps at ${u.toFixed(3)}`); pb = b; }
}
if (breakW(5, Infinity) !== 1) bad('a runner who stays keeps the stance');
if (Math.abs(yawMix(3, -3, .5) - Math.PI) > .3) bad(`yawMix goes the long way: ${yawMix(3, -3, .5)}`);
if (yawMix(1, 2, 0) !== 1 || Math.abs(yawMix(1, 2, 1) - 2) > 1e-12) bad('yawMix ends');

if (problems.length) { console.log('LEAD CHECK FAILED\n' + problems.join('\n')); process.exit(1); }
console.log(`lead check ok: stance on while off the bag, ${steps.toFixed(1)} shuffle steps, faces the pitcher, no snap, run starts from the lead`);
