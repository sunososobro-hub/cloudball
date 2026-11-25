/* 九宮格棒球 one batted ball with runners (#332 part 3b): the prototype's `play` / `hitPlay` (ui/ref/baseball_9grid/) on top of ball.js:
 * who fields it, throws, double plays, tag-ups, how far each runner goes. Pure, seedable (`rnd`), no DOM, no three.js, no engine/ (rule 10:
 * a score for this mini-game only, never a league result). Units as ball.js; bases are indexes 0 home, 1 first, 2 second, 3 third, 4 home again. */
import { launch, flight, fieldIt, FNAME, FSPD, POS_N } from './ball.js';

export const OUTS_PER_INNING = 3;
export const BASES = [[0, 0], [19.4, 19.4], [0, 38.8], [-19.4, 19.4], [0, 0]];
export const BASE_LEN = 27.4;                      // m between two bases (running)
export const THROW_SPEED = 27;                     // m/s
export const RUN_SPEED = [0, 8.6, 9.4, 10.6];      // by runner speed 0..3
export const INFIELD_R = 44;                       // a ball fielded inside this radius is an infield play
export const TAG_UP_DEPTH = 50;                    // m: a runner on third tags up on a catch deeper than this
export const SECOND_ADVANCE_DEPTH = 70;            // m: ...and a runner on second may take third beyond this

const RS = s => RUN_SPEED[s] || RUN_SPEED[1];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const clampTo = (to, limit) => limit < 4 && to >= limit ? limit - 1 : Math.min(to, 4);
const keep = x => x && { spd: x.spd, name: x.name, kind: x.kind };

/** One batted ball. `batter` / each of `bases[0..2]` (null = empty) = {spd 1..3, name, kind}; `outs` before the ball; `def` nine [x,z].
 *  Returns {sc, outs, runs, nb, kind}: sc = {ball, fielders, runners, throws, dur, txt, kind, hit}, nb = new bases. */
export function playBall(q, { app = 'mid', pt = null, bunt = false, pow = 0, batter, bases = [null, null, null], outs: outs0 = 0, def = POS_N, rnd = Math.random } = {}) {
  const b = batter || { spd: 2, name: '打者', kind: 'cat' }, F = def;
  const L = launch(q, app, pt, bunt, pow, rnd), fl = flight(L.v, L.la, L.spray);
  const sc = { ball: [], fielders: {}, runners: [], throws: [], dur: 0, txt: '', kind: '', hit: false };
  const runners = [{ from: -1, spd: b.spd, name: b.name, kind: b.kind, bat: true }];
  for (let i = 0; i < 3; i++) if (bases[i]) runners.push({ from: i, spd: bases[i].spd, name: bases[i].name, kind: bases[i].kind });
  const lead = outs0 === OUTS_PER_INNING - 1 ? 1.1 : .6;
  const arrive = (r, to) => { const v = RS(r.spd); let t = r.bat ? .45 : .15 - lead; for (let k = r.from + 1; k < to; k++) t += BASE_LEN / v + (k > r.from + 1 ? .1 : 0); return t; };
  const path = (r, to, outAt) => {                  // running path from base r.from+1 to base `to`
    const st = r.bat ? .45 : Math.max(0, .15 - lead), v = RS(r.spd), pts = [{ t: 0, x: BASES[r.from + 1][0], z: BASES[r.from + 1][1] }]; let t = st;
    pts.push({ t, x: pts[0].x, z: pts[0].z });
    for (let k = r.from + 1; k < to; k++) { const B = BASES[k + 1]; t += BASE_LEN / v + (k > r.from + 1 ? .1 : 0); pts.push({ t, x: B[0], z: B[1] }); }
    if (outAt != null) pts[pts.length - 1].t = Math.min(pts[pts.length - 1].t, outAt + .15);
    sc.runners.push({ name: r.name, kind: r.kind, bat: !!r.bat, pts, out: outAt != null, outT: outAt }); return t;
  };
  const fieldPath = (f, x, z, t) => { const P = F[f]; sc.fielders[f] = [{ t: 0, x: P[0], z: P[1] }, { t: f === 1 ? .15 : .3, x: P[0], z: P[1] }, { t, x, z }]; };
  const fin = (outs, runs, nb, kind) => ({ sc, outs, runs, nb, kind });

  const hitPlay = (fb) => {
    let outs = 0, runs = 0; const nb = [null, null, null], P = [fb.x, fb.z], tc = fb.t;
    sc.ball = fl.pts.filter(p => p.t <= tc); fieldPath(fb.f, fb.x, fb.z, tc);
    const batR = runners[0], others = runners.slice(1).sort((a, c) => c.from - a.from), thr = (to, t0) => t0 + .45 + dist(P, BASES[to]) / THROW_SPEED;
    const forced = i => { for (let k = 0; k <= i; k++) if (!bases[k]) return false; return true; };
    const take = (r, to) => { if (to >= 4) { runs++; path(r, 4); } else { nb[to - 1] = r; path(r, to); } };
    if (Math.hypot(fb.x, fb.z) < INFIELD_R) {
      const tb1 = arrive(batR, 1);
      if (bases[0] && outs0 < OUTS_PER_INNING - 1 && !bunt) {                       // double play chance
        const r1 = runners.find(r => r.from === 0), t2 = thr(2, tc);
        if (t2 < arrive(r1, 2)) { const t21 = t2 + .35 + BASE_LEN * 1.414 / THROW_SPEED;
          if (t21 < tb1) { outs = 2; path(r1, 2, t2); path(batR, 1, t21);
            sc.throws.push({ t0: tc + .45, from: P, to: BASES[2], dur: t2 - tc - .45 }, { t0: t2 + .35, from: BASES[2], to: BASES[1], dur: BASE_LEN * 1.414 / THROW_SPEED });
            for (const r of others) if (r.from > 0) { if (forced(r.from) || r.from === 2 && outs0 + 2 < OUTS_PER_INNING) take(r, r.from + 2); else nb[r.from] = r; }
            sc.txt = '雙殺！'; sc.kind = 'ground'; fieldPath(3, BASES[2][0] + .6, BASES[2][1] - .4, t2); sc.dur = t21 + 1.4;
            return fin(outs, outs0 + 2 >= OUTS_PER_INNING ? 0 : runs, nb.map(keep), 'ground'); } } }
      const t1 = fb.f === 2 ? tc + dist(P, BASES[1]) / 7 : thr(1, tc);
      if (fb.f !== 2) fieldPath(2, BASES[1][0] - .6, BASES[1][1] - .4, Math.min(t1, 2.5));
      sc.throws.push({ t0: fb.f === 2 ? t1 : tc + .45, from: P, to: BASES[1], dur: fb.f === 2 ? 0 : t1 - tc - .45 });
      if (t1 < tb1 - .05) { outs = 1; path(batR, 1, t1);
        for (const r of others) { if (forced(r.from)) take(r, r.from + 2);
          else if (r.from === 2 && outs0 + 1 < OUTS_PER_INNING && fb.x > 0 && rnd() < .5) { runs++; path(r, 4); } else { nb[r.from] = r; path(r, r.from + 1); } }
        sc.txt = bunt ? (bases.some(x => x) ? '犧牲觸擊成功' : '觸擊被刺殺') : '滾地球出局'; sc.kind = bunt ? 'bunt' : 'ground'; }
      else { nb[0] = batR; path(batR, 1); for (const r of others) take(r, r.from + 2);
        sc.txt = bunt ? '觸擊安打！' : '內野安打！'; sc.kind = '1B'; sc.hit = true; }
      sc.dur = Math.max(t1, tb1) + 1.4; return fin(outs, runs, nb.map(keep), sc.kind);
    }
    let limit = 4, maxT = 0; sc.hit = true;                                         // outfield hit: each runner takes what he safely can, lead first
    for (const r of others) { let to = r.from + 2; while (to < 4 && arrive(r, to + 1) + .35 < thr(to + 1, tc)) to++;
      to = clampTo(to, limit);
      if (to >= 4) { runs++; maxT = Math.max(maxT, path(r, 4)); limit = 4; } else { nb[to - 1] = r; maxT = Math.max(maxT, path(r, to)); limit = to; } }
    let bt = 1; while (bt < 3 && bt + 1 < limit && arrive(batR, bt + 1) + .35 < thr(bt + 1, tc)) bt++;
    nb[bt - 1] = batR; maxT = Math.max(maxT, path(batR, bt));
    const tgt = Math.min(bt + 1, 3); sc.throws.push({ t0: tc + .45, from: P, to: BASES[tgt], dur: dist(P, BASES[tgt]) / THROW_SPEED });
    sc.kind = ['', '1B', '2B', '3B'][bt]; sc.txt = ['', '一壘安打', '二壘安打！', '三壘安打！'][bt]; sc.dur = Math.max(maxT, tc + 1) + 1.2;
    return fin(0, runs, nb.map(keep), sc.kind);
  };

  if (fl.hr) {
    let runs = 0; sc.ball = fl.pts; for (const r of runners) { path(r, 4); runs++; }
    const end = fl.pts[fl.pts.length - 1]; sc.kind = 'HR'; sc.txt = '全壘打！！'; sc.hit = true; sc.dur = Math.max(end.t + 1.2, 4);
    for (const f of [6, 7, 8]) fieldPath(f, F[f][0] * .7 + end.x * .3, F[f][1] * .7 + end.z * .3, 2.5);
    return fin(0, runs, [null, null, null], 'HR');
  }
  const fb = fieldIt(fl.pts, F);
  if (!fb) {                                                                        // nobody reached it: the nearest outfielder gets it late
    const last = fl.pts[fl.pts.length - 1]; let bf = 6, bd = 1e9;
    for (let f = 2; f < 9; f++) { const d = dist(F[f], [last.x, last.z]); if (d < bd) { bd = d; bf = f; } }
    return hitPlay({ f: bf, t: Math.max(.3 + bd / FSPD[bf], last.t), air: false, x: last.x, z: last.z });
  }
  if (!fb.air) return hitPlay(fb);
  sc.ball = fl.pts.filter(p => p.t <= fb.t); fieldPath(fb.f, fb.x, fb.z, fb.t);       // caught
  let runs = 0; const depth = Math.hypot(fb.x, fb.z), nb = bases.slice();
  sc.kind = fb.t < 1.2 && depth < INFIELD_R + 1 ? 'line' : 'fly'; sc.txt = depth < 35 ? (L.la > 45 ? '內野小飛球' : '平飛球被沒收') : `${FNAME[fb.f]}接殺`;
  if (bunt) { sc.txt = '觸擊小飛球被接殺'; sc.kind = 'bunt'; }
  if (bases[2] && outs0 + 1 < OUTS_PER_INNING && depth > TAG_UP_DEPTH) {
    const tr = fb.t + .3 + BASE_LEN / RS(bases[2].spd), tt = fb.t + .55 + dist([fb.x, fb.z], BASES[0]) / THROW_SPEED;
    if (tr < tt) { runs++; nb[2] = null; path({ from: 2, spd: bases[2].spd, name: bases[2].name, kind: bases[2].kind }, 4); sc.txt += '・高飛犧牲打';
      sc.throws.push({ t0: fb.t + .5, from: [fb.x, fb.z], to: BASES[0], dur: dist([fb.x, fb.z], BASES[0]) / THROW_SPEED }); } }
  if (bases[1] && !nb[2] && outs0 + 1 < OUTS_PER_INNING && depth > SECOND_ADVANCE_DEPTH && bases[1].spd >= 2 && rnd() < .6) { nb[2] = nb[1]; nb[1] = null; }
  const f = clamp((fb.t - .45) * RS(b.spd) / BASE_LEN, 0, 1);
  sc.runners.push({ name: b.name, kind: b.kind, bat: true, pts: [{ t: 0, x: 0, z: 0 }, { t: .45, x: 0, z: 0 }, { t: fb.t + .2, x: BASES[1][0] * Math.min(1, f), z: BASES[1][1] * Math.min(1, f) }], out: true, outT: fb.t });
  sc.dur = Math.max(fb.t + 1.6, 3);
  return fin(1, runs, nb.map(keep), sc.kind);
}
