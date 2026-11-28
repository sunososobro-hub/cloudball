/* Check-swing appeals (#614 part 6): on a half swing the plate umpire called a ball, the catcher asks the base umpire on the
 * batter's open side; his ruling is the call. Runs GAMES seeds and fails when
 *   - denied appeals are not CHECK_APPEAL_BALL_P of the balls, or swings ruled on appeal not CHECK_APPEAL_OF_WHIFF of the
 *     non-tip swinging strikes (within TOL), or there are fewer than MIN_PER_GAME appeals per game,
 *   - an `appeal` is not followed at the same time by the `call` of that batter with `checkSwing: true`, a `no_swing` ruling
 *     is not a `ball` call, or a `swing` ruling is not a `swinging_strike` after a `swing` of that batter,
 *   - the umpire is not third base for a left-handed batter and first base otherwise,
 *   - a `swing` ruling on two strikes is not a `strikeout_swinging` out of that batter at the appeal time (no earlier),
 *   - an appealed pitch is also a foul tip, a wild pitch or a passed ball,
 *   - no appeal ever ends a plate appearance as a walk or as a strikeout.
 * static.mjs runs this file. Usage: node tests/checkswing.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const GAMES = 300, TOL = 0.01, MIN_PER_GAME = 1.5;
const errs = [], bad = m => { if (errs.length < 20) errs.push(m); };
for (const c of ['CHECK_APPEAL_BALL_P', 'CHECK_APPEAL_OF_WHIFF', 'CHECK_APPEAL_AT']) if (typeof K[c] !== 'number') bad(`${c} is missing from engine/constants.js`);

const hand = new Map(K.ROSTERS.flatMap(r => [...r.bat, ...(r.bench || [])].map(b => [b.name, b.hand])));
let balls = 0, denied = 0, whiffs = 0, ruled = 0, walks = 0, ks = 0;
for (let s = 1; s <= GAMES; s++) {
  const g = K.simGame(s, {}, { teams: [s % 4, (s + 1) % 4] }), S = g.stream;
  for (const e of g.ev) {
    if (e.k !== 'P') continue;
    if (e.r === 'ball') { balls++; if (e.chk) denied++; }
    if (e.r === 'sstr' && !e.tip) { whiffs++; if (e.chk) ruled++; }
    if (!e.chk) continue;
    if (e.tip || e.wp || e.pb) bad(`seed ${s}: appealed pitch at ${e.t} is also a tip / wild pitch / passed ball`);
    if (e.chk.swing !== (e.r === 'sstr') || (!e.chk.swing && e.r !== 'ball')) bad(`seed ${s}: appeal at ${e.t} ruled swing=${e.chk.swing} on a ${e.r}`);
  }
  S.forEach((c, i) => {
    if (c.type !== 'appeal') return;
    const call = S.slice(i + 1).find(x => x.f === c.f && x.type === 'call');
    if (!call || call.batter !== c.batter || !call.checkSwing || call.time !== c.time) { bad(`seed ${s}: appeal #${c.i} is not followed by its call at the same time`); return; }
    const want = hand.get(c.batter) === 'L' ? 'third_base' : 'first_base';
    if (c.umpire !== want) bad(`seed ${s}: appeal #${c.i} for ${c.batter} (${hand.get(c.batter)}) went to ${c.umpire}`);
    const frame = S.filter(x => x.f === c.f), end = frame.find(x => x.type === 'pa_end');
    if (c.ruling === 'no_swing') {
      if (call.call !== 'ball') bad(`seed ${s}: denied appeal #${c.i} is a ${call.call} call`);
      if (end) { if (end.result === 'walk') walks++; else bad(`seed ${s}: denied appeal #${c.i} ends the PA as ${end.result}`); }
    } else if (c.ruling === 'swing') {
      const sw = frame.find(x => x.type === 'swing' && x.batter === c.batter);
      if (call.call !== 'swinging_strike' || !sw) bad(`seed ${s}: swing ruling #${c.i} is a ${call.call} call${sw ? '' : ' without a swing'}`);
      if (end && !frame.some(x => x.type === 'call' && x.dropped)) {
        const out = frame.find(x => x.type === 'out' && x.runner === c.batter && x.from === 0);
        if (end.result !== 'strikeout' || !out || out.reason !== 'strikeout_swinging') bad(`seed ${s}: swing ruling #${c.i} ends the PA as ${end.result}`);
        else if (out.time < c.time) bad(`seed ${s}: strikeout at ${out.time} before its appeal at ${c.time}`);
        else ks++;
      }
    } else bad(`seed ${s}: appeal #${c.i} has ruling ${c.ruling}`);
  });
}
const pBall = denied / Math.max(1, balls), pWhiff = ruled / Math.max(1, whiffs), perGame = (denied + ruled) / GAMES;
if (Math.abs(pBall - K.CHECK_APPEAL_BALL_P) > TOL) bad(`denied appeals are ${pBall.toFixed(4)} of balls, expected ${K.CHECK_APPEAL_BALL_P} +- ${TOL}`);
if (Math.abs(pWhiff - K.CHECK_APPEAL_OF_WHIFF) > TOL) bad(`swing rulings are ${pWhiff.toFixed(4)} of swinging strikes, expected ${K.CHECK_APPEAL_OF_WHIFF} +- ${TOL}`);
if (perGame < MIN_PER_GAME) bad(`${perGame.toFixed(2)} appeals per game, expected at least ${MIN_PER_GAME}`);
if (!walks) bad(`no denied appeal on ball four in ${GAMES} games`);
if (!ks) bad(`no strikeout on an appeal in ${GAMES} games`);
if (errs.length) { console.error('checkswing check FAILED:\n  ' + errs.join('\n  ')); process.exit(1); }
console.log(`checkswing check OK: ${perGame.toFixed(2)} appeals per game (${denied} denied, ${ruled} ruled a swing), ${walks} walks and ${ks} strikeouts on an appeal, over ${GAMES} games`);
