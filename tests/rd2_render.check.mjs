/* #890: the rundown off second picture (render/rd2.js), plain Node over real engine games. The module is run, not read. For every
 * play.rd2 frame of GAMES simulated games (and the pinned seeds 66, 145) it fails when:
 *   - the runner is not plan.rd2.turn m from second at plan.rd2.backAt, or not plan.rd2.tagPos m at plan.rd2.tagAt (within EPS),
 *   - the ball does not follow plan.actions: held by the cover at third until s0, flies third cover > second cover over s0..r3,
 *     held by the second cover at the tag, none before the cover at third has it,
 *   - the cover at third is not on his spot at arrive, or the second cover is not RD_2B_UP m up the line (from his spot beside the bag) at r3,
 *   - at the tag the second cover is more than RD_TAG_REACH + GAP_EPS from the runner, or the runner has passed him,
 *   - anyone steps faster than MAX_V m/s between two samples (nobody jumps), or the same input gives a different answer.
 * static.mjs runs this file. Usage: node tests/rd2_render.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { rd2Go, rd2Gone, rd2Runner, rd2Cover3, rd2Cover2, rd2Ball, linePt, RD2_OFF, SECOND_SPOT, LINE_DIR } from '../render/rd2.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const E = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const K = await import(pathToFileURL(path.join(ROOT, 'engine/constants.js')));
const SEEDS = [66, 145], GAMES = 700, MIN_RD = 4, EPS = 1e-6, POS_EPS = 0.35, GAP_EPS = 0.05, DT = 0.02, MAX_V = 9.5;
const errs = [], bad = m => { if (errs.length < 20) errs.push(m); };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

let n = 0;
const look = s => {
  const g = E.simGame(s, {}, { teams: [s % 4, (s + 1) % 4] });
  g.ev.forEach((e, f) => {
    if (!e.play || !e.play.rd2) return;
    n++;
    const S = e.plan, R = S.rd2, at = `seed ${s} frame ${f}`;
    const st3 = E.fielderStart(R.key3, e.s0.b, e.s0.outs), st2 = E.fielderStart(R.key2, e.s0.b, e.s0.outs);
    const up4 = [SECOND_SPOT[0] + LINE_DIR[0] * R.up, SECOND_SPOT[1] + LINE_DIR[1] * R.up];
    const c3 = u => rd2Cover3(S, u, st3), c2 = u => rd2Cover2(S, u, st2, st2);
    if (rd2Go(S, K.BAT_RUN_DELAY - DT)) bad(`${at}: runner drawn by rd2.js before he breaks`);
    if (Math.abs(rd2Runner(S, R.backAt) - R.turn) > EPS) bad(`${at}: runner ${rd2Runner(S, R.backAt)} m at backAt, plan turn ${R.turn}`);
    if (Math.abs(rd2Runner(S, R.tagAt) - R.tagPos) > EPS) bad(`${at}: runner ${rd2Runner(S, R.tagAt)} m at the tag, plan tagPos ${R.tagPos}`);
    if (rd2Gone(S, R.tagAt) || !rd2Gone(S, R.tagAt + RD2_OFF + DT)) bad(`${at}: runner leaves at the wrong time`);
    if (rd2Ball(S, S.arrive - DT) !== null) bad(`${at}: ball taken over before the cover at third has it`);
    const b = [[(S.arrive + R.s0) / 2, 'key3'], [(R.r3 + R.tagAt) / 2, 'key2'], [R.tagAt, 'key2']];
    for (const [t, h] of b) { const x = rd2Ball(S, t); if (!x || x.hold !== h) bad(`${at}: ball at ${t.toFixed(2)} is ${JSON.stringify(x)}, want held by ${h}`); }
    const fl = rd2Ball(S, (R.s0 + R.r3) / 2), end = rd2Ball(S, R.r3 - EPS);
    if (!fl || fl.k === undefined || !end || Math.abs(end.k - 1) > 1e-3) bad(`${at}: the throw does not land at its catch time`);
    if (dist(c3(S.arrive), S.CV.spot) > EPS) bad(`${at}: cover at third not on his spot at arrive`);
    if (dist(c2(R.r3), up4) > POS_EPS) bad(`${at}: second cover not ${R.up} m up the line at r3 (${dist(c2(R.r3), up4).toFixed(2)} m off)`);
    const run = linePt(R.tagPos), t2 = c2(R.tagAt), c = dist(run, t2);
    if (c > K.RD_TAG_REACH + POS_EPS + GAP_EPS) bad(`${at}: second cover ${c.toFixed(2)} m from the runner at the tag`);
    if (dist(t2, E.BASES[2]) > R.tagPos + POS_EPS) bad(`${at}: the runner is past the second cover at the tag`);
    let prev = null;
    for (let u = K.BAT_RUN_DELAY; u <= R.tagAt + 1; u += DT) {
      const now = [linePt(rd2Runner(S, u)), c3(Math.max(u, S.arrive)), c2(u)];
      if (prev) now.forEach((p, i) => { const v = dist(p, prev[i]) / DT; if (v > MAX_V) bad(`${at}: ${['runner', 'cover 3', 'cover 2'][i]} at ${v.toFixed(1)} m/s at u ${u.toFixed(2)}`); });
      prev = now;
    }
    if (JSON.stringify([rd2Runner(S, 3), c3(3), c2(3), rd2Ball(S, 3)]) !== JSON.stringify([rd2Runner(S, 3), c3(3), c2(3), rd2Ball(S, 3)])) bad(`${at}: not pure`);
  });
};
for (const s of SEEDS) look(s);
for (let s = 1; s <= GAMES; s++) if (!SEEDS.includes(s)) look(s);
if (n < MIN_RD) bad(`only ${n} rundown-off-second frames (want >= ${MIN_RD})`);
if (errs.length) { console.error('rd2_render FAIL\n' + errs.join('\n')); process.exit(1); }
console.log(`rd2_render ok: ${n} rundown frames off second, ${SEEDS.length} pinned seeds + ${GAMES} games`);
