/* 九宮格棒球 practice (#332 part 1): both practice modes run PRACTICE_PITCHES pitches, then return {side, mode, hits, pitches, tier};
 * tier is 'full' at FULL_AT successes, else 'half'. Seeded rng, so the run is repeatable. Usage: node tests/baseball9.check.mjs */
import { createPractice, PRACTICE_PITCHES, FULL_AT, HIT_Q, PT, guessSet, MODE } from '../ui/baseball9/practice.js';
import { describeOutcome, describeResult } from '../ui/baseball9/text.js';
import { readFileSync } from 'node:fs';
const problems = [], bad = m => problems.push(m);
const seeded = s => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
const KEYS = ['side', 'mode', 'hits', 'pitches', 'tier'];
const shape = (r, side, tag) => {
  if (JSON.stringify(Object.keys(r)) !== JSON.stringify(KEYS)) bad(`${tag}: result keys ${Object.keys(r)}`);
  if (r.side !== side || r.pitches !== PRACTICE_PITCHES || !(r.hits >= 0 && r.hits <= r.pitches)) bad(`${tag}: bad result ${JSON.stringify(r)}`);
  if (r.tier !== (r.hits >= FULL_AT ? 'full' : 'half')) bad(`${tag}: tier ${r.tier} for ${r.hits}`);
};
const tiers = new Set();
for (let seed = 1; seed <= 60; seed++) {
  const bat = createPractice('bat', { rnd: seeded(seed) }), modes = Object.keys(MODE);
  let last = null, n = 0;
  while (!(last && last.done)) { last = bat.swing({ mode: modes[n % modes.length], r: 1 + n % 3, c: 1 + (n >> 1) % 3 }); n++; if (n > 50) { bad('bat never finished'); break; } }
  shape(last.result, 'bat', `bat seed ${seed}`); tiers.add(last.result.tier);
  const pit = createPractice('pitch', { rnd: seeded(seed + 1000), batterType: 'pull' }), kinds = Object.keys(PT);
  last = null; n = 0;
  while (!(last && last.done)) { last = pit.pitch({ pt: kinds[n % 2 ? 0 : 3], r: 1 + n % 3, c: 1 + (n >> 1) % 3 }); n++; if (n > 50) { bad('pitch never finished'); break; } }
  shape(last.result, 'pitch', `pitch seed ${seed}`); tiers.add(last.result.tier);
  try { bat.swing({ mode: 'one', r: 2, c: 2 }); bad('swing after the end was accepted'); } catch { /* expected */ }
}
if (!tiers.has('full') || !tiers.has('half')) bad('60 seeds never reached both tiers: ' + [...tiers]);
if (guessSet('box', 3, 3).length !== 4 || guessSet('row', 2, 2).length !== 3 || guessSet('one', 1, 1).length !== 1 || guessSet('take', 1, 1).length) bad('guessSet sizes');
/* part 2: the screen text covers every outcome the rules produce, and the page has every id screen.js reads */
{ const seen = new Set(), g = createPractice('bat', { rnd: seeded(7) }), p = createPractice('pitch', { rnd: seeded(8) });
  for (const k of ['bat', 'pitch']) for (let s = 1; s <= 40; s++) { const pr = createPractice(k, { rnd: seeded(s * 31) }); let last = { done: false }, n = 0;
    while (!last.done && n++ < 40) { last = k === 'bat' ? pr.swing({ mode: Object.keys(MODE)[n % 6], r: 1 + n % 3, c: 1 + n % 2 }) : pr.pitch({ pt: n % 2 ? 'fb' : 'change', r: n % 5, c: (n >> 1) % 5 });
      const t = describeOutcome(last.out, k, HIT_Q); seen.add(last.out.kind); if (!t || /undefined/.test(t) || t.includes(last.out.kind) && !['contact'].includes(last.out.kind) && /^[a-zA-Z]/.test(t.split('：').pop())) bad('no text for ' + last.out.kind); } }
  if (!/練習結束/.test(describeResult(g.result())) || !/完整|一半/.test(describeResult(p.result()))) bad('describeResult');
  const html = readFileSync(new URL('../baseball9.html', import.meta.url), 'utf8'), js = readFileSync(new URL('../ui/baseball9/screen.js', import.meta.url), 'utf8');
  for (const id of new Set([...js.matchAll(/\$\('([a-zA-Z]+)'\)/g)].map(m => m[1]))) if (!html.includes(`id="${id}"`)) bad('baseball9.html has no #' + id);
  if (/^import .*(three|engine\/)/m.test(js)) bad('screen.js must not import three.js or engine/'); }
/* part 3a: batted-ball physics (ball.js): deterministic per seed, every ball ends, a hard fly can leave the park, a weak grounder is fielded */
{ const B = await import('../ui/baseball9/ball.js'), kinds = {}, again = [];
  for (let s = 1; s <= 300; s++) { const q = [0.2, 0.6, 0.8, 1.0, 1.2][s % 5], r = batBallRun(B, s, q); kinds[r.kind] = (kinds[r.kind] || 0) + 1; if (s < 5) again.push(JSON.stringify(r) === JSON.stringify(batBallRun(B, s, q))); 
    if (!(r.fl.pts.length > 1 && r.fl.pts.length <= 30 * B.MAX_FLIGHT_S + 1)) bad('ball path length ' + r.fl.pts.length); if (r.fl.pts.some(p => !Number.isFinite(p.x + p.y + p.z + p.t))) bad('non-finite ball point'); }
  if (again.includes(false)) bad('batBall is not deterministic for the same seed');
  for (const k of ['HR', 'caught', 'ground']) if (!kinds[k]) bad('300 balls never gave ' + k + ': ' + JSON.stringify(kinds));
  const bunt = B.batBall(0.5, { bunt: true, rnd: seeded(3) }); if (bunt.kind === 'HR' || bunt.L.v > 8.5) bad('a bunt must stay in the infield');
  if (B.fenceR(0) !== 108 || B.POS_N.length !== 9 || B.FSPD.length !== 9 || B.FNAME.length !== 9) bad('field constants'); }
/* part 3b: runners and throws (play.js): a ball with runners ends in a legal state: outs 0..2 added, runs and bases add up, same seed = same play */
{ const P = await import('../ui/baseball9/play.js'), man = n => ({ spd: 1 + n % 3, name: 'r' + n, kind: 'cat' }), seen = {}, rows = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [1, 1, 1], [0, 0, 1], [0, 1, 0]];
  for (let s = 1; s <= 600; s++) { const bs = rows[s % rows.length].map((x, i) => x ? man(i) : null), n0 = bs.filter(Boolean).length, outs0 = s % 3, q = [0.2, 0.6, 0.8, 1.0, 1.2][s % 5];
    const run = () => P.playBall(q, { app: ['pull', 'mid', 'push'][s % 3], pow: s % 4, bunt: s % 17 === 0, batter: man(9), bases: bs, outs: outs0, rnd: seeded(s * 29) }), r = run();
    if (JSON.stringify(r) !== JSON.stringify(run())) bad('playBall is not deterministic');
    const nbN = r.nb.filter(Boolean).length; seen[r.kind] = (seen[r.kind] || 0) + 1;
    if (![0, 1, 2].includes(r.outs) || r.runs < 0 || r.nb.length !== 3) bad('playBall shape ' + JSON.stringify([r.outs, r.runs, r.nb.length]));
    if (r.outs + r.runs + nbN > n0 + 1 && !(outs0 + r.outs >= 3)) bad(`runners appear from nowhere: ${n0}+1 -> outs ${r.outs} runs ${r.runs} on ${nbN} (seed ${s})`);
    if (outs0 + r.outs < 3 && r.outs + r.runs + nbN !== n0 + 1 && r.kind !== 'HR') bad(`runner lost: ${n0}+1 -> outs ${r.outs} runs ${r.runs} on ${nbN} (seed ${s}, ${r.kind})`);
    if (r.kind === 'HR' && (r.runs !== n0 + 1 || nbN)) bad('home run must score everyone');
    if (!(r.sc.dur > 0) || !r.sc.txt || r.sc.runners.some(u => u.pts.some(p => !Number.isFinite(p.t + p.x + p.z)))) bad('playBall script ' + s);
    if (outs0 === 2 && r.outs === 2) bad('a double play with two outs'); }
  for (const k of ['HR', '1B', 'fly', 'ground']) if (!seen[k]) bad('600 plays never gave ' + k + ': ' + JSON.stringify(seen));
  const dp = Array.from({ length: 3000 }, (_, s) => P.playBall([.3, .45, .6][s % 3], { batter: { spd: 1, name: 'b', kind: 'cat' }, bases: [{ spd: 1, name: 'a', kind: 'cat' }, null, null], outs: 0, rnd: seeded(s * 7 + 1) })).filter(r => r.sc.txt === '雙殺！');
  if (!dp.length || dp.some(r => r.outs !== 2)) bad('slow runner on first, 3000 grounders: expected double plays of two outs, got ' + dp.length);
  if (P.clampTo(3, 3) !== 2 || P.clampTo(4, 4) !== 4 || P.BASES.length !== 5) bad('play constants'); }
/* part 3c: the 3-inning game (game.js): every game ends, scores add up, same seed = same game, innings and the half-run cap hold */
{ const Gm = await import('../ui/baseball9/game.js'), ends = {}; let draws = 0;
  for (let s = 1; s <= 60; s++) { const run = () => { const g = Gm.createGame({ rnd: seeded(s * 31) }), r = seeded(s * 5); let n = 0;
      while (!g.S.over && n++ < 2000) g.pitch(g.userBats() ? { mode: ['one', 'row', 'col', 'box', 'take'][n % 5], r: 1 + n % 3, c: 1 + (n >> 1) % 3, steal: n % 7 === 0, app: ['pull', 'mid', 'push', 'bunt'][(n >> 3) % 4] } : { pt: ['fb', 'heat', 'curve', 'change'][n % 4], r: Math.floor(r() * 5), c: Math.floor(r() * 5), hold: n % 5 === 0, shift: ['N', 'L', 'R', 'BUNT', 'IN', 'DEEP'][n % 6] });
      return { g, n }; }, { g, n } = run();
    if (!g.S.over) bad('game ' + s + ' did not end in 2000 pitches');
    if (JSON.stringify(g.result()) !== JSON.stringify(run().g.result())) bad('game is not deterministic');
    const res = g.result(); ends[res.winner] = (ends[res.winner] || 0) + 1; if (res.winner === -1) draws++;
    res.line.forEach((l, i) => { if (l.reduce((a, b) => a + b, 0) !== res.score[i]) bad('line score does not add up'); if (l.some(v => v > Gm.HALF_RUNS)) bad('half-inning run cap broken'); });
    if (g.S.half < 2 * Gm.INNINGS - 2 || g.S.half > 2 * (Gm.INNINGS + Gm.EXTRA_INNINGS)) bad('game length ' + g.S.half);
    if (res.winner >= 0 && res.score[res.winner] <= res.score[1 - res.winner]) bad('wrong winner'); if (res.winner === -1 && res.score[0] !== res.score[1]) bad('draw with unequal score'); }
  if (!ends[0] || !ends[1]) bad('60 games never gave both winners: ' + JSON.stringify(ends)); }
/* part 3c-2: the game screen. Text helpers on real game states, then gamescreen.js itself runs against a tiny fake DOM and clicks a whole game through. */
{ const T = await import('../ui/baseball9/text.js'), Gm = await import('../ui/baseball9/game.js'), g = Gm.createGame({ rnd: seeded(5) });
  if (!/第 1 局上/.test(T.describeHalf(g.S)) || !/你打擊/.test(T.describeHalf(g.S))) bad('describeHalf top');
  if (T.describeBases([1, null, 1]) !== '壘上：一壘● 二壘○ 三壘●' || T.canSteal({ bases: [null, null, 1] }) || !T.canSteal({ bases: [1, null, null] }) || T.canSteal({ bases: [1, 1, 1] })) bad('bases text / canSteal');
  if (!/你的隊 0 : 0 電腦隊/.test(T.describeScore(g.S)) || !/0 壞 0 好 0 出局/.test(T.describeCount(g.S))) bad('score / count text');
  const mk = () => { const e = { children: [], style: { setProperty() {} }, _t: '', hidden: false, checked: false, dataset: {}, setAttribute() {}, append(...k) { this.children.push(...k); }, prepend(k) { this.children.unshift(k); },
      set textContent(v) { this._t = v; if (v === '') this.children = []; }, get textContent() { return this._t; } }; return e; };
  const els = {}, ids = [...readFileSync(new URL('../baseball9.html', import.meta.url), 'utf8').matchAll(/id="([a-zA-Z]+)"/g)].map(m => m[1]); for (const i of ids) els[i] = mk();
  globalThis.document = { getElementById: i => els[i] || bad('gamescreen reads missing #' + i) || mk(), createElement: () => mk() }; globalThis.window = globalThis;
  const { startGame } = await import('../ui/baseball9/gamescreen.js'); startGame();
  if (els.menu.hidden !== true || els.gstage.hidden !== false) bad('startGame does not open the game stage');
  let n = 0; while (!globalThis.baseball9GameResult && n++ < 3000) { const cells = els.ggrid.children.filter(b => !b.disabled);
    if (cells.length) cells[n % cells.length].onclick(); else els.ggo.onclick(); }
  const res = globalThis.baseball9GameResult;
  if (!res) bad('the game screen never finished a game in 3000 clicks'); else { if (!/比賽結束/.test(els.gend.textContent) || els.gend.hidden) bad('no end line'); if (!/^比賽結束/.test(els.ghalf.textContent)) bad('half title at the end');
    if (els.ggrid.children.some(b => !b.disabled)) bad('cells still enabled after the game'); if (els.glog.children.length < 20) bad('log too short: ' + els.glog.children.length); }
  startGame(); if (globalThis.baseball9GameResult !== null || els.gend.hidden !== true) bad('again does not reset the game'); }
/* #430 part 1: field.js script of one pitch (pure): pitch leg first, then the batted-ball points; same result = same picture; no canvas = no picture, the game still runs */
{ const F = await import('../ui/baseball9/field.js'), Gm = await import('../ui/baseball9/game.js'), seen = {};
  for (let s = 1; s <= 30; s++) { const g = Gm.createGame({ rnd: seeded(s * 13) }), r = seeded(s * 3); let n = 0;
    while (!g.S.over && n++ < 400) { const o = g.pitch(g.userBats() ? { mode: ['one', 'row', 'take', 'box'][n % 4], r: 1 + n % 3, c: 1 + (n >> 1) % 3, steal: n % 6 === 0, app: 'mid' } : { pt: 'fb', r: Math.floor(r() * 5), c: Math.floor(r() * 5), shift: 'N' });
      const A = F.buildBeats(o), B = F.buildBeats(o); if (JSON.stringify(A) !== JSON.stringify(B)) bad('buildBeats is not deterministic');
      if (!(A.dur > F.PITCH_S) || A.dur > 30) bad('beat duration ' + A.dur);
      const p0 = F.ballAt(A, 0), p1 = F.ballAt(A, F.PITCH_S); if (!p0 || Math.hypot(p0.x - F.MOUND[0], p0.z - F.MOUND[1]) > 1e-9 || !p1 || Math.hypot(p1.x, p1.z) > 1e-9) bad('pitch leg does not run mound to plate');
      if (o.play) { seen.hit = 1; if (!A.ball.length || A.ball[0].t < F.PITCH_S) bad('batted ball starts before the pitch lands'); const e = F.ballAt(A, A.dur), L = o.play.ball[o.play.ball.length - 1]; if (!e || e.x !== L.x || e.z !== L.z) bad('ball does not end at the last point of the script');
        if (A.hr !== (o.play.kind === 'HR') || (A.hr && !A.beats.some(b => /全壘打/.test(b.txt)))) bad('home run beat'); if (A.hr) seen.hr = 1; }
      else { if (A.ball.length) bad('no batted ball but ball points'); if (/三振/.test(o.txt)) { seen.k = 1; if (!A.beats.some(b => /三振/.test(b.txt))) bad('strikeout beat'); } if (/保送/.test(o.txt)) { seen.bb = 1; if (!A.beats.some(b => /保送/.test(b.txt))) bad('walk beat'); } if (o.steal) { seen.steal = 1; if (!A.beats.some(b => /盜壘/.test(b.txt))) bad('steal beat'); } }
      if (o.play) { if (A.runners.length !== o.play.runners.length) bad('runner count in the script'); seen.run = 1;
        for (const R of A.runners) { const a = F.runnerAt(R, 0), z = F.runnerAt(R, A.dur), L = R.pts[R.pts.length - 1]; if (z.x !== L.x || z.z !== L.z) bad('runner does not end at its last point'); if (!Number.isFinite(a.x + a.z)) bad('runner start'); if (L.t > A.dur) bad('runner outlasts the script'); } }
      else if (A.runners.length) bad('runners without a batted ball');
      for (let t = 0; t <= A.dur; t += .1) { const q = F.ballAt(A, t); if (q && !Number.isFinite(q.x + q.y + q.z)) bad('non-finite ball position'); } } }
  for (const k of ['hit', 'hr', 'k', 'bb', 'steal', 'run']) if (!seen[k]) bad('30 games never showed a ' + k + ' beat');
  if (F.createField({}) !== null || F.createField({ getContext: () => null }) !== null) bad('createField must return null without a 2D context'); }
function batBallRun(B, s, q) { return B.batBall(q, { app: ['pull', 'mid', 'push'][s % 3], pow: s % 4, rnd: seeded(s * 17) }); }
if (problems.length) { console.error('baseball9.check FAIL\n- ' + problems.join('\n- ')); process.exit(1); }
console.log('baseball9.check ok (60 seeds, both sides, tiers', [...tiers].join('/') + ')');
