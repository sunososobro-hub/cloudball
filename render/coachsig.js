/* #612 part 2: the third-base coach's signals (plain data + pure maths, no three.js, no DOM, no Date / Math.random).
 * He windmills a runner home (a move that ends at base 4 from base 1, 2 or 3) and holds one up with both hands (a move that ends at base 3
 * from home, first or second). The engine event stream says who runs and when he arrives (`moves` entries, `arriveT`); the time the runner
 * passes third is arriveT minus the run home at his speed (3rd to home is BASE_LEN m). Renderer only (rule 12, 10): nothing here changes an
 * outcome. Arm targets are in the rig space of game.js aimArm (shoulder x BAT_SHOULDER_X, hands at about chest height .62). */
export const BASE_LEN = 27.43;   /* m between bases (90 ft) */
export const SIG_LEAD = 1.2;     /* s before the runner reaches third that the coach starts */
export const SIG_HOLD = 1;       /* s after the runner passes third that the wave goes on */
export const HOLD_LEAD = 1.5;    /* s before a runner reaches third that both arms go up */
export const HOLD_AFTER = .8;    /* s the hold stays up after he is there */
export const SIG_RAMP = .25;     /* s from rest to full signal and back */
export const WAVE_HZ = 1.6;      /* windmill turns per second */
export const REST = [.12, .62, .3];
/* #612 part 3: the first-base coach's "back" on a pickoff throw (engine P event with `po`, plan times since the event start) */
export const BACK_LEAD = .5;     /* s before the pitcher's throw (plan.t0) that he starts: he reads the step-off */
export const BACK_AFTER = .6;    /* s the signal stays up after the runner is back at the bag (plan.runnerAt) */
export const BACK_HZ = 2.5;      /* down-pumps per second, both palms toward the bag */

/* signals of event e: [{kind: 'wave' | 'hold', t0, t1}] (s since the event start), sorted by t0; none for a non-P event */
export function coachSignals(e) {
  if (!e || e.k !== 'P') return [];
  const out = [];
  for (const m of e.moves || []) {
    const info = m[3], arr = info && info.arriveT;
    if (!Number.isFinite(arr) || m[0] === m[1]) continue;
    if (m[1] === 4 && m[0] <= 3) {
      const spd = info.spd > 0 ? info.spd : 5, pass = Math.max(0, arr - BASE_LEN / spd);
      out.push({ kind: 'wave', t0: Math.max(0, pass - SIG_LEAD), t1: pass + SIG_HOLD });
    } else if (m[1] === 3 && m[0] < 3) out.push({ kind: 'hold', t0: Math.max(0, arr - HOLD_LEAD), t1: arr + HOLD_AFTER });
  }
  return out.sort((a, b) => a.t0 - b.t0 || (a.kind < b.kind ? -1 : 1));
}
/* the active signal at u: {kind, w 0..1 (ramped), phase 0..1 (restarts at t0; WAVE_HZ, BACK_HZ for 'back')} or null. A wave wins over a hold (the lead runner is the one he reads). */
export function signalAt(sigs, u) {
  let best = null;
  for (const s of sigs || []) {
    if (u < s.t0 - 1e-9 || u > s.t1 + 1e-9) continue;
    const w = Math.max(0, Math.min(1, (u - s.t0) / SIG_RAMP, (s.t1 - u) / SIG_RAMP)), t = (u - s.t0) * (s.kind === 'back' ? BACK_HZ : WAVE_HZ);
    if (!best || (s.kind === 'wave' && best.kind !== 'wave') || (s.kind === best.kind && w > best.w)) best = { kind: s.kind, w, phase: t - Math.floor(t) };
  }
  return best;
}
/* the first-base coach's signals of event e: one 'back' window for a pickoff throw (out or safe), none otherwise */
export function backSignals(e) {
  const pl = e && e.k === 'P' && e.po ? e.plan : null;
  if (!pl || !Number.isFinite(pl.t0)) return [];
  const end = Number.isFinite(pl.runnerAt) ? pl.runnerAt : pl.arrive;
  if (!Number.isFinite(end)) return [];
  return [{ kind: 'back', t0: Math.max(0, pl.t0 - BACK_LEAD), t1: Math.max(pl.t0, end) + BACK_AFTER }];
}
/* the two hand targets [x, y, z] (right hand; the left mirrors x for a hold, rests for a wave) for a signal, blended from REST by its weight; null = no signal */
export function handsFor(sig) {
  if (!sig || sig.w <= 0) return null;
  const mix = (a, b, f) => a.map((v, j) => v + (b[j] - v) * f);
  if (sig.kind === 'back') {
    const d = .5 - .5 * Math.cos(2 * Math.PI * sig.phase), down = [.28, .55 - .25 * d, .4];
    return { r: mix(REST, down, sig.w), l: mix(REST, down, sig.w) };
  }
  if (sig.kind === 'hold') return { r: mix(REST, [.36, 1.75, .25], sig.w), l: mix(REST, [.36, 1.75, .25], sig.w) };
  const a = 2 * Math.PI * sig.phase, circ = [.3, 1.25 + .55 * Math.sin(a), .15 + .6 * Math.cos(a)];
  return { r: mix(REST, circ, sig.w), l: REST };
}
