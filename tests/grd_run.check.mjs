/* Ground-rule double runner trot (#718 part 4, plain Node). render/grd_run.js over real engine games, seeds 1-200, every move of a `play.groundRule` event:
 *   - nothing changes for any other event; the trot pace equals the engine's home-run trot (HR_TROT_SPEED)
 *   - the trot starts only once the ball is over the wall (after ARRIVE + hang), never before the runner's own start
 *   - the progress is continuous at the switch, never goes backwards, never passes the base, and ends exactly on it at the new arriveT
 *   - the new arrival is not earlier than the engine's, and still inside the event (e.d); same input = same output
 *   - at least one runner really slows down (a ball that dies late enough), so the check proves something
 * static.mjs runs this file. Usage: node tests/grd_run.check.mjs */
import { simGame, ARRIVE, runDist, HR_TROT_SPEED, BASE_PATH } from '../engine/index.js';
import { grdTl, grdProg, grdDeadAt, GRD_TROT_V, GRD_BASE_M } from '../render/grd_run.js';

const T = { ARRIVE }, problems = [], bad = m => { if (problems.length < 30) problems.push(m); };
if (GRD_TROT_V !== HR_TROT_SPEED) bad(`GRD_TROT_V ${GRD_TROT_V} != engine HR_TROT_SPEED ${HR_TROT_SPEED}`);
if (GRD_BASE_M !== BASE_PATH) bad(`GRD_BASE_M ${GRD_BASE_M} != engine BASE_PATH ${BASE_PATH}`);
let events = 0, moves = 0, slowed = 0;
for (let seed = 1; seed <= 200; seed++) for (const e of simGame(seed, {}, {}).ev) {
  const gr = e.k === 'P' && e.r === 'inplay' && e.play && e.play.groundRule;
  for (const [from, to, , tl] of e.moves || []) {
    const t2 = grdTl(e, tl, T, runDist, from, to);
    if (!gr) { if (t2 !== tl) bad(`seed ${seed}: a move of an ordinary event was changed`); continue; }
    moves++;
    const L = (to - from) * GRD_BASE_M, at = `seed ${seed} t ${e.t} ${from}->${to}`;
    if (JSON.stringify(t2) !== JSON.stringify(grdTl(e, tl, T, runDist, from, to))) bad(`${at}: not pure`);
    if (t2 === tl) continue;
    slowed++;
    if (t2.trotAt < ARRIVE + e.play.hang) bad(`${at}: trot starts at ${t2.trotAt.toFixed(2)}, before the landing`);
    if (t2.trotAt < tl.st0 - 1e-9) bad(`${at}: trot starts before the runner does`);
    if (t2.trotAt < grdDeadAt(e, T) - 1e-9) bad(`${at}: trot starts before the ball is over the wall`);
    if (t2.arriveT < tl.arriveT - 1e-9) bad(`${at}: arrives earlier (${t2.arriveT}) than the engine (${tl.arriveT})`);
    if (Number.isFinite(e.d) && t2.arriveT > e.d + 1e-9) bad(`${at}: arrives at ${t2.arriveT.toFixed(2)} s, after the event (${e.d.toFixed(2)} s)`);
    if (t2.slide !== false || t2.ts !== Infinity) bad(`${at}: still slides on a dead ball`);
    if (grdProg(t2, t2.trotAt - .01, L) !== null) bad(`${at}: trot progress before the switch`);
    let prev = grdProg(t2, t2.trotAt, L);
    if (Math.abs(prev - t2.trotD) > 1e-9) bad(`${at}: jump at the switch`);
    for (let u = t2.trotAt; u <= t2.arriveT + 1; u += .02) {
      const p = grdProg(t2, u, L);
      if (p < prev - 1e-9 || p > L + 1e-9) bad(`${at}: progress ${p} at ${u.toFixed(2)} (prev ${prev}, base at ${L})`);
      prev = p;
    }
    if (Math.abs(grdProg(t2, t2.arriveT, L) - L) > 1e-6) bad(`${at}: not on the base at arriveT`);
  }
  if (gr) events++;
}
if (events < 10) bad(`only ${events} ground-rule doubles in 200 games: the check proves nothing`);
if (slowed < 1) bad('no runner was slowed: the check proves nothing');
if (problems.length) { console.error('grd_run check FAILED:\n' + problems.join('\n')); process.exit(1); }
console.log('grd_run check ok', JSON.stringify({ events, moves, slowed }));
