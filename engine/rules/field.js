/* Field geometry, defensive alignment and running kinematics. Pure functions.
 * Coordinates: home plate at [0, 0], x to the first-base side, -z toward centre field. */
import * as K from '../constants.js';

export const BASE_PATH = 27.43;
/* index 0 and 4 are home plate, 1..3 the bases */
export const BASES = [[0, 0], [19.4, -19.4], [0, -38.8], [-19.4, -19.4], [0, 0]];
export const HOME = 4;

export const FIELDER_KEYS = ['P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];
export const OUTFIELD_KEYS = ['LF', 'CF', 'RF'];
/* [angle from the centre-field line in degrees, distance from home] */
export const FIELD_SPOTS = { P: [0, 18.4], C: [180, 1.3], '1B': [38, 30], '2B': [15, 42], SS: [-15, 42], '3B': [-38, 30], LF: [-28, 84], CF: [0, 95], RF: [28, 84] };

/* Sine and cosine of an angle in degrees, from + - * / only (#7). Those are exactly rounded in every
 * JavaScript engine; Math.sin and Math.cos are not: their last bit may differ between V8, JavaScriptCore
 * and SpiderMonkey, and one bit in a landing spot can decide which fielder is nearest. The angle is
 * folded to within half a quarter turn of an axis (exact), then the Taylor series is summed in a fixed
 * order; with TRIG_TERMS terms what is left of the series is far below the last bit. Never returns -0. */
const QUARTER = 90, TURN = 4 * QUARTER, DEG = Math.PI / (2 * QUARTER), TRIG_TERMS = 10;
export function sinCosDeg(angleDeg) {
  if (!Number.isFinite(angleDeg)) return [NaN, NaN];
  const a = Math.abs(angleDeg) % TURN, q = Math.round(a / QUARTER), t = (a - q * QUARTER) * DEG, z = t * t;
  let s = 1, c = 1;
  for (let k = TRIG_TERMS; k >= 1; k--) { s = 1 - z / (2 * k * (2 * k + 1)) * s; c = 1 - z / ((2 * k - 1) * 2 * k) * c; }
  s *= t;
  const [sin, cos] = [[s, c], [c, -s], [-s, -c], [-c, s]][q % 4];
  return [(angleDeg < 0 ? -sin : sin) + 0, cos + 0];
}
export const spotXZ = (angleDeg, d) => { const [sin, cos] = sinCosDeg(angleDeg); return [sin * d, 0 - cos * d]; };
export const FIELD_HOME = Object.fromEntries(FIELDER_KEYS.map(k => [k, spotXZ(...FIELD_SPOTS[k])]));

export const dist = (a, b) => Math.sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]));
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sat01 = x => clamp(x, 0, 1);
const ease = x => x * x * (3 - 2 * x);

/* Where a fielder stands when the pitch is thrown, given who is on base (bases: [1st, 2nd, 3rd]). */
export function fielderStart(key, bases, outs) {
  const home = FIELD_HOME[key], toward = (p, a) => [lerp(home[0], p[0], a), lerp(home[1], p[1], a)];
  const dpDepth = outs < K.OUTS_PER_HALF - 1;
  if (key === '1B' && bases[0]) return [BASES[1][0] - K.HOLD_OFF, BASES[1][1] - K.HOLD_OFF];
  if (key === '2B' && bases[0] && dpDepth) return toward(BASES[2], K.DP_SHIFT);
  if (key === 'SS' && bases[1]) return toward(BASES[2], K.HOLD2_SHIFT);
  if (key === 'SS' && bases[0] && dpDepth) return toward(BASES[2], K.DP_SHIFT);
  if (key === '3B' && bases[2]) return toward([BASES[3][0] + K.HOLD_OFF, BASES[3][1] - K.HOLD_OFF], K.HOT3_SHIFT);
  return home;
}

/* Distance covered t seconds after starting to run toward top speed v (linear acceleration). */
export const runDist = (t, v) => t <= 0 ? 0 : t < K.RUN_ACCEL ? 0.5 * v / K.RUN_ACCEL * t * t : 0.5 * v * K.RUN_ACCEL + v * (t - K.RUN_ACCEL);
/* Inverse of runDist: seconds needed to cover d. */
export function runTime(d, v) {
  const accelDist = 0.5 * v * K.RUN_ACCEL;
  return d <= accelDist ? Math.sqrt(2 * d * K.RUN_ACCEL / v) : K.RUN_ACCEL + (d - accelDist) / v;
}

/* A runner's lead off his base, u seconds into a pitch frame: the primary lead, the secondary lead as the pitch is
 * thrown, then back to the primary lead (#23 part 1: he no longer goes back to the bag, so a steal starts from a lead). */
export function leadAt(u) {
  if (u < K.ARRIVE) return lerp(K.LEAD_PRIMARY, K.LEAD_PITCH, ease(sat01((u - (K.RELEASE - K.LEAD_OPEN)) / K.LEAD_GROW)));
  return lerp(K.LEAD_PITCH, K.LEAD_PRIMARY, ease(sat01((u - (K.ARRIVE + K.LEAD_BACK_AT)) / K.LEAD_BACK_DUR)));
}

/* Lead of a runner who tags up on a caught fly (he starts from the bag at tagUpAt): the secondary lead, then back to
 * the bag, by tagUpAt at the latest. */
export function tagLeadAt(u, tagUpAt) {
  const back = Math.min(K.ARRIVE + K.LEAD_BACK_AT, tagUpAt), dur = Math.min(K.LEAD_BACK_DUR, tagUpAt - back);
  if (u < back) return leadAt(u);
  return dur > 0 ? lerp(leadAt(back), K.LEAD_STAND, ease(sat01((u - back) / dur))) : K.LEAD_STAND;
}

/* When a base runner starts and arrives (seconds into the pitch frame).
 * start: break time override (#23: a steal's jump). kind: 'inplay' | 'steal' | 'walk' | 'wp' | 'bk' | 'trot' (home run: 'inplay' start, HR_TROT_SPEED). tagUpAt: earliest legal start on a caught fly (or null). */
export function runnerTimeline(from, to, { kind, tagUpAt = null, slide = false, start = null }) {
  const startRun = start != null ? start : kind === 'inplay' || kind === 'trot' ? K.ARRIVE + K.BAT_RUN_DELAY : kind === 'steal' ? K.RELEASE - K.STEAL_JUMP : kind === 'wp' ? K.ARRIVE + K.WP_BREAK : kind === 'bk' ? K.BK_CALL_AT + K.WALK_DELAY : K.ARRIVE + K.WALK_DELAY;
  const spd = kind === 'walk' ? K.WALK_SPEED : kind === 'trot' ? K.HR_TROT_SPEED : kind === 'steal' ? K.STEAL_SPEED : K.RUN_SPEED;   /* 'wp' (wild pitch) runs at full speed */
  const st0 = from > 0 && tagUpAt != null ? tagUpAt : startRun;
  const tag = from > 0 && tagUpAt != null, lead = from > 0 ? (tag ? K.LEAD_STAND : leadAt(st0)) : 0;
  const total = (to - from) * BASE_PATH;
  const slideTime = 2 * K.SLIDE_D / spd;
  const ts = slide ? st0 + runTime(Math.max(0, total - K.SLIDE_D - lead), spd) : Infinity;
  const arriveT = slide ? ts + slideTime : st0 + runTime(total - lead, spd);
  return tag ? { st0, lead, spd, slide, ts, slideTime, arriveT, tag } : { st0, lead, spd, slide, ts, slideTime, arriveT };
}

/* Throw speed and glove-to-hand transfer for a fielder. rushBudget: seconds from the catch
 * until the ball must arrive (the transfer is shortened to fit, down to XFER_RUSH), or null. */
export function throwPlan(arm, pos, d, rushBudget) {
  const a = clamp((arm || 1) - K.ARM_MIN, 0, K.ARM_SPAN) / K.ARM_SPAN;
  const outfield = OUTFIELD_KEYS.includes(pos), short = d < K.THROW_SHORT;
  const [v0, dv] = short ? K.THROW_V_SHORT : outfield ? K.THROW_V_OUTFIELD : K.THROW_V_INFIELD;
  const v = v0 + dv * a;
  let xfer = clamp(K.XFER_BASE - K.XFER_ARM * a + (outfield ? K.XFER_OUTFIELD : 0) - (short ? K.XFER_SHORT : 0), K.XFER_MIN, K.XFER_MAX);
  if (rushBudget != null) xfer = Math.min(xfer, Math.max(K.XFER_RUSH, rushBudget - d / v));
  return { v, xfer, flight: Math.max(K.THROW_MIN, d / v) };
}

/* When a fielder who breaks for a spot at contact gets there (seconds after contact). */
export function coverArrival(from, spot, react, speed) {
  const d = dist(from, spot);
  return d < K.COVER_NEAR ? 0 : react + runTime(d, speed);
}
