/* End of a game (#613, so 哥 2026-11-27: imitate a real game in full). Pure: no imports, no clock, no DOM. A pure function of (plan, time).
 * The END frame is open-ended in the engine (d 1e9); the viewer used to hide every fielder but P and C and stop. Now, from the event's own
 * data (rule 12: final score, who batted, walk-off = the home side was batting):
 *   winners = the fielding side (it leads after the top of the last inning): jog to the ring between mound and plate, slap hands;
 *   winners = the batting side (walk-off): run out of their dugout and mob the scorer at home plate;
 *   the winners then line up behind home plate, face the stands and bow (CPBL custom), then walk to their dugout and are gone;
 *   losers who are on the field (the fielding side of a walk-off, both sides of a tie) walk to their dugout from the first second;
 *   the four umpires meet and walk off together.
 * Nobody appears or vanishes (#42): everybody starts where the last pitch frame left him (the fielders on their spots, the walk-off scorer at
 * the plate) or comes out of his dugout; leaving figures end hidden in the dugout (or the umpires' exit), like the coaches' jog at END.
 * game.js: poseFinale() feeds `finaleAt` into the figures; tests/finale.check.mjs checks the plan. */
export const FIN_RUN = 5.5;          /* m/s winners run in to the ring or the mob */
export const FIN_GAP = .22;          /* s between winners leaving the dugout (walk-off) */
export const FIN_MOUND = [0, -9.2];  /* centre of the handshake ring: between mound and home plate */
export const FIN_RING_R = 1.8;       /* m, handshake ring radius */
export const FIN_HOME = [0, .9];     /* the scorer's spot at home plate (walk-off mob centre) */
export const FIN_MOB_R = 1.0;        /* m, mob ring radius round the scorer */
export const FIN_CHEER = 2.6;        /* s the handshakes last once the last winner is in */
export const FIN_MOB_CHEER = 3.6;    /* s the mob lasts once the last winner is in */
export const FIN_HOP = .1;           /* m, hop while slapping hands */
export const FIN_MOB_HOP = .28;      /* m, hop in the mob */
export const FIN_LINE_Z = 7;         /* m, the bowing line stands this far behind home plate (+z), facing the stands */
export const FIN_LINE_SP = 1.15;     /* m between neighbours in the line */
export const FIN_WALK = 3.2;         /* m/s walking to the line and to the dugout */
export const FIN_BOW = 2.4;          /* s one bow lasts: down, held, up */
export const FIN_BOW_WAIT = .3;      /* s the line stands still before the bow */
export const FIN_LEAVE_WAIT = .5;    /* s after the bow before the first one leaves */
export const FIN_LEAVE_GAP = .18;    /* s between winners leaving */
export const FIN_LOSE_AT = .8;       /* s before the first loser turns for his dugout */
export const FIN_LOSE_GAP = .2;      /* s between losers leaving */
export const FIN_LOSE_V = 3.6;       /* m/s losers walk off */
export const FIN_UMP_AT = 1;         /* s before the umpires start to gather */
export const FIN_UMP_V = 2.8;        /* m/s umpires walk */
export const FIN_UMP_GATHER = [-8, 4.2];
export const FIN_UMP_SP = 1.1;       /* m between umpires walking off side by side */
export const FIN_UMP_EXIT = [-24, 6];
export const FIN_UMP_WAIT = .5;      /* s the crew stands together before the walk off */

const lerp = (a, b, t) => a + (b - a) * t;
const sat = t => t < 0 ? 0 : t > 1 ? 1 : t;
const ease = t => { t = sat(t); return t * t * (3 - 2 * t); };
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const mid = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
const dirOf = (a, b) => { const d = dist(a, b); return d > 1e-6 ? [(b[0] - a[0]) / d, (b[1] - a[1]) / d] : null; };

/* A frame: {x, z, fx, fz (facing), vis, arms 0..1 (raised), hop (m), bow 0..1, mode} */
const frame = (p, f, o) => ({ x: p[0], z: p[1], fx: f[0], fz: f[1], vis: true, arms: 0, hop: 0, bow: 0, mode: 'stand', ...o });

/* The bow curve over time since the bow starts: down, held, up */
export const bowAt = s => { s = s / FIN_BOW; return s <= 0 || s >= 1 ? 0 : s < .33 ? ease(s / .33) : s < .66 ? 1 : 1 - ease((s - .66) / .34) };

/* plan = { winner: 'def' | 'off' | null,   winners: who got the last out (fielding) or the last run (batting); null = a tie
 *          fielders: [[x,z] x n]   the fielding side where the last pitch frame left them (all of them, P and C included)
 *          nOff: how many batting-side figures are free to run out for a walk-off mob (the scorer included)
 *          dugDef, dugOff: [x,z] the two dugouts, umps: [[x,z] x 4] the plate umpire first }
 * Returns { W: [fig], L: [fig], U: [fig], end, bowAt (s), lineAt }; fig.at(u) = a frame. */
export function finalePlan(o) {
  const { winner } = o, fl = o.fielders || [], dugW = winner === 'off' ? o.dugOff : o.dugDef, dugL = winner === 'off' ? o.dugDef : o.dugOff;
  const W = [], L = [], U = [];
  let tBow = 0, end = 0;
  const winners = [];
  if (winner === 'def') fl.forEach((s, i) => winners.push({ S: s, d: 0, vis0: true, i }));
  else if (winner === 'off') for (let i = 0; i < (o.nOff || 0); i++) winners.push(i === 0 ? { S: FIN_HOME, d: 0, vis0: true, i } : { S: dugW, d: i * FIN_GAP, vis0: false, i });
  const n = winners.length, mob = winner === 'off', C = mob ? FIN_HOME : FIN_MOUND;
  /* ring spots (the scorer stands in the middle of the mob) */
  winners.forEach(w => {
    if (mob && w.i === 0) w.G = FIN_HOME;
    else { const m = mob ? n - 1 : n, k = mob ? w.i - 1 : w.i, a = Math.PI * 2 * k / Math.max(m, 1) + Math.PI / 2, R = mob ? FIN_MOB_R : FIN_RING_R; w.G = [C[0] + Math.cos(a) * R, C[1] + Math.sin(a) * R * (mob ? 1 : 1)] }
    w.T = w.d + dist(w.S, w.G) / FIN_RUN;
  });
  const tA = winners.reduce((m, w) => Math.max(m, w.T), 0), tC = tA + (mob ? FIN_MOB_CHEER : FIN_CHEER);
  /* line slots in order of the ring's x, so the walks to the line do not cross */
  const order = winners.slice().sort((a, b) => a.G[0] - b.G[0] || a.G[1] - b.G[1]);
  order.forEach((w, k) => { w.Ln = [(k - (n - 1) / 2) * FIN_LINE_SP, FIN_LINE_Z]; w.T2 = tC + dist(w.G, w.Ln) / FIN_WALK });
  const tB = winners.reduce((m, w) => Math.max(m, w.T2), 0);
  tBow = tB + FIN_BOW_WAIT;
  const tOut = tBow + FIN_BOW + FIN_LEAVE_WAIT;
  winners.forEach((w, k) => {
    w.D = tOut + k * FIN_LEAVE_GAP; w.T3 = w.D + dist(w.Ln, dugW) / FIN_WALK; end = Math.max(end, w.T3);
    const toC = dirOf(w.G, C) || [0, 1];
    W.push({
      i: w.i, line: w.Ln, ring: w.G, arrive: w.T, leaves: w.D, gone: w.T3,
      at(u) {
        if (u < w.d) return frame(w.S, dirOf(w.S, w.G) || toC, { vis: w.vis0 });
        if (u < w.T) { const t = (u - w.d) / (w.T - w.d), d = dirOf(w.S, w.G) || toC; return frame(mid(w.S, w.G, t), d, { mode: 'run' }) }
        if (u < tC) { const sc = mob && w.i === 0; return frame(w.G, sc ? [0, 1] : toC, { mode: 'cheer', arms: 1, hop: Math.abs(Math.sin((u - w.T) * 9 + w.i * 1.7)) * (mob ? FIN_MOB_HOP : FIN_HOP) }) }
        if (u < w.T2) { const t = (u - tC) / (w.T2 - tC), d = dirOf(w.G, w.Ln) || [0, 1]; return frame(mid(w.G, w.Ln, t), d, { mode: 'walk' }) }
        if (u < w.D) return frame(w.Ln, [0, 1], { mode: 'line', bow: bowAt(u - tBow) });
        if (u < w.T3) { const t = (u - w.D) / (w.T3 - w.D), d = dirOf(w.Ln, dugW) || [0, -1]; return frame(mid(w.Ln, dugW, t), d, { mode: 'walk' }) }
        return frame(dugW, [0, -1], { vis: false, mode: 'gone' });
      }
    });
  });
  /* losers still on the field */
  const losers = winner === 'def' ? [] : fl;
  losers.forEach((s, i) => {
    const d = FIN_LOSE_AT + i * FIN_LOSE_GAP, T = d + dist(s, dugL) / FIN_LOSE_V, dr = dirOf(s, dugL) || [0, -1], f0 = dirOf(s, [0, 0]) || [0, 1];
    end = Math.max(end, T);
    L.push({ i, gone: T, at(u) { if (u < d) return frame(s, f0); if (u < T) return frame(mid(s, dugL, (u - d) / (T - d)), dr, { mode: 'walk' }); return frame(dugL, dr, { vis: false, mode: 'gone' }) } });
  });
  /* the crew: gather, stand together a moment, walk off abreast */
  const us = o.umps || [], tG = us.map((s, j) => FIN_UMP_AT + dist(s, [FIN_UMP_GATHER[0], FIN_UMP_GATHER[1] + (j - (us.length - 1) / 2) * FIN_UMP_SP]) / FIN_UMP_V), tGo = Math.max(0, ...tG) + FIN_UMP_WAIT;
  us.forEach((s, j) => {
    const G = [FIN_UMP_GATHER[0], FIN_UMP_GATHER[1] + (j - (us.length - 1) / 2) * FIN_UMP_SP], E = [FIN_UMP_EXIT[0], FIN_UMP_EXIT[1] + (j - (us.length - 1) / 2) * FIN_UMP_SP];
    const T = tGo + dist(G, E) / FIN_UMP_V, dg = dirOf(s, G) || [-1, 0], de = dirOf(G, E) || [-1, 0], f0 = dirOf(s, [0, 0]) || [0, 1];
    end = Math.max(end, T);
    U.push({ i: j, gone: T, at(u) {
      if (u < FIN_UMP_AT) return frame(s, f0);
      if (u < tG[j]) return frame(mid(s, G, (u - FIN_UMP_AT) / (tG[j] - FIN_UMP_AT)), dg, { mode: 'walk' });
      if (u < tGo) return frame(G, [0, 1], { mode: 'stand' });
      if (u < T) return frame(mid(G, E, (u - tGo) / (T - tGo)), de, { mode: 'walk' });
      return frame(E, de, { vis: false, mode: 'gone' });
    } });
  });
  return { W, L, U, end, tBow, tCheerEnd: tC, tArrive: tA, mob, n };
}

/* The side that won: 'def' / 'off' / null for a tie. sc = final score [road, home]; off = the side that was batting (e.s0.half), 0 road. */
export const winnerSide = (sc, off) => !sc || sc[0] === sc[1] ? null : (sc[0] > sc[1] ? 0 : 1) === off ? 'off' : 'def';
