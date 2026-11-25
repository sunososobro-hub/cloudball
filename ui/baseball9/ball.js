/* 九宮格棒球 batted-ball physics (#332 part 3a): launch, flight and fielding of the owner's prototype (ui/ref/baseball_9grid/), pure functions,
 * no DOM, no three.js, no engine/ (rule 10: a score for this mini-game only, never a league result). Units: metres, seconds; home (0,0),
 * +z toward centre field, +x toward first base. Randomness only through the `rnd` argument (seedable). Runners and throws come in part 3b. */

export const G = 9.8, KD = 0.0042, DT = 1 / 30;     // gravity, air drag, step
export const MAX_FLIGHT_S = 14;                     // a ball is dead after this long
export const HOME_RUN_MIN_Y = 3;                    // above this at the fence = over it
export const FNAME = ['投手', '捕手', '一壘手', '二壘手', '游擊手', '三壘手', '左外野', '中外野', '右外野'];
export const FSPD = [4.6, 4.2, 5.2, 5.4, 5.4, 5.2, 5.8, 6, 5.8];   // fielder run speed m/s
export const POS_N = [[0, 18.4], [0, -1.3], [16, 27], [9, 37], [-9, 37], [-16, 27], [-30, 76], [0, 90], [30, 76]];
export const REACH_Y = 2.7;                         // a fielder cannot take a ball above this height
export const fenceR = phi => 88 + 20 * Math.cos(phi * 2);   // fence distance by angle

const U = (rnd, a, b) => a + rnd() * (b - a);

/** Launch speed v (m/s), launch angle la (deg) and spray (deg, negative = pull side) from contact quality q.
 *  `app` 'pull'|'mid'|'push'; `pt` the pitch ({la}); `pow` 0..3. Same bands as the prototype. */
export function launch(q, app, pt, bunt, pow, rnd = Math.random) {
  let v, la;
  if (bunt) { v = U(rnd, 5, 8.5); la = U(rnd, -14, -2); }
  else if (q >= 1.08) { v = U(rnd, 43, 47) + pow * .8; la = U(rnd, 22, 32); }
  else if (q >= .9) { v = U(rnd, 39, 45) + pow * .5; la = U(rnd, 10, 24); }
  else if (q >= .72) { v = U(rnd, 30, 38); la = rnd() < .5 ? U(rnd, 4, 16) : U(rnd, 16, 26); }
  else if (q >= .5) { if (rnd() < .55) { v = U(rnd, 24, 33); la = U(rnd, -6, 8); } else { v = U(rnd, 26, 33); la = U(rnd, 32, 52); } }
  else { if (rnd() < .6) { v = U(rnd, 16, 25); la = U(rnd, -12, 4); } else { v = U(rnd, 20, 28); la = U(rnd, 55, 70); } }
  if (!bunt) la += (pt && pt.la) || 0;
  let spray = app === 'pull' ? U(rnd, -40, -4) : app === 'push' ? U(rnd, 4, 40) : U(rnd, -30, 30);
  if (bunt) spray = U(rnd, -28, 28);
  return { v, la, spray };
}

/** Ball path: points {t,x,y,z,air}; `hr` true when it clears the fence in the air. */
export function flight(v, la, spray) {
  const a = spray * Math.PI / 180, e = la * Math.PI / 180;
  let x = 0, y = .9, z = .6, vx = v * Math.cos(e) * Math.sin(a), vz = v * Math.cos(e) * Math.cos(a), vy = v * Math.sin(e);
  const pts = []; let t = 0, bounced = false, hr = false;
  for (let i = 0; i < 30 * MAX_FLIGHT_S; i++) {
    pts.push({ t, x, y, z, air: !bounced });
    const sp = Math.hypot(vx, vy, vz);
    if (y > 0 || vy > 0) { vx -= KD * sp * vx * DT; vz -= KD * sp * vz * DT; vy -= (G + KD * sp * vy) * DT; }
    x += vx * DT; y += vy * DT; z += vz * DT; t += DT;
    if (y <= 0) { y = 0; bounced = true;
      if (Math.abs(vy) > 2.5) { vy = -vy * .35; vx *= .62; vz *= .62; }
      else { vy = 0; const hs = Math.hypot(vx, vz), ns = Math.max(0, hs - 6.5 * DT); if (hs > 0) { vx *= ns / hs; vz *= ns / hs; } } }
    const d = Math.hypot(x, z), R = fenceR(Math.atan2(x, z));
    if (d > R) { if (y > HOME_RUN_MIN_Y && !bounced) { hr = true; pts.push({ t, x, y, z, air: true }); break; }
      const s = (R - .3) / d; x *= s; z *= s; vx *= -.25; vz *= -.25; bounced = true; }
    if (y === 0 && vy === 0 && Math.hypot(vx, vz) < .25) { pts.push({ t, x, y, z, air: false }); break; }
  }
  return { pts, hr };
}

/** First fielder who can reach the ball: {f, t, air, x, z} or null. `F` = nine [x,z] positions (POS_N order). */
export function fieldIt(pts, F) {
  let best = null;
  for (let f = 0; f < 9; f++) {
    const P = F[f], react = f === 1 ? .2 : .45, reach = f <= 1 ? 1 : 1.2, sp = FSPD[f];
    for (const p of pts) {
      if (p.y > REACH_Y || p.t < react) continue;
      if (Math.hypot(p.x - P[0], p.z - P[1]) - reach <= sp * (p.t - react)) { if (!best || p.t < best.t) best = { f, t: p.t, air: p.air, x: p.x, z: p.z }; break; }
    }
  }
  return best;
}

/** One batted ball, no runners: 'HR' | 'caught' (fly/line/bunt pop) | 'ground' (fielded on the ground, who and where) | 'gap' (nobody reached it). */
export function batBall(q, { app = 'mid', pt = null, bunt = false, pow = 0, F = POS_N, rnd = Math.random } = {}) {
  const L = launch(q, app, pt, bunt, pow, rnd), fl = flight(L.v, L.la, L.spray);
  if (fl.hr) return { kind: 'HR', L, fl };
  const fb = fieldIt(fl.pts, F);
  if (!fb) return { kind: 'gap', L, fl };
  return { kind: fb.air ? 'caught' : 'ground', L, fl, fb, infield: Math.hypot(fb.x, fb.z) < 44 };
}
