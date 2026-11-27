/* #611 part 1: a pinch runner jogs out, the man he replaces jogs off (pure, no DOM, no three.js).
 * Before this the SUB frame of a pinch runner (engine `k: 'SUB'` with `base`) only swapped the runner's number and kit
 * on the bag: a pop-in, against #42. Read from the engine frame only (rule 12); nothing here touches outcomes (rule 10).
 *   prJog(base, dug, u, d, face) -> { out, in }: base = [x, z] where the runner stands at u = 0 of the frame (the bag, or
 *   game.js standRunner's lead spot off it), dug = [x, z] of the batting side's dugout, face = [x, z] he faces while he
 *   stands there (default: home plate, from base),
 *   u = seconds into the SUB frame, d = its length (engine PR_DUR). Each of out / in is [x, z, faceX, faceZ] or null
 *   (null = inside the dugout, not drawn). The new man is on the bag, facing home, by d - PR_HOLD; the old man is in
 *   the dugout by d. They keep PR_LANE m apart sideways so the two do not walk through each other. */
export const PR_OUT_GO = .3;  /* s into the frame when the replaced runner turns for the dugout */
export const PR_IN_GO = .6;   /* s into the frame when the pinch runner leaves the dugout */
export const PR_HOLD = .4;    /* s the pinch runner stands on the bag before the frame ends */
export const PR_OUT_V = 5;    /* m/s, the replaced runner's jog off (faster when the frame is short) */
export const PR_IN_V = 6.5;   /* m/s, the pinch runner's jog out (game.js JOG_SPEED; faster when the frame is short) */
export const PR_LANE = .8;    /* m each man keeps to the side of the bag-to-dugout line */
export const PR_LANE_IN = 3;  /* m from the bag over which the side step grows from 0 to PR_LANE */

const sat = x => x < 0 ? 0 : x > 1 ? 1 : x;

/* point s metres from the bag toward the dugout, stepped `side` (+1 / -1) to one side of the line */
function along(base, dug, s, side) {
  const dx = dug[0] - base[0], dz = dug[1] - base[1], L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
  const o = side * PR_LANE * sat(s / PR_LANE_IN);
  return [base[0] + ux * s - uz * o, base[1] + uz * s + ux * o];
}

export function prJog(base, dug, u, d, face) {
  const fx = face ? face[0] : -base[0], fz = face ? face[1] : -base[1];
  const L = Math.hypot(dug[0] - base[0], dug[1] - base[1]);
  /* replaced runner: from the bag to the dugout, in by d */
  const vo = Math.max(PR_OUT_V, L / Math.max(d - PR_OUT_GO, 1e-3)), so = Math.max(0, u - PR_OUT_GO) * vo;
  let out = null;
  if (so < L) {
    const p = along(base, dug, so, 1);
    out = u < PR_OUT_GO ? [p[0], p[1], fx, fz] : [p[0], p[1], dug[0] - p[0], dug[1] - p[1]];
  }
  /* pinch runner: from the dugout to the bag, there by d - PR_HOLD */
  const vi = Math.max(PR_IN_V, L / Math.max(d - PR_IN_GO - PR_HOLD, 1e-3)), si = (u - PR_IN_GO) * vi;
  let inn = null;
  if (si > 0) {
    if (si >= L) inn = [base[0], base[1], fx, fz];
    else { const p = along(base, dug, L - si, -1); inn = [p[0], p[1], base[0] - p[0], base[1] - p[1]]; }
  }
  return { out, in: inn };
}
