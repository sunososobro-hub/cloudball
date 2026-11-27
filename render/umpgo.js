/* render/umpgo.js (#612 part 8): the first- and third-base umpires go out on a fair fly ball to the outfield, like a real 3-man crew:
 * U1 for right and right-centre, U3 for left and left-centre. Plain math, no three.js; game.js loads it with import() and does nothing
 * until it is in (dev switch ?off=umpgo). Pure function of (event, time, post), so a seek lands where playing would. Read only from the
 * engine event (rule 12: play.type FB, fielder, lx / lz = landing, hang); outcomes untouched (rule 10). Home runs are not here (#609 line
 * signals). tests/umpgo.check.mjs runs it.
 *
 * umpGoFor(e)            -> null | 1 | 3: the bag umpire who goes out (1 = first base, 3 = third base)
 * umpGoAt(e, T, u, post) -> null | {x, z, dx, dz, moving}: where he is at u s into the event; post = [x, z] of his post; (dx, dz) is the
 *                           direction he faces: his run while moving, toward the landing spot while he stands out there.
 * umpGoEnd(e, T, posts)  -> s into the event when he is back on his post (0 = no trip; posts = the three bag posts [x, z], index = bag - 1); cpEvents keeps the event on screen until then.
 * T = {ARRIVE} from the engine. */
export const GO = { AT: .3, DIST: 15, V: 4.5, HOLD: 1.2, PAD: .1 };
const OUTFIELD = { LF: 3, CF: 0, RF: 1 };
const sat = x => x < 0 ? 0 : x > 1 ? 1 : x;
const ease = x => x * x * (3 - 2 * x);
export function umpGoFor(e) {
  if (!e || e.k !== 'P' || e.r !== 'inplay' || !e.play) return null;
  const p = e.play;
  if (p.type !== 'FB' || p.foul || p.bunt || p.res === 'HR' || !(p.fielder in OUTFIELD)) return null;
  if (!Number.isFinite(p.lx) || !Number.isFinite(p.lz) || !Number.isFinite(p.hang) || !Number.isFinite(e.d)) return null;
  const b = OUTFIELD[p.fielder] || (p.lx >= 0 ? 1 : 3);
  return b === 3 ? 3 : 1;
}
function plan(e, T, post) {
  const b = umpGoFor(e);
  if (!b) return null;
  const p = e.play, dx = p.lx - post[0], dz = p.lz - post[1], d = Math.hypot(dx, dz);
  if (!(d > GO.DIST)) return null;
  const to = [post[0] + dx / d * GO.DIST, post[1] + dz / d * GO.DIST], dur = GO.DIST / GO.V;
  const go = T.ARRIVE + p.hang * GO.AT, t1 = go + dur, back = Math.max(t1, Math.min(T.ARRIVE + p.hang + GO.HOLD, e.d - dur - GO.PAD));
  if (back + dur > e.d - GO.PAD / 2) return null;
  return { b, to, go, t1, back, dur, end: back + dur, look: [p.lx, p.lz] };
}
export function umpGoEnd(e, T, posts) {
  const b = umpGoFor(e);
  const q = b ? plan(e, T, posts[b - 1]) : null;
  return q ? q.end : 0;
}
export function umpGoAt(e, T, u, post) {
  const q = plan(e, T, post);
  if (!q) return null;
  const out = ease(sat((u - q.go) / q.dur)), home = ease(sat((u - q.back) / q.dur));
  if (u <= q.go || u >= q.end) return null;
  const k = out * (1 - home), x = post[0] + (q.to[0] - post[0]) * k, z = post[1] + (q.to[1] - post[1]) * k;
  if (u < q.t1) return { x, z, dx: q.to[0] - post[0], dz: q.to[1] - post[1], moving: true };
  if (u < q.back) return { x, z, dx: q.look[0] - x, dz: q.look[1] - z, moving: false };
  return { x, z, dx: post[0] - q.to[0], dz: post[1] - q.to[1], moving: true };
}
