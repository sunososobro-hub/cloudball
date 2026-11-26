/* #42: half-inning jog ends (render/brkjog.js), plain Node over real engine games. The module is run, not read:
 *   - the retiring side starts its jog off where the last pitch of the half posed it (fielderStart of that pitch), so no
 *     fielder jumps on the first frame of the break; the new side ends its jog on the spot the next pitch poses it on
 *   - those spots really differ from the break's own base state in some games (double-play depth, extra-inning runner),
 *     i.e. the check covers the case that used to jump
 *   - every new fielder, jogging from his dugout at BRK_ON_AT (game.js jog order), is on his spot before the break ends
 *   - same input = same output
 * static.mjs runs this file. Usage: node tests/brkjog.check.mjs */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { simGame } from '../engine/index.js';
import { fielderStart, FIELDER_KEYS, FIELD_HOME } from '../engine/rules/field.js';
import { brkEnds } from '../render/brkjog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), problems = [], bad = m => { if (problems.length < 30) problems.push(m); };
const game = readFileSync(path.join(ROOT, 'render/game.js'), 'utf8');
const num = k => { const m = game.match(new RegExp('\\b' + k + '=(-?[0-9.]+)')); return m ? +m[1] : NaN; };
const C = { on: num('BRK_ON_AT'), speed: num('JOG_SPEED'), gap: num('JOG_GAP'), ix: num('INTRO_X'), iz: num('INTRO_Z') };
if (!Object.values(C).every(Number.isFinite)) bad('could not read BRK_ON_AT / JOG_SPEED / JOG_GAP / INTRO_X / INTRO_Z from game.js');
/* game.js jogRank: farthest from home plate goes first */
const ORDER = FIELDER_KEYS.slice().sort((a, b) => Math.hypot(...FIELD_HOME[b]) - Math.hypot(...FIELD_HOME[a]));
const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
let breaks = 0, offDiffers = 0, onDiffers = 0;
for (let seed = 1; seed <= 60; seed++) {
  const ev = simGame(seed, {}, {}).ev;
  ev.forEach((e, i) => {
    if (e.k !== 'BRK') return;
    breaks++;
    const prev = ev[i - 1], next = ev[i + 1], dug = [(e.s0.half === 0 ? 1 : -1) * C.ix, C.iz];/* the new fielding side = old batting side */
    let slowest = 0;
    FIELDER_KEYS.forEach(k => {
      const r = brkEnds(ev, i, k, fielderStart), r2 = brkEnds(ev, i, k, fielderStart);
      if (!same(r.from, r2.from) || !same(r.to, r2.to)) bad(`seed ${seed} ev ${i} ${k}: not pure`);
      if (prev && prev.k === 'P') {
        if (!same(r.from, fielderStart(k, prev.s0.b, prev.s0.outs))) bad(`seed ${seed} ev ${i} ${k}: jog off does not start where the last pitch left him`);
        if (!same(r.from, fielderStart(k, e.s0.b, e.s0.outs))) offDiffers++;
      }
      if (next && next.s0) {
        if (!same(r.to, fielderStart(k, next.s0.b, next.s0.outs))) bad(`seed ${seed} ev ${i} ${k}: jog out does not end where the next pitch poses him`);
        if (!same(r.to, fielderStart(k, [0, 0, 0], 0))) onDiffers++;
      }
      slowest = Math.max(slowest, C.on + ORDER.indexOf(k) * C.gap + Math.hypot(r.to[0] - dug[0], r.to[1] - dug[1]) / C.speed);
    });
    if (slowest > e.d) bad(`seed ${seed} ev ${i}: last fielder on his spot at ${slowest.toFixed(2)} s, break ends at ${e.d.toFixed(2)} s`);
  });
}
if (!breaks) bad('no half-inning breaks in 60 games');
if (!offDiffers) bad('no break where the last pitch left a fielder off his break spot: the double-play case is not covered');
if (!onDiffers) bad('no break where the next pitch poses a fielder off his home: the extra-inning runner case is not covered');
if (problems.length) { console.error('brkjog: FAIL\n  ' + problems.join('\n  ')); process.exit(1); }
console.log(`brkjog: OK (${breaks} breaks, ${offDiffers} jog-off starts and ${onDiffers} jog-out ends away from the old spots)`);
