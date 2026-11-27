/* #612 part 1: the dugout rail (plain data + pure maths, no three.js, no DOM, no Date / Math.random).
 * Bench players stand or lean at the front rail of both dugouts in idle poses; when the batting team scores, its rail claps (hands together and
 * apart) from the first runner's arrival at home until RAIL_CLAP_HOLD s after the last. Renderer only (rule 12, 10): the engine event stream
 * says who scored and when (`moves` entries to base 4, `arriveT`); nothing here changes an outcome. Nobody appears or vanishes (#42): the bench
 * stands there from the first frame to the last, so a dugout never gains or loses a body.
 * Local frame as props/dugout.js: x along the foul line, z away from the field (front face z 0); game.js dugout(t) is the point, turned
 * sign(x)*45 degrees. Arm targets are in the rig space of game.js aimArm (shoulder x BAT_SHOULDER_X, hands at about chest height .62). */
export const RAIL_N = 4;               /* bench figures per dugout at most (game.js draws fewer on the lower tiers) */
export const RAIL_Z = .7;              /* m behind the front face: against the rail cap */
export const RAIL_X = [-4.2, -2.4, -.6, 1.2]; /* m along the dugout: clear of the steps (props/dugout.js OPEN) */
export const RAIL_CLAP_HOLD = 2.2;     /* s the rail keeps clapping after the last runner is home */
export const RAIL_CLAP_HZ = 3;         /* claps per second */
export const RAIL_RAMP = .3;           /* s from idle to full clap and back */
export const RAIL_LEAN = [.2, .5, .3]; /* hands of a leaning player: out on the rail */
export const RAIL_TOGETHER = [.04, .62, .38], RAIL_APART = [.4, .62, .3];

/* slot i of dugout point [dx, dz] (turn rotY = sign(dx) * PI/4): {x, z (world), fx, fz (facing the field), lean (idle: arms on the rail)} */
export function railSlot(dug, i) {
  const th = Math.sign(dug[0] || -1) * Math.PI / 4, lx = RAIL_X[i % RAIL_X.length], lz = RAIL_Z;
  return { x: dug[0] + lx * Math.cos(th) + lz * Math.sin(th), z: dug[1] - lx * Math.sin(th) + lz * Math.cos(th),
    fx: -Math.sin(th), fz: -Math.cos(th), lean: i % 2 === 0 };
}
/* arrival times (s since the event start) of the runners who score in event e (a P event with moves to base 4) */
export function scoreTimes(e) {
  if (!e || e.k !== 'P') return [];
  return (e.moves || []).filter(m => m[1] === 4 && m[3] && Number.isFinite(m[3].arriveT)).map(m => m[3].arriveT);
}
/* clap weight 0..1 at u for the arrival times arr, and the clap phase 0..1 (restarts at the first arrival) */
export function clapAt(arr, u) {
  if (!arr || !arr.length) return { w: 0, phase: 0 };
  const a = Math.min(...arr), b = Math.max(...arr) + RAIL_CLAP_HOLD;
  const up = Math.max(0, Math.min(1, (u - a) / RAIL_RAMP)), down = Math.max(0, Math.min(1, (b - u) / RAIL_RAMP));
  const w = Math.min(up, down), t = Math.max(0, u - a) * RAIL_CLAP_HZ;
  return { w, phase: t - Math.floor(t) };
}
/* the two hand targets [x, y, z] (right hand; the left mirrors x) for a clap weight and phase, or the lean / rest pose */
export function handsAt(slot, w, phase) {
  const k = .5 - .5 * Math.cos(2 * Math.PI * phase), mix = (a, b, f) => a.map((v, j) => v + (b[j] - v) * f);
  const idle = slot.lean ? RAIL_LEAN : null;
  if (w <= 0) return idle;
  const clap = mix(RAIL_APART, RAIL_TOGETHER, k);
  return idle ? mix(idle, clap, w) : mix([.3, -.03, 0], clap, w);
}
