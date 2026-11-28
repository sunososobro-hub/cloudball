/* #890: the rundown off second (engine 0.4.41: play.rd2, plan.rd2), drawn from the plan only (rule 12; the engine never reads this
 * file, rule 10). Pure: no DOM, no three.js. Times are the plan's (seconds after contact). `d` is metres from second toward third.
 *   rd2Go(S, u)        -> true once he breaks for third (before: game.js keeps his lead stand)
 *   rd2Gone(S, u)      -> true RD2_OFF s after the tag (he has left)
 *   rd2Runner(S, u)    -> d of the runner: runs to plan.rd2.turn m, turns, runs back, is tagged at plan.rd2.tagPos m
 *   rd2Cover3(S, u, ret)        -> [x, z] of the third-base cover: the spot at third, then up the line (plan.rd2.s0 - arrive s), then home
 *   rd2Cover2(S, u, start, ret) -> [x, z] of the second-base cover: from his start to the bag, RD_2B_UP m up the line, then at the runner
 *   rd2Ball(S, u)      -> null before the cover has it, else { hold: 'key3' | 'key2' } or { k } (0..1 of the throw key3 > key2)
 * tests/rd2_render.check.mjs samples them against the plan. */
import { BASES, BASE_PATH, runDist } from '../engine/rules/field.js';
import { RUN_SPEED, COVER_SPEED, LEAD_PITCH, BAT_RUN_DELAY, FIELD_REACT, COVER_REACT, SECOND_TAG_OFF } from '../engine/constants.js';

export const RD2_OFF = 1.6;      /* s after the tag when the runner is gone (same as render/rundown.js RD_OFF) */
export const RD2_HOME_AT = 1.2;  /* s after the tag when the two fielders walk back to their spots */
export const RD2_WALK_V = 2.5;   /* m/s of that walk */
export const RD2_HOLD = 1.5;     /* s the ball stays in the tagger's hand after the tag */

const [X2, Z2] = BASES[2], [X3, Z3] = BASES[3], UX = (X3 - X2) / BASE_PATH, UZ = (Z3 - Z2) / BASE_PATH;
export const LINE_DIR = [UX, UZ];
export const SECOND_SPOT = [X2 + SECOND_TAG_OFF[0], Z2 + SECOND_TAG_OFF[1]];
const sat = x => x < 0 ? 0 : x > 1 ? 1 : x, lerp2 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
/* the point d m from second toward third */
export const linePt = d => [X2 + UX * d, Z2 + UZ * d];

function homeWalk(S, u, p, home) {
  const t = u - (S.rd2.tagAt + RD2_HOME_AT), D = Math.hypot(home[0] - p[0], home[1] - p[1]);
  return t <= 0 || D < 1e-6 ? p : lerp2(p, home, Math.min(1, t * RD2_WALK_V / D));
}

export const rd2Go = (S, u) => u >= BAT_RUN_DELAY;
export const rd2Gone = (S, u) => u > S.rd2.tagAt + RD2_OFF;

export function rd2Runner(S, u) {
  const R = S.rd2;
  if (u < R.backAt) return Math.min(R.turn, LEAD_PITCH + runDist(Math.max(0, u - BAT_RUN_DELAY), RUN_SPEED));
  if (u < R.tagAt) return R.turn - runDist(u - R.backAt, RUN_SPEED);
  return R.tagPos;
}

/* the cover at third holds the spot at the bag at arrive, runs the runner back toward second until he throws at s0 */
export function rd2Cover3(S, u, ret) {
  const R = S.rd2, sp = S.CV.spot, a = S.arrive, run = runDist(Math.max(0, Math.min(u, R.s0) - a), COVER_SPEED);
  return homeWalk(S, u, [sp[0] - UX * run, sp[1] - UZ * run], ret);
}

export function rd2Cover2(S, u, start, ret) {
  const R = S.rd2, c2 = S.actions.find(a => a.a === 'cover' && a.f === R.key2), at = c2 ? c2.t : 0, D = Math.hypot(SECOND_SPOT[0] - start[0], SECOND_SPOT[1] - start[1]);
  let d;
  if (u < at) return lerp2(start, SECOND_SPOT, D < 1e-6 ? 1 : sat(runDist(u - FIELD_REACT - COVER_REACT, COVER_SPEED) / D));
  d = u < R.r3 ? Math.min(R.up, runDist(u - at, COVER_SPEED)) : R.up + runDist(Math.min(u, R.tagAt) - R.r3, COVER_SPEED);
  return homeWalk(S, u, [SECOND_SPOT[0] + UX * d, SECOND_SPOT[1] + UZ * d], ret);
}

export function rd2Ball(S, u) {
  const R = S.rd2;
  if (u < S.arrive) return null;
  if (u < R.s0) return { hold: 'key3' };
  if (u < R.r3) return { k: (u - R.s0) / (R.r3 - R.s0) };
  return u < R.tagAt + RD2_HOLD ? { hold: 'key2' } : null;
}

