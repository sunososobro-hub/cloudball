/* #642 part 1: the pitcher's routine after the catcher's return throw (pure function of time; render only, never alters a result).
   Catch (glove up before CATCH_AT, ball in the glove) -> look at the ball (PB_LOOK s, trunk leans down) -> turn his back to the plate
   (PB_TURN s) -> walk to the rubber at PITCHER_WALK_V (never faster) -> turn back to face the plate (PB_TURN s).
   S = metres he stands in front of the rubber (his stride landing spot). All times are seconds into the pitch frame. */
export const PITCHER_WALK_V = 1.3, PB_LOOK = .7, PB_TURN = .6, PB_GLOVE_UP = .4, PB_LOOK_LEAN = .3, PB_STRIDE = .7, PB_SWING = .35;
const sat = x => Math.max(0, Math.min(1, x)), ease = x => x * x * (3 - 2 * x);
export function pbPlan(catchAt, S) {
  const turn0 = catchAt + PB_LOOK, walk0 = turn0 + PB_TURN, walk1 = walk0 + Math.abs(S) / PITCHER_WALK_V, end = walk1 + PB_TURN;
  return { catchAt, turn0, walk0, walk1, end };
}
/* yaw: radians he is turned away from the plate (0 facing it, PI facing away); z: his z offset from the rubber (S while standing);
   glove: 0..1 reach; look: 0..1 trunk lean; swing: leg swing in radians (the two legs get +swing / -swing); moving: true while walking */
export function pbAt(u, catchAt, S) {
  const p = pbPlan(catchAt, S), t1 = sat((u - p.turn0) / PB_TURN), t2 = sat((u - p.walk1) / PB_TURN), w = sat((u - p.walk0) / (p.walk1 - p.walk0));
  const moving = u > p.walk0 && u < p.walk1, dist = w * Math.abs(S);
  return {
    yaw: Math.PI * (ease(t1) - ease(t2)), z: S * (1 - w),
    glove: ease(sat((u - (catchAt - PB_GLOVE_UP)) / PB_GLOVE_UP)) * (1 - ease(sat((u - p.turn0) / PB_TURN))),
    look: ease(sat((u - catchAt) / .2)) * (1 - ease(sat((u - p.turn0) / PB_TURN))),
    swing: moving ? PB_SWING * Math.sin(2 * Math.PI * dist / PB_STRIDE) : 0, moving, holdsBall: u >= catchAt && u < p.walk1
  };
}
/* #642 part 2: the rubber routine, after he faces the plate again (pbPlan end). A habit of this pitcher (PB_HABITS, picked by his seed:
   rosin bag, wipe the hand on the pants, touch the cap brim, or nothing), skipped on some pitches (event index); then he takes the sign
   (leans toward the catcher, 0..PB_MAX_SHAKES head shakes, a nod) and comes set (hands together at the belt). The hands relax again
   PB_SET_OUT s before the frame ends (PB_MARGIN), so the next delivery starts from its own rest pose with no jump. Every output is 0
   before `end` and from `dur - PB_MARGIN` on. Pieces that do not fit the frame are dropped: the habit first, then the shakes. */
export const PB_HABIT = 1.4, PB_HABIT_RAMP = .35, PB_SIGN_IN = .5, PB_SHAKE = .5, PB_NOD = .4, PB_SET = .5, PB_SET_OUT = .4, PB_MARGIN = .2,
  PB_SIGN_LEAN = .12, PB_SHAKE_YAW = .35, PB_NOD_PITCH = .25, PB_ROSIN_LEAN = .7, PB_WIPE_SWEEP = .08, PB_WIPE_PERIOD = .45,
  PB_SKIP_HABIT = .3, PB_MAX_SHAKES = 2, PB_SHAKE_P = [.6, .9];
export const PB_HABITS = ['rosin', 'wipe', 'cap', 'none'];
/* #642 part 3: runners on / tense moment. Runner on: after the nod he looks over his shoulder at one occupied base (a look only, the engine has no
   pickoff there), PB_LOOK_RUN s, and comes set leaning PB_SET_LEAN_RUN forward. The sign takes PB_RUN_PAUSE s longer per runner and PB_TENSE_PAUSE s
   longer on a full-count pitch (balls 3 or strikes 2). Yaw sign: + turns toward first base (the pitcher faces the plate, x grows toward first). */
export const PB_LOOK_RUN = .7, PB_LOOK_RAMP = .3, PB_LOOK_YAW = .9, PB_SET_LEAN_RUN = .08, PB_RUN_PAUSE = .25, PB_TENSE_PAUSE = .4;
/* hand targets, upper-body local (throwing shoulder at x .3, y .57; glove shoulder at x -.3) */
export const PB_HAND = { rosin: [.32, -.02, .2], wipe: [.3, .02, -.04], cap: [.06, .8, .18] }, PB_SET_T = [.02, .2, .3], PB_SET_G = [-.02, .2, .3];
/* where the elbows point (skinned arms bend toward it): out and down to the cap, down and out when set */
export const PB_POLE = { cap: [1, -.3, .3], setT: [1, -1, 0], setG: [-1, -1, 0] };
/* 32-bit hash -> 0..1; pbSeedOf turns a pitcher id (any string) into his seed */
const h01 = (a, b) => { let h = Math.imul((a | 0) ^ Math.imul(b | 0, 0x9e3779b1), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296 };
export function pbSeedOf(id) { let h = 2166136261; for (const c of String(id)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0 }
/* sit (optional): { b: [first, second, third] truthy when occupied, c: [balls, strikes] }; no sit = nobody on, no pause scaling */
export function pbRubberPlan(end, dur, seed, ei, sit) {
  const occ = sit && sit.b ? [0, 1, 2].filter(i => sit.b[i]) : [], run = occ.length;
  const lookAt = run ? occ[Math.floor(h01(seed, 90000 + ei) * run)] : -1;
  const lookDir = lookAt === 0 ? 1 : lookAt === 2 ? -1 : lookAt === 1 ? (h01(seed, 7) < .5 ? 1 : -1) : 0;
  const tense = sit && sit.c && (sit.c[0] >= 3 || sit.c[1] >= 2) ? 1 : 0;
  let extra = run * PB_RUN_PAUSE + tense * PB_TENSE_PAUSE, look = run > 0;
  let habit = PB_HABITS[Math.floor(h01(seed, 1) * PB_HABITS.length)];
  if (h01(seed, 1000 + ei) < PB_SKIP_HABIT) habit = 'none';
  const r = h01(seed, 50000 + ei);
  let shakes = r < PB_SHAKE_P[0] ? 0 : r < PB_SHAKE_P[1] ? 1 : PB_MAX_SHAKES;
  const outEnd = dur - PB_MARGIN, out0 = outEnd - PB_SET_OUT;
  const lay = () => { const h1 = end + (habit === 'none' ? 0 : PB_HABIT), s1 = h1 + PB_SIGN_IN + extra, k1 = s1 + shakes * PB_SHAKE, n1 = k1 + PB_NOD, l1 = n1 + (look ? PB_LOOK_RUN : 0), set1 = l1 + PB_SET;
    return { end, dur, habit, shakes, h0: end, h1, s0: h1, s1, k1, n1, l0: n1, l1, lookDir: look ? lookDir : 0, run, set0: l1, set1, out0, outEnd, fits: set1 <= out0 } };
  let p = lay();
  if (!p.fits) { habit = 'none'; p = lay() }
  if (!p.fits) { extra = 0; p = lay() }
  if (!p.fits) { look = false; p = lay() }
  if (!p.fits) { shakes = 0; p = lay() }
  return p;
}
const bump = (u, a, b, ramp) => b <= a ? 0 : Math.min(ease(sat((u - a) / ramp)), 1 - ease(sat((u - (b - ramp)) / ramp)));
/* lean: extra trunk lean (radians, + forward); headYaw / headPitch: head turn and nod; hand: target of the throwing hand or null,
   handW its 0..1 weight over his rest arm; set: 0..1 weight of both hands at PB_SET_T / PB_SET_G */
export function pbRubberAt(u, p) {
  const z = { lean: 0, headYaw: 0, headPitch: 0, hand: null, handW: 0, set: 0 };
  if (!p.fits || u <= p.end || u >= p.outEnd) return z;
  if (p.habit !== 'none' && u < p.h1) {
    const w = bump(u, p.h0, p.h1, PB_HABIT_RAMP), H = PB_HAND[p.habit];
    z.hand = p.habit === 'wipe' ? [H[0], H[1], H[2] + PB_WIPE_SWEEP * Math.sin(2 * Math.PI * (u - p.h0) / PB_WIPE_PERIOD)] : H;
    z.handW = w; if (p.habit === 'rosin') z.lean = PB_ROSIN_LEAN * w;
    return z;
  }
  z.lean = PB_SIGN_LEAN * Math.min(ease(sat((u - p.s0) / PB_SIGN_IN)), 1 - ease(sat((u - p.set0) / PB_SET)));
  if (p.lookDir && u > p.l0 && u < p.l1) z.headYaw = p.lookDir * PB_LOOK_YAW * bump(u, p.l0, p.l1, PB_LOOK_RAMP);
  if (u > p.s1 && u < p.k1) z.headYaw = PB_SHAKE_YAW * Math.sin(2 * Math.PI * (u - p.s1) / PB_SHAKE);
  if (u > p.k1 && u < p.n1) z.headPitch = PB_NOD_PITCH * Math.sin(Math.PI * (u - p.k1) / PB_NOD);
  z.set = Math.min(ease(sat((u - p.set0) / PB_SET)), 1 - ease(sat((u - p.out0) / PB_SET_OUT)));
  if (p.run) z.lean += PB_SET_LEAN_RUN * z.set;
  return z;
}
