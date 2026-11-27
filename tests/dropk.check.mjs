/* Dropped third strike (#614 part 4): with first open or two outs, a third strike the catcher does not hold lets the batter run.
 * Runs seeds (at least MIN_GAMES, up to MAX_GAMES until both a K 2-3 and a batter reaching show up) and fails when
 *   - a dropped third strike happens with first occupied and fewer than two outs, on a bunt, or not on strike three,
 *   - its stream `call` (`dropped: true`) is not a swinging or called strike, or the PA does not end as `strikeout`,
 *   - the batter is out other than by a `force` at first by the first baseman after a C -> 1B throw, or the ball does not beat him,
 *   - a batter who is safe is not on first afterwards (a `runner_advance` 0 -> 1, how `dropped_third_strike`) or an out is booked,
 *   - the pitcher's and the batter's strikeouts do not count it,
 *   - dropped third strikes are not between MIN_PER_GAME and MAX_PER_GAME a game, or no batter ever reaches.
 * static.mjs runs this file. Usage: node tests/dropk.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const MIN_GAMES = 400, MAX_GAMES = 4000, MIN_PER_GAME = 0.15, MAX_PER_GAME = 0.8;
const errs = [], bad = m => { if (errs.length < 20) errs.push(m); };
for (const c of ['K3_DROP_DIRT_P', 'K3_DROP_P', 'K3_RETRIEVE']) if (K[c] === undefined) bad(`${c} is missing from engine/constants.js`);

let drops = 0, outs = 0, safe = 0, s = 0;
while (s < MAX_GAMES && (s < MIN_GAMES || !safe || !outs)) {
  s++;
  const g = K.simGame(s, {}, { teams: [s % 4, (s + 1) % 4] }), S = g.stream;
  let kStream = 0;
  for (const e of g.ev) {
    if (e.k !== 'P' || !e.k3) continue;
    drops++;
    const at = `seed ${s} frame ${g.ev.indexOf(e)}`;
    if (e.s0.b[0] && e.s0.outs < K.OUTS_PER_HALF - 1) bad(`${at}: dropped third strike with first occupied and ${e.s0.outs} outs`);
    if (e.c0[1] !== K.STRIKES_FOR_OUT - 1 || e.bunt || !e.pa) bad(`${at}: dropped third strike on ${e.c0} (bunt ${!!e.bunt}, pa ${!!e.pa})`);
    const F = S.filter(x => x.f === g.ev.indexOf(e));
    const call = F.find(x => x.type === 'call'), end = F.find(x => x.type === 'pa_end');
    if (!call || !call.dropped || !['swinging_strike', 'called_strike'].includes(call.call)) bad(`${at}: call is ${call && call.call} dropped=${call && call.dropped}`);
    if (!end || end.result !== 'strikeout') bad(`${at}: PA ends as ${end && end.result}`);
    const out = F.find(x => x.type === 'out' && x.from === 0);
    if (e.outs.length) {
      outs++;
      const thr = F.find(x => x.type === 'fielder_action' && x.action === 'throw' && x.fielder === 'C' && x.to === '1B');
      if (!out || out.reason !== 'force' || out.fielder !== '1B' || out.base !== 1) bad(`${at}: batter out as ${out && out.reason} by ${out && out.fielder}`);
      else if (!thr || !(out.ballAt > thr.t) || !(out.t < out.runnerAt)) bad(`${at}: the throw to first does not beat the batter`);
    } else {
      safe++;
      if (out) bad(`${at}: batter safe but an out was booked`);
      if (e.s1.b[0] !== call.batter) bad(`${at}: ${call.batter} is not on first`);
      if (!F.some(x => x.type === 'runner_advance' && x.runner === call.batter && x.from === 0 && x.to === 1 && x.how === 'dropped_third_strike')) bad(`${at}: no runner_advance 0 -> 1 for the batter`);
    }
  }
  for (const x of S) if (x.type === 'pa_end' && x.result === 'strikeout') kStream++;
  const kBox = g.stats.flat().reduce((a, b) => a + b.k, 0);
  if (kBox !== kStream) bad(`seed ${s}: ${kBox} strikeouts in the box, ${kStream} in the stream`);
}
const per = drops / s;
if (!(per >= MIN_PER_GAME && per <= MAX_PER_GAME)) bad(`${per.toFixed(3)} dropped third strikes a game, expected ${MIN_PER_GAME}..${MAX_PER_GAME}`);
if (!safe) bad(`no batter reached on a dropped third strike in ${s} games`);
if (!outs) bad(`no dropped third strike thrown out at first in ${s} games`);
if (errs.length) { console.error('dropk check FAILED:\n  ' + errs.join('\n  ')); process.exit(1); }
console.log(`dropk check OK: ${drops} dropped third strikes (${per.toFixed(3)} a game), ${outs} thrown out at first, ${safe} reached, over ${s} games`);
