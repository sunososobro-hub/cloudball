/* #609 part 2: line umpire signals (pure, no DOM, no three.js). Read from the engine event only (rule 12); a pure function
 * of (event, time), like plateSignal in umpsig.js. b = 1 is U1 (right line, first base side), b = 3 is U3 (left line).
 *   foul   (e.r 'foul', e.foulDir)  both arms straight up, from the umpire of the side the ball went (foulDir > 0 = right)
 *   fair   (inplay, |spray| within LINE_NEAR deg of a line)  the arm on the fair side points into fair ground
 *   homer  (play.res 'HR')  the umpire of that side (spray >= 0 = U1) raises one index finger and circles it
 * lineSignal(e, u, b, T) -> null | {kind, w, arms}: w 0..1 is how far he is into the signal (0 = hands at rest),
 * arms = [rx,ry,rz, lx,ly,lz], the hand targets in the umpire's own frame (+z forward, +x his RIGHT), the frame of umpsig.js.
 * T = {ARRIVE} from the engine, so a changed engine timing moves the signal with it. The engine records only the SIDE of a foul,
 * not how near the line it was, so every foul is signalled by its side's line umpire. */
export const LS_UP = .25, LS_DOWN = .35;
export const LS_FOUL_AT = .35, LS_FOUL_HOLD = 1.0, LS_FAIR_HOLD = 1.0, LS_HR_HOLD = 2.2, LS_HR_HZ = 1.8, LS_HR_R = .14;
export const LS_LINE_DEG = 45, LS_NEAR_DEG = 8;                /* the foul lines are +-45 deg of spray; "near" = within 8 deg of one */
const UP_R = [.3, 1.25, .1], UP_L = [-.3, 1.25, .1];
const PT_R = [.85, .62, .5], PT_L = [-.85, .62, .5];            /* point out to his right / left, level, a little forward */
const FIN_R = [.25, 1.3, .1], FIN_L = [-.25, 1.3, .1];         /* the finger circles over the head */
const sat = x => x < 0 ? 0 : x > 1 ? 1 : x;
const ease = x => x * x * (3 - 2 * x);
const env = (t, hold) => ease(sat(t / LS_UP)) * (1 - ease(sat((t - LS_UP - hold) / LS_DOWN)));  /* 0 -> 1 -> 0 */
const HOLD = { foul: LS_FOUL_HOLD, fair: LS_FAIR_HOLD, hr: LS_HR_HOLD };
/* the call of this event: {kind, b, at} (at = when the signal starts, from the frame start) or null */
export function lineCall(e, T) {
  if (!e || e.k !== 'P') return null;
  let c = null;
  if (e.r === 'foul' && (e.foulDir === 1 || e.foulDir === -1)) c = { kind: 'foul', b: e.foulDir > 0 ? 1 : 3, at: T.ARRIVE + LS_FOUL_AT };
  else if (e.r === 'inplay' && e.play && Number.isFinite(e.play.spray) && Number.isFinite(e.play.hang)) {
    const p = e.play, at = T.ARRIVE + p.hang, b = p.spray >= 0 ? 1 : 3;
    if (p.res === 'HR') c = { kind: 'hr', b, at };
    else if (!p.bunt && Math.abs(p.spray) >= LS_LINE_DEG - LS_NEAR_DEG && Math.abs(p.spray) <= LS_LINE_DEG) c = { kind: 'fair', b, at };
  }
  if (!c) return null;
  const end = c.at + LS_UP + HOLD[c.kind] + LS_DOWN;
  if (Number.isFinite(e.d) && end > e.d) c.at = Math.max(0, c.at - (end - e.d));   /* never run past the frame */
  return c;
}
export function lineEnd(e, T) { const c = lineCall(e, T); return c ? c.at + LS_UP + HOLD[c.kind] + LS_DOWN : 0; }
export function lineSignal(e, u, b, T) {
  const c = lineCall(e, T);
  if (!c || c.b !== b) return null;
  const w = env(u - c.at, HOLD[c.kind]);
  if (!(w > 0)) return null;
  const right = b === 1;
  let R = [.25, .1, .45], L = [-.25, .1, .45];
  if (c.kind === 'foul') { R = UP_R; L = UP_L; }
  else if (c.kind === 'fair') { if (right) R = PT_R; else L = PT_L; }                 /* U1 faces home: fair ground is on his right; U3: on his left */
  else {
    const a = 2 * Math.PI * LS_HR_HZ * Math.max(0, u - c.at - LS_UP), base = right ? FIN_R : FIN_L, f = [base[0] + LS_HR_R * Math.cos(a), base[1], base[2] + LS_HR_R * Math.sin(a)];
    if (right) R = f; else L = f;
  }
  return { kind: c.kind, w, arms: R.concat(L) };
}
