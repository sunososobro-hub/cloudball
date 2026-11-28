/* #822: the 3D view of the line-drive double / triple play (render/game.js). The engine plays it with nobody advancing (rule 10); the picture draws
 * the doubled-off runners from the plan. This runs the helper line of game.js (`ldOff`) on real engine plays (the pinned seeds of ldtp.check.mjs and every
 * line-drive double or triple play in the first GAMES seeds) and fails when
 *   - a runner of a triple play (both broke) is not at LEAD_PRIMARY until the pitch leaves the hand (RELEASE) and running out after it,
 *   - a runner's lead at the catch is not the engine's `off`, or the lead jumps (more than STEP_MAX m in STEP s),
 *   - he is not back on the bag (lead 0) at the engine's runnerAt (the out record's time), or is still drawn long after it,
 *   - the second throw of a triple play (plan.ldTp) does not leave the holder of the first bag at ldTp.t0 and is not received by ldTp.key at ldTp.arrive.
 * Usage: node tests/ldrun_render.check.mjs */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as K from '../engine/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(path.join(ROOT, 'render/game.js'), 'utf8').split('\n');
const grab = name => { const l = src.find(x => x.startsWith(`const ${name}=`)); if (!l) throw new Error(`game.js has no line "const ${name}="`); return l; };
const { ldOff } = new Function('leadAt', 'runDist', 'RELEASE', 'ARRIVE', 'BAT_RUN_DELAY', 'LEAD_PRIMARY', 'LEAD_PITCH', 'RUN_SPEED', 'LD_RETURN_TURN',
  `${grab('ldOff')}\nreturn{ldOff}`)(K.leadAt, K.runDist, K.RELEASE, K.ARRIVE, K.BAT_RUN_DELAY, K.LEAD_PRIMARY, K.LEAD_PITCH, K.RUN_SPEED, K.LD_RETURN_TURN);
const SEEDS = [5237, 3803, 2466, 4109], GAMES = 400, STEP = 0.01, STEP_MAX = 0.15, EPS = 1e-6;
const errs = [], bad = m => { if (errs.length < 20) errs.push(m); };
let dps = 0, tps = 0;
const look = s => {
  const g = K.simGame(s, {}, { teams: [s % 4, (s + 1) % 4] });
  g.ev.forEach((e, i) => {
    const P = e.plan;
    if (!P || !P.ldDp || e.r !== 'inplay') return;
    const both = !!P.ldTp;
    if (both) tps++; else dps++;
    for (const en of both ? [P.ldDp, P.ldTp] : [P.ldDp]) {
      const at = `seed ${s} event ${i} base ${en.base}`, o = e.outs.find(x => x.runner === en.runner);
      if (!o) { bad(`${at}: no out record for ${en.runner}`); continue; }
      if (Math.abs(o.runnerAt - (K.ARRIVE + en.runnerAt)) > 0.02) bad(`${at}: out runnerAt ${o.runnerAt}, plan ${K.ARRIVE + en.runnerAt}`);
      if (both) {   /* a triple play: both broke with the pitch */
        const a = ldOff(P, en, 0), b = ldOff(P, en, K.RELEASE - 1e-3), c = ldOff(P, en, K.RELEASE + 0.3);
        if (!a || a.d !== K.LEAD_PRIMARY || !b || b.d !== K.LEAD_PRIMARY) bad(`${at}: not at LEAD_PRIMARY before the pitch (${a && a.d}, ${b && b.d})`);
        if (!c || c.run !== 1 || c.d <= K.LEAD_PRIMARY) bad(`${at}: not running 0.3 s after the pitch leaves the hand`);
      }
      const tc = K.ARRIVE + P.catchT, atCatch = ldOff(P, en, tc);
      if (!atCatch || Math.abs(atCatch.d - en.off) > EPS) bad(`${at}: lead at the catch ${atCatch && atCatch.d}, engine off ${en.off}`);
      let prev = ldOff(P, en, 0), t = STEP;
      for (; t < K.ARRIVE + en.runnerAt + 0.3; t += STEP) {
        const q = ldOff(P, en, t);
        if (!q) { bad(`${at}: gone at ${t.toFixed(2)} before the engine's runnerAt`); break; }
        if (Math.abs(q.d - prev.d) > STEP_MAX) { bad(`${at}: lead jumps ${prev.d.toFixed(2)} -> ${q.d.toFixed(2)} at ${t.toFixed(2)}`); break; }
        prev = q;
      }
      const home = ldOff(P, en, K.ARRIVE + en.runnerAt);
      if (!home || home.d > 0.05) bad(`${at}: ${home && home.d} m off the bag at the engine's runnerAt`);
      if (ldOff(P, en, K.ARRIVE + en.runnerAt + 5) !== null) bad(`${at}: still drawn 5 s after he is out`);
    }
    if (both) {
      const L = P.ldTp, th = P.actions.find(a => a.a === 'throw' && a.to === L.key), rc = P.actions.find(a => a.a === 'receive' && a.f === L.key && a.base === L.base);
      if (!th || Math.abs(th.t - L.t0) > EPS) bad(`seed ${s} event ${i}: second throw leaves at ${th && th.t}, ldTp.t0 ${L.t0}`);
      if (!rc || Math.abs(rc.t - L.arrive) > EPS) bad(`seed ${s} event ${i}: received at ${rc && rc.t}, ldTp.arrive ${L.arrive}`);
    }
  });
};
for (const s of SEEDS) look(s);
for (let s = 1; s <= GAMES; s++) look(s);
if (!tps) bad('no line-drive triple play on the pinned seeds');
console.log(`ldrun_render: ${dps} line-drive double plays, ${tps} triple plays`);
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
console.log('OK');
