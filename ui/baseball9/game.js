/* 九宮格棒球 the 3-inning game (#332 part 3c): the prototype's `fresh` / `batter` / AI / `applyPitch` / `newHalf` (ui/ref/baseball_9grid/)
 * on top of practice.js (one pitch) and play.js (one batted ball). Pure, seedable (`rnd`), no DOM, no three.js, no engine/ (rule 10: a score for
 * this mini-game only, never a league result). You (team 0) bat in the top half and pitch in the bottom; the computer does the other side.
 * One call = one pitch: `game.pitch(choice)`; the choice is {mode,r,c,steal,app} when you bat and {pt,r,c,hold,shift} when you pitch. */
import { guessSet, inZ, sIdx, resolve, PT, TYPES, STAMINA } from './practice.js';
import { playBall, OUTS_PER_INNING } from './play.js';
import { POS_N } from './ball.js';

export const INNINGS = 3;            // regular innings
export const EXTRA_INNINGS = 2;      // tie-break innings (a runner starts on second); still tied after them = a draw
export const HALF_RUNS = 6;          // most runs one half-inning can score (the prototype's HALF_RUNS)
export const STAMINA_REST = 15;      // stamina a pitcher gets back between his half-innings
export const BALLS_WALK = 4, STRIKES_OUT = 3, TIRED_AT = 25;
export const MODE_NAME = { one: '精準', row: '橫排', col: '直列', box: '四格', take: '不揮', bunt: '觸擊' };
export const TEAMS = [
  { name: '藍鯨', pitcher: '穩穩企鵝', pk: 'penguin', lineup: [
    { n: '快腿兔', t: 'pull', con: .06, pow: 0, spd: 3, k: 'rabbit' }, { n: '小飛貓', t: 'lo', con: .04, pow: 1, spd: 3, k: 'cat' },
    { n: '大砲熊', t: 'mid', con: -.03, pow: 3, spd: 1, k: 'bear' }, { n: '鐵牛', t: 'hi', con: 0, pow: 2, spd: 1, k: 'ox' },
    { n: '左手狗', t: 'push', con: .05, pow: 1, spd: 2, k: 'dog' }, { n: '二刀狐', t: 'diag', con: .01, pow: 1, spd: 2, k: 'fox' }] },
  { name: '紅隼', pitcher: '火球狐', pk: 'fox', lineup: [
    { n: '跑跑鼠', t: 'push', con: .06, pow: 0, spd: 3, k: 'mouse' }, { n: '阿肥貓', t: 'pull', con: .03, pow: 1, spd: 2, k: 'cat' },
    { n: '大炮豬', t: 'mid', con: -.03, pow: 3, spd: 1, k: 'pig' }, { n: '鐵臂猴', t: 'lo', con: 0, pow: 2, spd: 2, k: 'monkey' },
    { n: '兩光虎', t: 'hi', con: -.01, pow: 2, spd: 1, k: 'tiger' }, { n: '一刀狗', t: 'diag', con: .02, pow: 1, spd: 2, k: 'dog' }] }];
const P = POS_N, mv = (f) => P.map((p, i) => f(p, i) || p.slice());
export const SHIFTS = {   // defensive alignments (the prototype's PRESETS), fielder order as POS_N
  N: { n: '正常', f: () => P.map(p => p.slice()) },
  L: { n: '拉打偏移', f: () => mv((p, i) => i >= 2 && [i < 6 ? p[0] - (i === 2 ? 3 : 8) : p[0] - 13, p[1]]) },
  R: { n: '推打偏移', f: () => mv((p, i) => i >= 2 && [i < 6 ? p[0] + (i === 5 ? 3 : 8) : p[0] + 13, p[1]]) },
  BUNT: { n: '防觸擊', f: () => { const D = mv(() => 0); D[2] = [11, 12]; D[5] = [-11, 12]; D[3] = [13, 28]; D[4] = [-5, 33]; return D; } },
  IN: { n: '內野前進', f: () => { const D = mv(() => 0); D[2] = [15, 22]; D[5] = [-15, 22]; D[3] = [8, 28]; D[4] = [-8, 28]; return D; } },
  DEEP: { n: '外野後退', f: () => mv((p, i) => i >= 6 && [p[0] * 1.05, p[1] + 7]) },
};
const TB = { HR: 4, '3B': 3, '2B': 2, '1B': 1 };
const blank = () => ({ pa: 0, ab: 0, h: 0, hr: 0, bb: 0, k: 0, tb: 0, sb: 0, cs: 0 });

export function createGame({ rnd = Math.random } = {}) {
  const pick = ws => { let t = ws.reduce((a, b) => a + b.w, 0) * rnd(); for (const o of ws) { t -= o.w; if (t <= 0) return o; } return ws[ws.length - 1]; };
  const S = { half: 0, score: [0, 0], outs: 0, balls: 0, strikes: 0, bases: [null, null, null], halfRuns: 0, ord: [0, 0], stamina: [STAMINA, STAMINA],
    guessHist: [[], []], pitchHist: [[], []], appHist: [], line: [[], []], stats: [blank(), blank()], log: [], over: false, winner: null, extra: false, def: SHIFTS.N.f() };
  const batTeam = () => S.half % 2, pitTeam = () => 1 - batTeam(), userBats = () => batTeam() === 0, lastHalf = () => S.half >= 2 * INNINGS - 1 + 2 * (S.extra ? S.extraN : 0);
  S.extraN = 0;
  const batter = () => { const l = TEAMS[batTeam()].lineup, b = l[S.ord[batTeam()] % l.length]; return { name: b.n, type: TYPES[b.t], con: b.con, pow: b.pow, spd: b.spd, kind: b.k, tkey: b.t }; };
  const stealer = () => S.bases[1] && !S.bases[2] ? { from: 1, r: S.bases[1] } : S.bases[0] && !S.bases[1] ? { from: 0, r: S.bases[0] } : null;
  const on = () => S.bases[0] || S.bases[1];
  function newHalf() {
    S.outs = S.balls = S.strikes = S.halfRuns = 0; S.bases = S.extra ? [null, { spd: 2, name: '代跑', kind: 'dog' }, null] : [null, null, null];
    if (S.half > 0) S.stamina[pitTeam()] = Math.min(STAMINA, S.stamina[pitTeam()] + STAMINA_REST);
    S.line[batTeam()].push(0); S.curApp = 'mid'; S.def = SHIFTS.N.f(); S.shift = 'N';
  }
  newHalf();
  function aiApproach() { const b = batter(); if (on() && S.outs === 0 && b.pow <= 1 && rnd() < .3) return 'bunt'; if (!on() && b.spd === 3 && rnd() < .08) return 'bunt';
    const w = b.tkey === 'pull' ? [.55, .3, .15] : b.tkey === 'push' ? [.15, .3, .55] : [.25, .5, .25]; return pick([{ a: 'pull', w: w[0] }, { a: 'mid', w: w[1] }, { a: 'push', w: w[2] }]).a; }
  function aiShift() { const c = { pull: 0, mid: 0, push: 0, bunt: 0 }; for (const a of S.appHist.slice(-6)) c[a]++; const b = batter();
    return pick([{ s: 'N', w: 2.2 }, { s: 'L', w: .3 + c.pull * .45 }, { s: 'R', w: .3 + c.push * .45 }, { s: 'BUNT', w: .1 + c.bunt * .6 + (on() && S.outs === 0 && b.pow <= 1 ? .5 : 0) },
      { s: 'IN', w: S.bases[2] && S.outs < 2 ? .8 : .05 }, { s: 'DEEP', w: b.pow >= 2 ? .6 : .1 }]).s; }
  function aiPitch() { const h = batter().type.h, g = Array(9).fill(0), gh = S.guessHist[0];
    for (const set of gh.slice(-12)) for (const [r, c] of set) g[r * 3 + c]++;
    const gm = Math.max(1, ...g), opts = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) { let w;
      if (inZ(r, c)) { const i = sIdx(r, c); w = h[i] > 0 ? .45 : h[i] < 0 ? 1.7 : 1; if (r === 2 && c === 2) w *= .75; w /= 1 + 1.3 * g[i] / gm; if (S.balls === 3) w *= r === 2 || c === 2 ? 1.6 : 1.2; }
      else { w = (r === 0 || r === 4) && (c === 0 || c === 4) ? .08 : .55; if (S.strikes === 2) w *= 2; if (S.balls === 3) w *= .15; }
      opts.push({ r, c, w }); }
    const st = stealer(), sta = S.stamina[pitTeam()], oneRate = gh.slice(-8).filter(s => s.length === 1).length;
    const types = [{ p: 'fb', w: 2 }, { p: 'heat', w: sta > 30 ? (S.strikes === 2 ? 1.4 : .5) : 0 }, { p: 'curve', w: sta > 20 ? (S.strikes === 2 ? 1.2 : .6) : 0 }, { p: 'change', w: sta > 12 ? .5 + oneRate * .3 : 0 }];
    return Object.assign(pick(opts), { pt: pick(types).p, hold: !!(st && st.r.spd >= 2 && rnd() < .55) }); }
  function aiSwing() { const st = stealer(), steal = !!(st && S.balls < 3 && rnd() < (st.r.spd === 3 ? .3 : st.r.spd === 2 ? .1 : .02));
    if (S.curApp === 'bunt') return { mode: rnd() < .85 ? 'bunt' : 'take', set: [], steal: false };
    const f = Array(25).fill(1); for (const p of S.pitchHist[0].slice(-14)) f[p.r * 5 + p.c] += 2.2; const h = batter().type.h;
    const take = S.balls === 3 && S.strikes < 2 ? .5 : S.balls + S.strikes === 0 ? .2 : S.strikes === 2 ? .05 : .1; if (rnd() < take) return { mode: 'take', set: [], steal };
    const mode = pick((S.strikes === 2 ? [['box', .55], ['row', .18], ['col', .18], ['one', .09]] : [['one', .22], ['row', .28], ['col', .27], ['box', .23]]).map(m => ({ m: m[0], w: m[1] }))).m, opts = [];
    for (let r = 1; r < 4; r++) for (let c = 1; c < 4; c++) { const set = guessSet(mode, r, c); let sc = 0; for (const [R, C] of set) sc += f[(R + 1) * 5 + C + 1] * (1 + .25 * h[R * 3 + C]); opts.push({ set, w: Math.pow(sc, 2.2) }); }
    return { mode, set: pick(opts).set, steal }; }
  function endHalf() {   // after 3 outs: next half, or the end of the game
    const last = lastHalf(), home = S.half % 2 === 1;
    if (last && home && S.score[0] !== S.score[1]) { S.over = true; }
    else if (last && home) { if (S.extraN >= EXTRA_INNINGS) S.over = true; else { S.extra = true; S.extraN++; } }
    else if (last && !home && S.score[1] > S.score[0]) S.over = true;   // the home team leads after the top of the last inning: no bottom half
    if (S.over) S.winner = S.score[0] === S.score[1] ? -1 : S.score[0] > S.score[1] ? 0 : 1;
    else { S.half++; newHalf(); }
  }
  /** One pitch. `choice`: batting {mode,r,c,steal,app}; pitching {pt,r,c,hold,shift}. Returns {txt, paEnd, hit, runs, play, steal, over, res}. */
  function pitch(choice) {
    if (S.over) throw new Error('the game is over');
    const b = batter(), bt = batTeam(), pt = pitTeam(), st = S.stats[bt], out = { txt: '', paEnd: false, hit: false, runs: 0, play: null, steal: null, half: S.half };
    let p, sw, hold, ptk;
    if (userBats()) { if (S.balls + S.strikes === 0) { S.curApp = choice.app || 'mid'; S.shift = aiShift(); S.def = SHIFTS[S.shift].f(); }
      const m = S.curApp === 'bunt' ? 'bunt' : choice.mode; if (m !== 'take' && m !== 'bunt' && choice.r == null) throw new Error('a guess needs a cell');
      const ai = aiPitch(); p = { r: ai.r, c: ai.c }; hold = ai.hold; ptk = ai.pt; sw = { mode: m, set: guessSet(m, choice.r, choice.c), steal: !!choice.steal && !!stealer() }; }
    else { if (S.balls + S.strikes === 0) { S.curApp = aiApproach(); if (choice.shift && SHIFTS[choice.shift]) { S.shift = choice.shift; S.def = SHIFTS[choice.shift].f(); } }
      ptk = PT[choice.pt] && S.stamina[pt] >= PT[choice.pt].cost ? choice.pt : 'fb'; p = { r: Math.max(0, Math.min(4, choice.r)), c: Math.max(0, Math.min(4, choice.c)) }; sw = aiSwing(); hold = !!choice.hold && !!stealer(); }
    S.stamina[pt] = Math.max(0, S.stamina[pt] - PT[ptk].cost);
    const res = out.res = resolve(p, sw, ptk, { batter: b, tired: S.stamina[pt] < TIRED_AT, hold, strikes: S.strikes, app: S.curApp, rnd }), k = res.kind;
    S.pitchHist[pt].push(res.pitch); S.guessHist[bt].push(sw.set);
    const prev = S.bases.slice(), stealTry = sw.steal && stealer(); let runs = 0;
    if (k === 'contact' || k === 'bunt' || k === 'popup') {
      const q = k === 'contact' ? res.q : k === 'popup' ? .2 : .4;
      const Pl = playBall(k === 'popup' ? .3 : q, { app: S.curApp, pt: ptk, bunt: k !== 'contact', pow: b.pow, batter: { spd: b.spd, name: b.name, kind: b.kind }, bases: S.bases, outs: S.outs, def: S.def, rnd });
      if (k === 'popup') { Pl.outs = 1; Pl.runs = 0; Pl.nb = S.bases.slice(); Pl.sc.txt = '觸擊小飛球被接殺'; }
      if (res.box && Pl.outs > 0 && Pl.sc.kind !== 'HR' && q < .62 && rnd() < .5) { if (S.strikes < 2) S.strikes++; out.txt = '四格護航，打成界外'; return done(out, 0, prev); }   // box protection
      st.pa++; if (!(k === 'bunt' && Pl.outs === 1 && S.bases.some(x => x) && Pl.sc.kind === 'bunt')) st.ab++;
      S.outs += Pl.outs; S.bases = Pl.nb; out.play = Pl.sc; out.txt = Pl.sc.txt; out.paEnd = true; runs = Pl.runs;
      if (Pl.sc.hit || Pl.kind === 'HR') { out.hit = true; st.h++; st.tb += TB[Pl.kind] || 1; if (Pl.kind === 'HR') st.hr++; }
      return done(out, runs, prev); }
    if (k === 'ball') { S.balls++; out.txt = res.missed ? '失投・壞球' : '壞球'; } else if (k === 'called') { S.strikes++; out.txt = '好球（站著看）'; }
    else if (k === 'whiff') { S.strikes++; out.txt = sw.mode === 'bunt' ? '觸擊沒碰到' : '揮空！'; } else if (k === 'foul') { if (S.strikes < 2) S.strikes++; out.txt = '界外球'; }
    else if (k === 'foulBunt') { S.strikes++; out.txt = '觸擊界外'; }
    if (stealTry && k !== 'foul' && k !== 'foulBunt') { const sr = stealTry, pr = [0, .55, .72, .88][sr.r.spd] - (hold ? .22 : 0) - (sr.from === 1 ? .08 : 0);
      out.steal = { from: sr.from, ok: rnd() < pr };
      if (out.steal.ok) { S.bases[sr.from + 1] = sr.r; S.bases[sr.from] = null; out.txt += ` · 盜${sr.from === 0 ? '二' : '三'}壘成功`; st.sb++; }
      else { S.bases[sr.from] = null; S.outs++; out.txt += ' · 盜壘失敗出局'; st.cs++; } }
    if (S.balls >= BALLS_WALK) { const bs = S.bases; if (bs[0]) { if (bs[1]) { if (bs[2]) runs++; bs[2] = bs[1]; } bs[1] = bs[0]; } bs[0] = { spd: b.spd, name: b.name, kind: b.kind }; out.txt = '四壞保送'; out.paEnd = true; st.bb++; st.pa++; }
    else if (S.strikes >= STRIKES_OUT) { S.outs++; out.paEnd = true; st.k++; st.pa++; st.ab++; out.txt = k === 'called' ? '站著被三振' : k === 'foulBunt' ? '觸擊界外，三振' : '揮棒落空三振'; }
    return done(out, runs, prev);
  }
  function done(out, runs, prev) {
    if (runs) { const got = Math.min(runs, HALF_RUNS - S.halfRuns); S.score[batTeam()] += got; S.halfRuns += got; S.line[batTeam()][S.line[batTeam()].length - 1] += got; out.runs = got; out.txt += got < runs ? '（本半局達上限）' : ` · 得 ${got} 分`; }
    out.prev = prev; if (out.paEnd) { if (userBats()) S.appHist.push(S.curApp); S.ord[batTeam()]++; S.balls = S.strikes = 0; }
    S.log.push(out.txt);
    if (S.outs >= OUTS_PER_INNING) { out.halfEnded = true; endHalf(); } else if (S.extra && S.half % 2 === 1 && S.score[1] > S.score[0] && lastHalf()) { out.halfEnded = true; S.over = true; S.winner = 1; }
    out.over = S.over; return out;
  }
  return { S, pitch, batter, userBats, result: () => ({ score: S.score.slice(), winner: S.winner, line: S.line.map(l => l.slice()), stats: S.stats }) };
}
