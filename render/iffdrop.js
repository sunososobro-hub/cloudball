/* #739: the ball of a dropped infield fly (engine: plan.drop, plan.dropAt = the ball comes down, plan.catchT = the pick-up
 * IFF_DROP_PICKUP later; #614 part 10). Pure: no three.js, no DOM, no clock. The engine already made the batter out by rule
 * (rule 13: out reason `infield_fly`) and holds the runners; this only draws the ball: it comes down to the glove at the
 * engine's land point at dropAt, pops off it, falls to the grass beside the fielder, rolls a little and lies still until he
 * picks it up at catchT. Nothing here moves a time, so the frame length is unchanged (rule 12).
 * game.js feeds it the event and u2 (time since contact); tests/iffdrop.check.mjs runs it on every dropped one over seeds. */
export const DROP_G = 9.81;         /* m/s^2 */
export const DROP_GLOVE_Y = 1.5;    /* glove height where the ball comes down (game.js land y for a fly) */
export const DROP_REST_Y = .15;     /* ball centre height on the ground (game.js land / rollEnd y; grd_path GRD_REST_Y) */
export const DROP_FALL_K = .7;      /* share of the pick-up time the ball spends in the air off the glove */
export const DROP_OUT_M = .25;      /* horizontal distance it pops out of the glove before it touches the ground, m */
export const DROP_ROLL_M = .1;      /* then it rolls this far, m */
export const DROP_ROLL_K = .5;      /* the roll takes this share of the time left before the pick-up */

/* null when the event is not a dropped infield fly; else { at, pick, from, hit, rest, tf, vy, tr, ux, uz } in u2 time */
export function dropPlan(e) {
  const PL = e && e.plan, p = e && e.play;
  if (!PL || !PL.drop || !p || !Number.isFinite(PL.dropAt) || !Number.isFinite(PL.catchT) || !Array.isArray(PL.stand)) return null;
  const at = PL.dropAt, pick = PL.catchT, span = Math.max(pick - at, .1);
  const from = [p.lx, DROP_GLOVE_Y, p.lz];
  /* away from the fielder (stand -> land), so it falls in front of him, not through him */
  let dx = p.lx - PL.stand[0], dz = p.lz - PL.stand[1], d = Math.hypot(dx, dz);
  if (d < 1e-6) { dx = -p.lx; dz = -p.lz; d = Math.hypot(dx, dz) || 1 }
  const ux = dx / d, uz = dz / d;
  const tf = span * DROP_FALL_K;
  /* y(t) = GLOVE + vy t - g t^2 / 2 reaches REST at tf */
  const vy = (DROP_REST_Y - DROP_GLOVE_Y + DROP_G * tf * tf / 2) / tf;
  const hit = [from[0] + ux * DROP_OUT_M, DROP_REST_Y, from[2] + uz * DROP_OUT_M];
  const rest = [hit[0] + ux * DROP_ROLL_M, DROP_REST_Y, hit[2] + uz * DROP_ROLL_M];
  const tr = (span - tf) * DROP_ROLL_K;
  return { at, pick, from, hit, rest, tf, vy, tr, ux, uz };
}

/* ball position at u2 (seconds since contact) for at <= u2 < pick; null outside that window */
export function dropAt(D, u2) {
  if (!D || u2 < D.at || u2 >= D.pick) return null;
  const t = u2 - D.at;
  if (t < D.tf) {
    const k = t / D.tf;
    return [D.from[0] + (D.hit[0] - D.from[0]) * k, DROP_GLOVE_Y + D.vy * t - DROP_G * t * t / 2, D.from[2] + (D.hit[2] - D.from[2]) * k];
  }
  const r = D.tr > 0 ? Math.min((t - D.tf) / D.tr, 1) : 1, k = r * (2 - r);   /* slows to a stop */
  return [D.hit[0] + (D.rest[0] - D.hit[0]) * k, DROP_REST_Y, D.hit[2] + (D.rest[2] - D.hit[2]) * k];
}
