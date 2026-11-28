/* #620 part 3: how a corner fielder faces while he chases a foul fly (pure, no DOM, no three.js). Read from the engine event only (rule 12).
 * The engine already sends him from his start to plan.stand (the foul-ground catch spot); without this he backpedals the whole way facing home.
 *   1B / 3B drift toward the stands turned sideways, a shoulder to the ball, looking back at it over that shoulder (DRIFT_SIDE).
 *   LF / RF run at the line facing where they run.
 * Both turn from home to the run as they break (FOUL_TURN s) and back to the ball over the last FOUL_TURN s, so at the catch they face it.
 *   foulChaseFace(e, u2, catchT, from) -> null (leave the old facing) | [dx, dz] unit facing on the ground (face(f, dx, dz)).
 *   u2 = s since contact; catchT = e.plan.catchT; from = [x, z] where he stood at contact (fielderStart / f.pos). */
export const FOUL_CHASERS = { '1B': true, '3B': true, LF: false, RF: false }; /* true = infielder (drifts sideways) */
export const FOUL_TURN = .5;    /* s to turn into the run after the break, and back to the ball before the catch */
export const DRIFT_SIDE = .5;   /* infielder: share of the turn from run to ball he keeps while drifting (.5 = side-on) */
export const RUN_MIN = 3;       /* m: a shorter chase is a step or two, he keeps facing the ball */
const sat = x => x < 0 ? 0 : x > 1 ? 1 : x;
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI; return a; };

export function foulChaseFace(e, u2, catchT, from) {
  if (!e || e.k !== 'P' || e.r !== 'inplay' || !e.play || !e.play.foul || !e.plan || !from) return null;
  const p = e.play, inf = FOUL_CHASERS[p.fielder];
  if (inf === undefined || !(u2 >= 0) || !(u2 < catchT)) return null;
  const st = e.plan.stand;
  if (!st || !Number.isFinite(p.lx) || !Number.isFinite(p.lz)) return null;
  const rx = st[0] - from[0], rz = st[1] - from[1];
  if (Math.hypot(rx, rz) < RUN_MIN) return null;
  /* angles as face() reads them: atan2(x, z) */
  const aBall = Math.atan2(-p.lx, -p.lz), aRun = Math.atan2(rx, rz);
  let d = wrap(aBall - aRun);
  if (Math.abs(Math.abs(d) - Math.PI) < 1e-6) d = Math.PI * (p.lx >= 0 ? 1 : -1); /* straight away from home: turn the same way every time */
  const base = inf ? DRIFT_SIDE : 0;
  const tIn = 1 - sat(u2 / FOUL_TURN), tOut = sat((u2 - (catchT - FOUL_TURN)) / FOUL_TURN);
  const w = base + (1 - base) * Math.max(tIn, tOut); /* 1 = facing the ball, 0 = facing the run */
  const a = aRun + d * w;
  return [Math.sin(a), Math.cos(a)];
}
