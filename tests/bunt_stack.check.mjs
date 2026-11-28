/* #826: a bunt never puts two runners on one base.
 * Seed 58126 (pairing 1 of run.mjs's 12) had a balk that left runners on second and third in the 10th, then a bunt: the runner on
 * second used to go to third beside the runner already there. Engine 0.4.39 (#794 part 5) moved that game; seed 65523 (its own
 * run.mjs pairing, found by sweeping 50001..70000 x 12 pairings) now holds a sac bunt with second and third taken. Fails when (a) any plate appearance starts with two runners on a
 * base in SWEEP seeds from 58100, or (b) the pinned seed no longer holds a sac bunt with second and third taken (re-pin it then). */
import { simGame, TEAMS } from '../engine/index.js';

const PAIRINGS = TEAMS.flatMap((_, a) => TEAMS.map((_, h) => [a, h])).filter(([a, h]) => a !== h);
const FIRST = 50001, PINNED = 65523, SWEEP = 400;
let bad = 0, pinned = false;

function replay(seed, pairing) {
  const S = simGame(seed, {}, { teams: pairing }).stream;
  let on = new Map(), fresh = true, held = false, stacked = false;
  const has = base => [...on.values()].includes(base);
  for (let i = 0; i < S.length; i++) {
    const x = S[i];
    if (x.type === 'half_start') { on = new Map(); fresh = true; }
    else if ((x.type === 'pitch' || x.type === 'intentional_walk') && fresh) {
      const b = [...on.values()];
      if (new Set(b).size !== b.length) { console.error(`seed ${seed}: two runners share a base when the plate appearance at stream ${i} starts`); bad++; break; }
      held = has(2) && has(3); fresh = false;
    }
    else if (x.type === 'out') on.delete(x.runner);
    else if (x.type === 'runner_placed') on.set(x.runner, x.base);
    else if (x.type === 'substitution' && x.role === 'pinch_runner') { if (on.has(x.out)) { on.set(x.in, on.get(x.out)); on.delete(x.out); } }
    else if (x.type === 'runner_advance') { if (x.to >= 4) on.delete(x.runner); else on.set(x.runner, x.to); }
    else if (x.type === 'pa_end') { stacked = stacked || (x.result === 'sac_bunt' && held); fresh = true; }
  }
  return stacked;
}

for (let seed = PINNED - 26; seed < PINNED - 26 + SWEEP; seed++) {
  const stacked = replay(seed, PAIRINGS[(seed - FIRST) % PAIRINGS.length]);
  if (seed === PINNED) pinned = stacked;
}
if (!pinned) { console.error(`seed ${PINNED}: no sac bunt with second and third taken any more (the pin moved)`); bad++; }
if (bad) { console.error(`bunt_stack check FAILED: ${bad} problem(s)`); process.exit(1); }
console.log(`bunt_stack check ok: ${SWEEP} games from seed ${PINNED - 26}, no shared base; seed ${PINNED} still has the bunt with second and third taken`);
