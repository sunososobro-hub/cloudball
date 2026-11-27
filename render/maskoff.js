/* #620 part 1: the catcher drops his mask on a caught foul pop-up (pure, no DOM, no three.js). Read from the engine event only (rule 12).
 * A caught foul fly is an in-play event whose play has `foul: true` (engine #614 part 1); when its fielder is the catcher he pulls
 * the mask off as he turns to find the ball and tosses it aside, AWAY from where the ball comes down, so he cannot trip on it.
 *   maskOff(e, T, c0) -> null | {at, from, spot}: at = when the mask leaves his head (from the frame start, s); from = [x, y, z] his
 *     head when it leaves; spot = [x, z] where it lies. c0 = [x, z] where the catcher stands at contact (fielderStart 'C').
 *   maskAt(e, u, T, c0) -> null (still on his head) | {pos: [x, y, z], ground, spin}: the loose mask at time u, flying then lying.
 * T = {ARRIVE} from the engine, so a changed engine timing moves the toss with it. Every other event (and any other fielder) -> null. */
export const MASK_OFF_AT = .35;   /* s after contact: off while he turns and looks up (he is already rising, PLATE_UP_AT .25 s) */
export const MASK_FLY = .45;      /* s in the air */
export const MASK_TOSS = 2.2;     /* m from where he stood, straight away from the ball */
export const MASK_HEAD_Y = 1.55;  /* m: his hand at head height as he flips it off */
export const MASK_PEAK = .35;     /* m: extra height of the toss arc */
export const MASK_GROUND_Y = .06; /* m: the mask lying on the dirt (its padding) */
export const MASK_SPIN = 2.5;     /* turns per second while it flies */
const sat = x => x < 0 ? 0 : x > 1 ? 1 : x;

export function maskOff(e, T, c0) {
  if (!e || e.k !== 'P' || e.r !== 'inplay' || !e.play || !e.play.foul || e.play.fielder !== 'C') return null;
  const p = e.play;
  if (!Number.isFinite(p.lx) || !Number.isFinite(p.lz) || !c0) return null;
  let dx = c0[0] - p.lx, dz = c0[1] - p.lz, L = Math.hypot(dx, dz);
  if (L < 1e-6) { dx = 1; dz = 0; L = 1; }   /* ball straight over him: toss to his side */
  return { at: T.ARRIVE + MASK_OFF_AT, from: [c0[0], MASK_HEAD_Y, c0[1]], spot: [c0[0] + dx / L * MASK_TOSS, c0[1] + dz / L * MASK_TOSS] };
}

export function maskAt(e, u, T, c0) {
  const m = maskOff(e, T, c0);
  if (!m || !(u >= m.at)) return null;
  const t = sat((u - m.at) / MASK_FLY), [x0, y0, z0] = m.from, [x1, z1] = m.spot;
  const y = y0 + (MASK_GROUND_Y - y0) * t + 4 * MASK_PEAK * t * (1 - t);
  return { pos: [x0 + (x1 - x0) * t, y, z0 + (z1 - z0) * t], ground: t >= 1, spin: t >= 1 ? 0 : 2 * Math.PI * MASK_SPIN * (u - m.at) };
}
