/* #726: the rundown picture (render/rundown.js), plain Node over real engine games. The module is run, not read. For every rundown
 * frame (e.rd) of GAMES simulated games it fails when:
 *   - the runner is not plan.rd.turn m from first at plan.rd.r2, or not plan.rd.tagPos m at plan.rd.tagAt (within EPS),
 *   - the ball does not follow plan.actions: 1B holds it from the pickoff catch, flies 1B > SS over r1..r2, SS holds it, flies SS > 1B over
 *     s0..r3, 1B holds it at the tag,
 *   - the shortstop is not on the bag at second at r2 (the 1B throw's catch), or the first baseman is not plan.rd.up m up the line at r3,
 *   - at the tag the first baseman is more than RD_TAG_REACH + GAP_EPS from the runner, or the runner has passed him,
 *   - anyone steps faster than MAX_V m/s between two samples (nobody jumps), or the same input gives a different answer.
 * Plain pickoffs carry no plan.rd, so game.js keeps drawing them as before (rdOn). static.mjs runs this file.
 * Usage: node tests/rundown_render.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { rdRunner, rdFirst, rdShort, rdBall, linePt } from '../render/rundown.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const E = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const K = await import(pathToFileURL(path.join(ROOT, 'engine/constants.js')));
const GAMES = 300, MIN_RD = 5, EPS = 1e-6, POS_EPS = 0.01, GAP_EPS = 0.05, DT = 0.02, MAX_V = 9.5;
const errs = [], bad = m => { if (errs.length < 20) errs.push(m); };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const sameBall = (b, want) => b && Object.keys(want).every(k => b[k] === want[k]);

let n = 0, plain = 0;
for (let s = 1; s <= GAMES; s++) {
  const g = E.simGame(s, {}, { teams: [s % 4, (s + 1) % 4] });
  for (const e of g.ev) {
    if (e.k !== 'P' || !e.po) continue;
    const S = e.plan, at = `seed ${s} t ${e.t}`;
    if (!e.rd) { plain++; if (S && S.rd) bad(`${at}: plain pickoff carries plan.rd`); continue; }
    n++;
    const R = S.rd, ss = E.fielderStart('SS', e.s0.b, e.s0.outs);
    const A = a => S.actions.find(x => x.a === a.a && x.f === a.f && (a.to === undefined || x.to === a.to) && (!('base' in a) || x.base === a.base));
    const want = [[{ a: 'throw', f: '1B', to: 'SS' }, R.r1], [{ a: 'receive', f: 'SS' }, R.r2], [{ a: 'throw', f: 'SS', to: '1B' }, R.s0], [{ a: 'receive', f: '1B', base: null }, R.r3], [{ a: 'tag', f: '1B' }, R.tagAt]];
    for (const [a, t] of want) { const x = A(a); if (!x || Math.abs(x.t - t) > EPS) bad(`${at}: action ${a.f} ${a.a} not at plan.rd time ${t}`); }
    if (Math.abs(rdRunner(S, R.r2) - R.turn) > EPS) bad(`${at}: runner ${rdRunner(S, R.r2)} m at r2, plan turn ${R.turn}`);
    if (Math.abs(rdRunner(S, R.tagAt) - R.tagPos) > EPS) bad(`${at}: runner ${rdRunner(S, R.tagAt)} m at the tag, plan tagPos ${R.tagPos}`);
    if (rdRunner(S, R.goAt - DT) !== null) bad(`${at}: runner drawn by rundown.js before he breaks`);
    if (rdBall(S, S.arrive - DT) !== null) bad(`${at}: ball taken over before the pickoff catch`);
    const checks = [[(S.arrive + R.r1) / 2, { hold: '1B' }], [(R.r1 + R.r2) / 2, { from: '1B', to: 'SS' }], [(R.r2 + R.s0) / 2, { hold: 'SS' }],
      [(R.s0 + R.r3) / 2, { from: 'SS', to: '1B' }], [R.tagAt, { hold: '1B' }]];
    for (const [t, w] of checks) if (!sameBall(rdBall(S, t), w)) bad(`${at}: ball at ${t.toFixed(2)} is ${JSON.stringify(rdBall(S, t))}, want ${JSON.stringify(w)}`);
    const k2 = rdBall(S, R.r2 - EPS), k3 = rdBall(S, R.r3 - EPS);
    if (!k2.from || Math.abs(k2.k - 1) > 1e-3 || !k3.from || Math.abs(k3.k - 1) > 1e-3) bad(`${at}: a throw does not land at its catch time`);
    if (dist(rdShort(S, R.r2, ss), E.BASES[2]) > POS_EPS) bad(`${at}: shortstop not on second at r2`);
    if (dist(rdFirst(S, R.r3), linePt(R.up)) > POS_EPS) bad(`${at}: first baseman not ${R.up} m up the line at r3`);
    const run = linePt(R.tagPos), f1 = rdFirst(S, R.tagAt);
    if (dist(run, f1) > K.RD_TAG_REACH + GAP_EPS) bad(`${at}: first baseman ${dist(run, f1).toFixed(2)} m from the runner at the tag`);
    const d1 = dist(f1, E.BASES[1]); if (d1 > R.tagPos + EPS) bad(`${at}: the runner is past the first baseman at the tag`);
    let prev = null;
    for (let u = R.goAt; u <= R.tagAt + 1; u += DT) {
      const now = [linePt(rdRunner(S, u)), rdFirst(S, u), rdShort(S, u, ss)];
      if (prev) now.forEach((p, i) => { const v = dist(p, prev[i]) / DT; if (v > MAX_V) bad(`${at}: ${['runner', '1B', 'SS'][i]} at ${v.toFixed(1)} m/s at u ${u.toFixed(2)}`); });
      prev = now;
    }
    if (JSON.stringify([rdRunner(S, 3), rdFirst(S, 3), rdShort(S, 3, ss), rdBall(S, 3)]) !== JSON.stringify([rdRunner(S, 3), rdFirst(S, 3), rdShort(S, 3, ss), rdBall(S, 3)])) bad(`${at}: not pure`);
  }
}
if (n < MIN_RD) bad(`only ${n} rundown frames in ${GAMES} games (want >= ${MIN_RD})`);
if (errs.length) { console.error('rundown_render FAIL\n' + errs.join('\n')); process.exit(1); }
console.log(`rundown_render ok: ${n} rundown frames, ${plain} plain pickoffs, ${GAMES} games`);
