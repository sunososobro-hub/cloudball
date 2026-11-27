/* #611 part 3: the pitching change (engine CHG frame, CHANGE_DUR s) without a pop-in (pure, no DOM, no three.js).
 * Before this the mound kept the old pitcher's figure for the whole frame and swapped his number on the next pitch frame.
 * Now the old pitcher walks to his dugout (oldAt) and the reliever comes in from his bullpen gate and stops on the rubber (newAt).
 * Read from the engine frame only (rule 12); the engine never reads this file (rule 10): frame lengths and outcomes stay.
 * Timing mirrors engine/constants.js: CW_SIGNAL = RELIEF_SIGNAL_DUR (the manager signals the bullpen), CW_JOG = BULLPEN_JOG_M / RELIEF_JOG_SPEED
 * (the reliever's jog in); tests/chgwalk.check.mjs fails when they drift apart.
 *   oldAt(mound, dug, u, d) -> [x, z, faceX, faceZ] | null (null = in the dugout)
 *   newAt(mound, gate, u)   -> [x, z, faceX, faceZ] | null (null = still behind the bullpen gate)
 * mound = [x, z] of the rubber spot, dug = the fielding team's dugout [x, z], gate = bullpenGate(dug). */
export const CW_SIGNAL = 14;     /* s into the frame when the reliever leaves the bullpen gate */
export const CW_JOG = 25;        /* s from the gate to the rubber */
export const CW_OLD_GO = 8;      /* s into the frame when the old pitcher turns for the dugout (the manager is on the mound by then) */
export const CW_OLD_V = 2.4;     /* m/s, a walk; faster only when the frame is short */
export const CW_OLD_END_GAP = 1; /* s before the frame end when he is in the dugout at the latest */
export const CW_HAND = 2;        /* s the ball takes from the manager's hand to the reliever's glove, from the moment the reliever reaches the rubber */
export const CW_LANE = 1;        /* m the old pitcher keeps beside the manager's line to the mound */
export const CW_LANE_IN = 3;     /* m from the mound over which that side step grows */
export const CW_GATE_S = 75;     /* m from home along the foul line: the bullpen gate (render/props/bullpens.js strip, BP.S0..S1) */
export const CW_GATE_D = 12;     /* m outside that line (BP.LANES) */

export const CW_EXIT_S = 61.5;   /* #611 part 6: m from home where he leaves the pen, past the strip's home end (BP.S0 62.6), in front of the bench */
export const CW_EXIT_D = 11.4;   /* m off the line: the aisle between the two lanes (BP.LANES 9.9 / 12.9), so he never crosses a lane's mound or plate */

const sat = x => x < 0 ? 0 : x > 1 ? 1 : x, R2 = Math.SQRT1_2;
/* the gate of the bullpen on the dugout's side: x sign follows the dugout, the outfield is -z (game.js dugout(), BASES) */
export const bullpenGate = dug => { const s = dug[0] < 0 ? -1 : 1; return [s * (CW_GATE_S + CW_GATE_D) * R2, (CW_GATE_D - CW_GATE_S) * R2]; };

/* the pen exit on the dugout's side: the gate's side, CW_EXIT_S out and CW_EXIT_D off the line */
export const bullpenExit = dug => { const s = dug[0] < 0 ? -1 : 1; return [s * (CW_EXIT_S + CW_EXIT_D) * R2, (CW_EXIT_D - CW_EXIT_S) * R2]; };

export function oldAt(mound, dug, u, d) {
  const dx = dug[0] - mound[0], dz = dug[1] - mound[1], L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
  const v = Math.max(CW_OLD_V, L / Math.max(d - CW_OLD_GO - CW_OLD_END_GAP, 1e-3)), s = Math.max(0, u - CW_OLD_GO) * v;
  if (s >= L) return null;
  if (!(s > 0)) return [mound[0], mound[1], -mound[0], -mound[1]];/* still on the mound, facing home */
  const o = CW_LANE * sat(s / CW_LANE_IN);
  return [mound[0] + ux * s - uz * o, mound[1] + uz * s + ux * o, dx, dz];
}

/* #611 part 6: with `exit` (bullpenExit) he jogs inside the pen first: gate -> along the aisle between the lanes to the exit -> over foul ground to the
 * rubber; the pace is even over the whole route and he is on the rubber at the same time as before (CW_SIGNAL + CW_JOG). No exit -> the old straight line. */
export function newAt(mound, gate, u, exit) {
  if (!(u >= CW_SIGNAL)) return null;
  const k = sat((u - CW_SIGNAL) / CW_JOG);
  if (k >= 1) return [mound[0], mound[1], -mound[0], -mound[1]];/* on the rubber, facing home */
  const pts = exit ? [gate, exit, mound] : [gate, mound], seg = [];
  let L = 0;
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); L += l; }
  let r = k * L;
  for (let i = 0; i < seg.length; i++) {
    if (r <= seg[i] || i === seg.length - 1) {
      const a = pts[i], b = pts[i + 1], f = seg[i] > 0 ? r / seg[i] : 1;
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, b[0] - a[0], b[1] - a[1]];
    }
    r -= seg[i];
  }
}

/* #611 part 4: who holds the ball on a CHG frame (pure). The old pitcher gives it to the manager at CW_OLD_GO; the manager holds it until the
 * reliever is on the rubber (CW_SIGNAL + CW_JOG), hands it over in CW_HAND s, and the reliever keeps it to the frame end (his warm-up pitches follow in #610).
 *   holdAt(hasManager, u) -> null (old pitcher still has it) | {who: 'mgr'} | {who: 'move', k: 0..1 manager -> reliever} | {who: 'P'}
 * No manager walk in this frame (too short) -> the ball is not shown until the reliever has it. */
export function holdAt(hasManager, u) {
  const t = CW_SIGNAL + CW_JOG;
  if (u >= t + CW_HAND) return { who: 'P' };
  if (!hasManager || !(u >= CW_OLD_GO)) return null;
  if (u < t) return { who: 'mgr' };
  return { who: 'move', k: sat((u - t) / CW_HAND) };
}

/* #611 part 5: the reliever's warm-up pitches on the mound (engine RELIEF_WARMUP_PITCHES x WARMUP_PITCH_GAP, OBR 5.07(b)), right after the
 * hand-over. Each cycle of CW_WARM_GAP s: wind-up (game.js plays pen.js throwHands, its release at CW_WARM_REL), the ball flies to the
 * crouched catcher, he holds it, lobs it back to the reliever's glove. Only whole cycles that end inside the frame are drawn.
 *   warmAt(u, d) -> null (no warm-up now) | {n: 0..CW_WARM_N-1, tt: s into the cycle, ball: 'P' | 'fly' | 'C' | 'back', k: 0..1 along a flight}
 *   warmBall(st, rel, mitt, glove) -> [x, y, z] | null (null = in the pitcher's hand, game.js draws it there)
 *   warmEnd(d) -> s into the frame when the last warm-up ball is back in the glove */
export const CW_WARM_N = 8;       /* warm-up pitches (= engine RELIEF_WARMUP_PITCHES) */
export const CW_WARM_GAP = 9;     /* s per warm-up pitch (= engine WARMUP_PITCH_GAP) */
export const CW_WARM_REL = 2.62;  /* s into a cycle when the ball leaves his hand: pen.js throwHands reaches THROW_OUT at .82 of PEN_THROW_PERIOD 3.2 */
export const CW_WARM_FLY = .65;   /* s release -> mitt: ~18 m at ~28 m/s, an easy warm-up toss */
export const CW_WARM_HOLD = 1.5;  /* s the catcher holds the ball before throwing it back */
export const CW_WARM_RET = 1.2;   /* s of the catcher's lob back to the mound */
export const CW_WARM_PEAK = .3;   /* m the warm-up pitch rises above the straight line */
export const CW_WARM_LOB = 1.2;   /* m the return lob rises above the straight line */

export const warmStart = () => CW_SIGNAL + CW_JOG + CW_HAND;
export const warmEnd = d => { const n = Math.min(CW_WARM_N, Math.floor((d - warmStart()) / CW_WARM_GAP + 1e-9)); return n > 0 ? warmStart() + (n - 1) * CW_WARM_GAP + CW_WARM_REL + CW_WARM_FLY + CW_WARM_HOLD + CW_WARM_RET : warmStart(); };

export function warmAt(u, d) {
  const s = u - warmStart();
  if (!(s >= 0)) return null;
  const n = Math.floor(s / CW_WARM_GAP);
  if (n >= CW_WARM_N || warmStart() + (n + 1) * CW_WARM_GAP > d) return null;
  const tt = s - n * CW_WARM_GAP, a = CW_WARM_REL, b = a + CW_WARM_FLY, c = b + CW_WARM_HOLD, e = c + CW_WARM_RET;
  if (tt < a || tt >= e) return { n, tt, ball: 'P', k: 0 };
  if (tt < b) return { n, tt, ball: 'fly', k: (tt - a) / CW_WARM_FLY };
  if (tt < c) return { n, tt, ball: 'C', k: 0 };
  return { n, tt, ball: 'back', k: (tt - c) / CW_WARM_RET };
}

const arcPt = (p, q, k, h) => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k + 4 * h * k * (1 - k), p[2] + (q[2] - p[2]) * k];
export function warmBall(st, rel, mitt, glove) {
  if (!st || st.ball === 'P') return null;
  if (st.ball === 'fly') return arcPt(rel, mitt, st.k, CW_WARM_PEAK);
  if (st.ball === 'C') return [mitt[0], mitt[1], mitt[2]];
  return arcPt(mitt, glove, st.k, CW_WARM_LOB);
}
