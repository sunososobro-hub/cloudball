/* render/welcome.js: teammates meet a home run at the plate (#266 item 2, owner 11/22 14:25). Pure, no three.js, no DOM.
 * On a home-run frame WELCOME_N teammates leave their dugout, jog out and line up on both sides of the path the scorers take from the
 * plate to the dugout (game.js peelPath), WELCOME_ARC m along it and WELCOME_SIDE m off it, so the batter trots through a little
 * gauntlet. They are in place WELCOME_EARLY s before the first scorer touches the plate, hop with both arms up (hand slaps) from that
 * moment until WELCOME_CELEB s after the last one (the batter), then walk back to the dugout behind him and are gone there.
 * The whole outing of each one (dugout -> spot -> dugout) lasts at most WELCOME_MAX s: when a long gap between the first and the last
 * scorer (a grand slam) would make it longer, they come out later; the walk back speeds up if it still does not fit.
 * Content only (rules 10, 12): the engine never reads this file; the frame length and every outcome stay as they are. The walk back
 * runs on into the next frames; game.js draws it there too (look-back, like the scorers peeling off) and cpEvents keeps it on screen. */
export const WELCOME_N = 4;                      /* teammates (issue: 3-5) */
export const WELCOME_ARC = [2.8, 4.2, 5.6, 7];   /* m along the scorers' path from the plate, one per teammate */
export const WELCOME_SIDE = 1.3;                 /* m off the path, alternating sides */
export const WELCOME_OUT_V = 4;                  /* m/s jogging out of the dugout */
export const WELCOME_BACK_V = 3;                 /* m/s walking back (faster only to meet WELCOME_MAX) */
export const WELCOME_EARLY = 1;                  /* s in place before the first scorer reaches the plate */
export const WELCOME_CELEB = 2;                  /* s of celebration after the last scorer reaches the plate */
export const WELCOME_HOP_T = .5;                 /* s per hop */
export const WELCOME_HOP_H = .22;                /* m: top of a hop */
export const WELCOME_SETTLE = .3;                /* s: hops and arms ease out before the walk back */
export const WELCOME_MAX = 20;                   /* s: cap on one teammate's outing, dugout to dugout */

/* Point and unit tangent at arc length s along a path {pts, cum, L} ([x, z] points, cumulative lengths) */
function along(P, s) {
  s = Math.max(0, Math.min(P.L, s));
  let i = 0; while (i < P.pts.length - 2 && P.cum[i + 1] < s) i++;
  const a = P.pts[i], b = P.pts[i + 1], seg = Math.max(1e-9, P.cum[i + 1] - P.cum[i]), f = (s - P.cum[i]) / seg;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, (b[0] - a[0]) / seg, (b[1] - a[1]) / seg];
}

/* from = the batting team's dugout [x, z]; path = the scorers' path plate -> dugout; first / last = frame-local s when the first and
 * the last scorer reach the plate -> plan {members: [{spot, face, L, go, inAt, leave, end}], first, last, end}, or null */
export function welcomePlan(from, path, first, last) {
  if (!path || !(path.L > WELCOME_ARC[WELCOME_N - 1]) || !Number.isFinite(first) || !Number.isFinite(last) || last < first) return null;
  const members = [];
  for (let i = 0; i < WELCOME_N; i++) {
    const [px, pz, tx, tz] = along(path, WELCOME_ARC[i]), sd = i % 2 ? -1 : 1, nx = -tz * sd, nz = tx * sd;
    const spot = [px + nx * WELCOME_SIDE, pz + nz * WELCOME_SIDE], L = Math.hypot(spot[0] - from[0], spot[1] - from[1]);
    const out = L / WELCOME_OUT_V, leave = last + WELCOME_CELEB;
    let back = L / WELCOME_BACK_V;
    let inAt = Math.min(last - WELCOME_EARLY, Math.max(first - WELCOME_EARLY, leave + back - WELCOME_MAX + out));
    let go = inAt - out;
    if (go < 0) { go = 0; inAt = out; }
    if (leave + back - go > WELCOME_MAX) back = Math.max(1e-3, WELCOME_MAX - (leave - go));
    if (inAt > leave) return null;
    members.push({ spot, face: [-nx, -nz], from: [from[0], from[1]], L, go, inAt, leave, end: leave + back });
  }
  return { members, first, last, end: Math.max(...members.map(m => m.end)) };
}

/* -> {visible, x, z, fx, fz, moving, hop, arms}: teammate i at u s into the home-run frame; hop = m off the ground, arms 0..1 raised */
export function welcomeAt(pl, i, u) {
  const m = pl && pl.members[i], none = { visible: false, x: 0, z: 0, fx: 0, fz: 1, moving: false, hop: 0, arms: 0 };
  if (!m || !(u >= m.go) || u >= m.end) return none;
  const [ax, az] = m.from, [bx, bz] = m.spot, ox = bx - ax, oz = bz - az;
  if (u < m.inAt) { const k = (u - m.go) / (m.inAt - m.go); return { visible: true, x: ax + ox * k, z: az + oz * k, fx: ox, fz: oz, moving: true, hop: 0, arms: 0 }; }
  if (u < m.leave) {
    const on = Math.max(0, Math.min(1, (u - pl.first) / WELCOME_SETTLE)), off = Math.max(0, Math.min(1, (m.leave - u) / WELCOME_SETTLE)), k = Math.min(on, off);
    const hop = u > pl.first ? WELCOME_HOP_H * Math.abs(Math.sin(Math.PI * (u - pl.first) / WELCOME_HOP_T)) * k : 0;
    return { visible: true, x: bx, z: bz, fx: m.face[0], fz: m.face[1], moving: false, hop, arms: k };
  }
  const k = (u - m.leave) / (m.end - m.leave);
  return { visible: true, x: bx - ox * k, z: bz - oz * k, fx: -ox, fz: -oz, moving: true, hop: 0, arms: 0 };
}
