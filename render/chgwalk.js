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
export const CW_LANE = 1;        /* m the old pitcher keeps beside the manager's line to the mound */
export const CW_LANE_IN = 3;     /* m from the mound over which that side step grows */
export const CW_GATE_S = 75;     /* m from home along the foul line: the bullpen gate (render/props/bullpens.js strip, BP.S0..S1) */
export const CW_GATE_D = 12;     /* m outside that line (BP.LANES) */

const sat = x => x < 0 ? 0 : x > 1 ? 1 : x, R2 = Math.SQRT1_2;
/* the gate of the bullpen on the dugout's side: x sign follows the dugout, the outfield is -z (game.js dugout(), BASES) */
export const bullpenGate = dug => { const s = dug[0] < 0 ? -1 : 1; return [s * (CW_GATE_S + CW_GATE_D) * R2, (CW_GATE_D - CW_GATE_S) * R2]; };

export function oldAt(mound, dug, u, d) {
  const dx = dug[0] - mound[0], dz = dug[1] - mound[1], L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
  const v = Math.max(CW_OLD_V, L / Math.max(d - CW_OLD_GO - CW_OLD_END_GAP, 1e-3)), s = Math.max(0, u - CW_OLD_GO) * v;
  if (s >= L) return null;
  if (!(s > 0)) return [mound[0], mound[1], -mound[0], -mound[1]];/* still on the mound, facing home */
  const o = CW_LANE * sat(s / CW_LANE_IN);
  return [mound[0] + ux * s - uz * o, mound[1] + uz * s + ux * o, dx, dz];
}

export function newAt(mound, gate, u) {
  if (!(u >= CW_SIGNAL)) return null;
  const k = sat((u - CW_SIGNAL) / CW_JOG);
  if (k >= 1) return [mound[0], mound[1], -mound[0], -mound[1]];/* on the rubber, facing home */
  return [gate[0] + (mound[0] - gate[0]) * k, gate[1] + (mound[1] - gate[1]) * k, mound[0] - gate[0], mound[1] - gate[1]];
}
