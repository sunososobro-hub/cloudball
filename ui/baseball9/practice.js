/* 九宮格棒球 practice modes (#332 part 1): the rules of the owner's prototype (ui/ref/baseball_9grid/) without innings, AI teams,
 * ball physics or any DOM / three.js. Ported as it is: TYPES, PT, guessSet, the AI pick and swing, `resolve`. Pure functions, local only:
 * nothing here touches engine/ or league data (rule 10); the result is a score for the screen, never an ability change.
 * Bat practice: you guess a cell (mode one / row / col / box / take / bunt), the computer pitches.
 * Pitch practice: you pick a pitch type and a target cell (5x5, the ring is outside the zone), the computer swings. */

export const PRACTICE_PITCHES = 10;   // pitches in one practice session
export const FULL_AT = 4;             // successes that earn tier 'full' (fewer = 'half'); tune here
export const HIT_Q = 0.72;            // contact quality that counts as a hit (the prototype's "hard contact" step); below it the ball is an out
export const STAMINA = 100;           // the prototype's pitcher stamina; each pitch type has a cost

export const TYPES = {
  hi: { n: '高球殺手', h: [1, 1, 1, 0, 0, 0, -1, -1, -1] }, lo: { n: '低球專家', h: [-1, -1, -1, 0, 0, 0, 1, 1, 1] },
  pull: { n: '內角拉打', h: [1, 0, -1, 1, 0, -1, 1, 0, -1] }, push: { n: '外角推打', h: [-1, 0, 1, -1, 0, 1, -1, 0, 1] },
  mid: { n: '中路重砲', h: [-1, 0, -1, 0, 1, 0, -1, 0, -1] }, diag: { n: '對角線', h: [1, 0, -1, 0, 1, 0, -1, 0, 1] },
};
export const PT = {
  fb: { n: '直球', cost: 1, q: 0, miss: 0 }, heat: { n: '全力速球', cost: 4, q: -.15, miss: .08, whiff: .15 },
  curve: { n: '曲球', cost: 3, q: -.05, miss: .04, chase: .2 }, change: { n: '變速球', cost: 2, q: 0, oneQ: -.28, miss: .02 },
};
export const MODE = { one: '精準', row: '橫排', col: '直列', box: '四格', take: '不揮', bunt: '觸擊' };
const BASE_Q = { one: 1.1, row: .92, col: .92, box: .8 }, FOUL_ADJ = .46, WEAK_ADJ = .36;
const GAP_THRESHOLD = { tired: 25 };   // stamina under this: the pitcher is tired (more misses, easier contact)

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const inZ = (r, c) => r > 0 && r < 4 && c > 0 && c < 4;
export const sIdx = (r, c) => (r - 1) * 3 + (c - 1);
const rander = rnd => ({ rand: (a, b) => a + rnd() * (b - a),
  pick(ws) { let t = ws.reduce((a, b) => a + b.w, 0) * rnd(); for (const o of ws) { t -= o.w; if (t <= 0) return o; } return ws[ws.length - 1]; } });

/** Cells (zone coordinates 0..2) the guess covers. */
export function guessSet(mode, r, c) {
  if (mode === 'take' || mode === 'bunt' || r == null) return [];
  const R = clamp(r, 1, 3) - 1, C = clamp(c, 1, 3) - 1;
  if (mode === 'one') return [[R, C]];
  if (mode === 'row') return [0, 1, 2].map(k => [R, k]);
  if (mode === 'col') return [0, 1, 2].map(k => [k, C]);
  const r0 = Math.min(R, 1), c0 = Math.min(C, 1);
  return [[r0, c0], [r0, c0 + 1], [r0 + 1, c0], [r0 + 1, c0 + 1]];
}

/** One pitch against one swing (the prototype's `resolve`, strikes 0 balls 0 in practice). `batter` = {type:TYPES[k], con}. */
export function resolve(p, sw, ptk, { batter, tired, hold = false, strikes = 0, rnd = Math.random }) {
  const { rand } = rander(rnd), pt = PT[ptk];
  let r = p.r, c = p.c, missed = false;
  if (inZ(r, c)) {
    const corner = r !== 2 && c !== 2, edge = !corner && (r !== 2 || c !== 2);
    const miss = (corner ? .16 : edge ? .05 : 0) + (hold ? .06 : 0) + pt.miss + (tired ? .08 : 0);
    if (rnd() < miss) { missed = true;
      if (corner) { rnd() < .5 ? r += r < 2 ? -1 : 1 : c += c < 2 ? -1 : 1; } else if (r !== 2) r += r < 2 ? -1 : 1; else if (c !== 2) c += c < 2 ? -1 : 1; else r += 1; }
  }
  const zoneOk = inZ(r, c), out = { pitch: { r, c }, missed, kind: '', q: 0, pt: ptk };
  if (sw.mode === 'take') { out.kind = zoneOk ? 'called' : 'ball'; return out; }
  if (sw.mode === 'bunt') {
    if (zoneOk) out.kind = rnd() < (r === 1 ? .65 : .85) ? (rnd() < (r === 1 ? .22 : .05) ? 'popup' : 'bunt') : 'foulBunt';
    else out.kind = rnd() < .5 ? 'foulBunt' : 'whiff';
    return out;
  }
  const covered = zoneOk && sw.set.some(([R, C]) => R === r - 1 && C === c - 1);
  const adj = sw.set.some(([R, C]) => Math.max(Math.abs(R + 1 - r), Math.abs(C + 1 - c)) === 1);
  if (covered) {
    out.q = BASE_Q[sw.mode] + batter.type.h[sIdx(r, c)] * .3 + batter.con + rand(-.25, .25) + pt.q + (sw.mode === 'one' && pt.oneQ ? pt.oneQ : 0) + (tired ? .12 : 0);
    out.kind = 'contact'; return out;
  }
  if (zoneOk) {
    const bx = sw.mode === 'box' ? .2 : 0, wh = pt.whiff || 0;
    if (adj) { const x = rnd(); if (x < FOUL_ADJ + bx - wh) { out.kind = 'foul'; return out; }
      if (x < FOUL_ADJ + bx - wh + WEAK_ADJ) { out.kind = 'contact'; out.q = rand(.45, .85) + batter.con + pt.q * .5; return out; } }
    out.kind = strikes === 2 && rnd() < .55 + bx - wh ? 'foul' : 'whiff'; return out;
  }
  const ch = pt.chase || 0;
  if (adj) { const x = rnd(); if (x < .4 + ch) { out.kind = 'whiff'; return out; } if (x < .68 + ch * .5) { out.kind = 'contact'; out.q = rand(.3, .65); return out; } out.kind = 'ball'; return out; }
  out.kind = rnd() < .85 - ch ? 'ball' : 'whiff'; return out;
}

/** The computer pitcher (prototype `aiPitch`, no runners): avoids what you guessed lately and the batter's hot cells. */
export function aiPitch(batter, guessHist, stamina, rnd) {
  const { pick } = rander(rnd), h = batter.type.h, g = Array(9).fill(0);
  for (const set of guessHist.slice(-12)) for (const [r, c] of set) g[r * 3 + c]++;
  const gm = Math.max(1, ...g), opts = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    let w;
    if (inZ(r, c)) { const i = sIdx(r, c); w = h[i] > 0 ? .45 : h[i] < 0 ? 1.7 : 1; if (r === 2 && c === 2) w *= .75; w /= 1 + 1.3 * g[i] / gm; }
    else w = (r === 0 || r === 4) && (c === 0 || c === 4) ? .08 : .55;
    opts.push({ r, c, w });
  }
  const oneRate = guessHist.slice(-8).filter(s => s.length === 1).length;
  const types = [{ p: 'fb', w: 2 }, { p: 'heat', w: stamina > 30 ? .5 : 0 }, { p: 'curve', w: stamina > 20 ? .6 : 0 }, { p: 'change', w: stamina > 12 ? .5 + oneRate * .3 : 0 }];
  return Object.assign(pick(opts), { pt: pick(types).p });
}

/** The computer batter (prototype `aiSwing`, no runners): looks where you threw lately. */
export function aiSwing(batter, pitchHist, rnd) {
  const { pick } = rander(rnd), f = Array(25).fill(1);
  for (const p of pitchHist.slice(-14)) f[p.r * 5 + p.c] += 2.2;
  if (rnd() < .2) return { mode: 'take', set: [] };
  const mode = pick([['one', .22], ['row', .28], ['col', .27], ['box', .23]].map(m => ({ m: m[0], w: m[1] }))).m, opts = [];
  for (let r = 1; r < 4; r++) for (let c = 1; c < 4; c++) {
    const set = guessSet(mode, r, c); let sc = 0;
    for (const [R, C] of set) sc += f[(R + 1) * 5 + C + 1] * (1 + .25 * batter.type.h[R * 3 + C]);
    opts.push({ set, w: Math.pow(sc, 2.2) });
  }
  return { mode, set: pick(opts).set };
}

const tierOf = n => n >= FULL_AT ? 'full' : 'half';
const contactHit = o => (o.kind === 'contact' && o.q >= HIT_Q) || o.kind === 'bunt';
// pitching: you win the pitch when the batter does not get a hit and the pitch was not a ball
const pitchWin = o => (o.kind === 'whiff' || o.kind === 'called' || o.kind === 'popup' || o.kind === 'foul' || o.kind === 'foulBunt' || (o.kind === 'contact' && o.q < HIT_Q));

/** A practice session. `side` 'bat' | 'pitch'; `batterType` key of TYPES (the computer batter when you pitch, your own when you bat). */
export function createPractice(side, { rnd = Math.random, batterType = 'mid', con = 0 } = {}) {
  if (side !== 'bat' && side !== 'pitch') throw new Error('side must be bat or pitch');
  const batter = { type: TYPES[batterType] || TYPES.mid, con };
  const S = { side, pitches: 0, hits: 0, stamina: STAMINA, guessHist: [], pitchHist: [], log: [], done: false };
  const result = () => ({ side, mode: 'practice', hits: S.hits, pitches: S.pitches, tier: tierOf(S.hits) });
  function finish() { if (S.pitches >= PRACTICE_PITCHES) S.done = true; return S.done ? result() : null; }
  return {
    S, result,
    /** Bat: `guess` = {mode, r, c} (r, c 1..3). The computer pitches. Returns {out, done, result}. */
    swing(guess) {
      if (side !== 'bat' || S.done) throw new Error('not a batting practice in progress');
      const set = guessSet(guess.mode, guess.r, guess.c), p = aiPitch(batter, S.guessHist, S.stamina, rnd);
      S.stamina = Math.max(0, S.stamina - PT[p.pt].cost);
      const out = resolve(p, { mode: guess.mode, set }, p.pt, { batter, tired: S.stamina < GAP_THRESHOLD.tired, rnd });
      S.guessHist.push(set); S.pitches++; if (contactHit(out)) S.hits++; S.log.push(out);
      return { out, done: S.done || !!finish(), result: result() };
    },
    /** Pitch: `throwing` = {pt, r, c} (r, c 0..4). Costs stamina; a tired arm throws loose. The computer swings. */
    pitch(throwing) {
      if (side !== 'pitch' || S.done) throw new Error('not a pitching practice in progress');
      const pt = PT[throwing.pt]; if (!pt) throw new Error('unknown pitch ' + throwing.pt);
      if (S.stamina < pt.cost) throw new Error('not enough stamina for ' + throwing.pt);
      S.stamina -= pt.cost;
      const sw = aiSwing(batter, S.pitchHist, rnd), p = { r: clamp(throwing.r, 0, 4), c: clamp(throwing.c, 0, 4) };
      const out = resolve(p, sw, throwing.pt, { batter, tired: S.stamina < GAP_THRESHOLD.tired, rnd });
      S.pitchHist.push(p); S.pitches++; if (pitchWin(out)) S.hits++; S.log.push(out);
      return { out, done: S.done || !!finish(), result: result() };
    },
  };
}
