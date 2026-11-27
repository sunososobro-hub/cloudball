/* #726: the rundown on a pickoff (engine #614 part 8: e.rd, plan.rundown, plan.rd), drawn from the plan only (rule 12; the engine
 * never reads this file, rule 10). Pure: no DOM, no three.js. Distances `d` are metres from first base along the line to second.
 *   rdRunner(S, u)          -> d of the runner, or null before he breaks (game.js keeps his lead walk) / after he is gone
 *   rdFirst(S, u)           -> [x, z] of the first baseman (his holding spot, then up the line, then at the runner)
 *   rdShort(S, u, ssSpot)   -> [x, z] of the shortstop (his spot, the bag at second, then running the runner back)
 *   rdBall(S, u)            -> null before the 1B catch, else { hold: '1B' | 'SS' } or { from, to, k } (k 0..1 of a throw)
 * The times are the engine's: P > 1B at arrive, 1B > SS at r1..r2, SS > 1B at s0..r3, tag at tagAt (plan.actions); the runner is
 * plan.rd.turn m out at r2 and plan.rd.tagPos m out at tagAt. tests/rundown_render.check.mjs samples them. */
import { BASES, BASE_PATH, runDist, runTime } from '../engine/rules/field.js';
import { RUN_SPEED, COVER_SPEED } from '../engine/constants.js';

export const RD_OFF = 1.6;      /* s after the tag when the runner is gone (game.js PO_OFF: a pickoff victim leaves the same way) */
export const RD_UP_BLEND = 0.6; /* s the first baseman takes to step from his holding spot onto the line after his throw */
export const RD_HOME_AT = 1.2;  /* s after the tag when the two fielders walk back to their spots */
export const RD_WALK_V = 2.5;   /* m/s of that walk */

const [X1, Z1] = BASES[1], [X2, Z2] = BASES[2], L12 = Math.hypot(X2 - X1, Z2 - Z1), UX = (X2 - X1) / L12, UZ = (Z2 - Z1) / L12;
const sat = x => x < 0 ? 0 : x > 1 ? 1 : x, ease = x => x * x * (3 - 2 * x), lerp2 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
/* the point d m from first toward second */
export const linePt = d => [X1 + UX * d, Z1 + UZ * d];
export const LINE_DIR = [UX, UZ];

export function rdRunner(S, u) {
  const R = S.rd;
  if (u < R.goAt || u > R.tagAt + RD_OFF) return null;
  if (u < R.r2) return Math.min(R.turn, S.lead + runDist(u - R.goAt, RUN_SPEED));
  if (u < R.backAt) return R.turn;
  if (u < R.tagAt) return R.turn - runDist(u - R.backAt, RUN_SPEED);
  return R.tagPos;
}

/* walk back from p to home after the tag */
function homeWalk(S, u, p, home) {
  const t = u - (S.rd.tagAt + RD_HOME_AT), D = Math.hypot(home[0] - p[0], home[1] - p[1]);
  return t <= 0 || D < 1e-6 ? p : lerp2(p, home, Math.min(1, t * RD_WALK_V / D));
}

export function rdFirst(S, u) {
  const R = S.rd, spot = S.CV.spot;
  let d;
  if (u < R.r1) return spot;
  if (u < R.r3) return lerp2(spot, linePt(R.up), ease(sat((u - R.r1) / Math.min(RD_UP_BLEND, R.r3 - R.r1))));
  d = R.up + runDist(Math.min(u, R.tagAt) - R.r3, COVER_SPEED);
  return homeWalk(S, u, linePt(d), spot);
}

export function rdShort(S, u, ssSpot) {
  const R = S.rd, bag = BASES[2], D = Math.hypot(bag[0] - ssSpot[0], bag[1] - ssSpot[1]);
  if (u < R.r2) {
    if (D < 1e-6) return bag;
    const go = R.ssAt - runTime(D, COVER_SPEED);
    return lerp2(ssSpot, bag, sat(runDist(u - go, COVER_SPEED) / D));
  }
  const d = BASE_PATH - runDist(Math.min(u, R.s0) - R.r2, COVER_SPEED);
  return homeWalk(S, u, linePt(d), ssSpot);
}

export function rdBall(S, u) {
  const R = S.rd;
  if (u < S.arrive) return null;
  if (u < R.r1) return { hold: '1B' };
  if (u < R.r2) return { from: '1B', to: 'SS', k: (u - R.r1) / (R.r2 - R.r1) };
  if (u < R.s0) return { hold: 'SS' };
  if (u < R.r3) return { from: 'SS', to: '1B', k: (u - R.s0) / (R.r3 - R.s0) };
  return { hold: '1B' };
}
