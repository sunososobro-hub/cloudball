/* #612 part 4: the bullpens' people (plain data + pure maths, no three.js, no DOM, no Date / Math.random).
 * Each pen holds two relievers and a bullpen catcher from the first frame to the last. From a pitching vote (engine VOTE frame of kind `P`, team = the
 * fielding team) one reliever warms up: he walks from the bench to the rubber PEN_WALK s into the vote window (it opens VOTE_WINDOW s before the
 * frame, as findVote in game.js), then throws a loop to the catcher crouched behind the plate. A `stay` result: he throws PEN_STAY_HOLD s past the
 * vote frame and walks back to the bench. A `change` result: he keeps throwing until the CHG frame starts, then strolls to the bullpen gate by
 * CW_SIGNAL (chgwalk.js), where the reliever who jogs in (part 3) takes over. Renderer only (rules 12, 10): events are read, nothing is written.
 * Frame of one pen as props/bullpens.js: s = m from home along its foul line, d = m off the line (away from fair ground); side +1 = road pen
 * (first base, team 0), -1 = home pen (third base, team 1). world(side, s, d) gives the world x, z. Arm targets as rail.js (right hand; left mirrors x). */
import { CW_SIGNAL, CW_GATE_S, CW_GATE_D } from './chgwalk.js';
export const PEN_WARM_LEAD = 15;          /* s before the vote frame when the warm-up starts (engine VOTE_WINDOW) */
export const PEN_WALK = 3;                /* s from the bench to the rubber and back */
export const PEN_STAY_HOLD = 4;           /* s he keeps throwing after a `stay` vote frame ends */
export const PEN_THROW_PERIOD = 3.2;      /* s per throw */
export const PEN_RUBBER_S = 65.5, PEN_PLATE_D = 18.44, PEN_LANE_D = 9.9; /* = BP.RUBBER_S, BP.PLATE_D, BP.LANES[0] */
export const PEN_BENCH = [[60.2, 14.2], [58.8, 14.2]];  /* reliever A / B idle spots (in front of the bench, BP.BENCH) */
export const PEN_CATCHER = [PEN_RUBBER_S + PEN_PLATE_D + .9, PEN_LANE_D];
export const PEN_MOUND = [PEN_RUBBER_S - .35, PEN_LANE_D];
export const PEN_COUNT = 3;               /* figures per pen: reliever A, reliever B, catcher */
const R2 = Math.SQRT1_2;

/* world x, z of pen point (s, d) and the world direction of a local (ds, dd) */
export function penWorld(side, s, d) { return side > 0 ? [(s + d) * R2, (d - s) * R2] : [-(s + d) * R2, (d - s) * R2]; }
export function penDir(side, ds, dd) { const [x, z] = penWorld(side, ds, dd); return [x, z]; }
export const sideOf = team => team === 0 ? 1 : -1;
const sat = x => x < 0 ? 0 : x > 1 ? 1 : x, sm = x => { const t = sat(x); return t * t * (3 - 2 * t); }, mixV = (a, b, f) => a.map((v, i) => v + (b[i] - v) * f);

/* the warm-up windows of an event list: [{team, who (0 | 1), start, throwEnd, end, change, chgT}] sorted by start (cached per list) */
const cache = new WeakMap();
export function windows(ev) {
  if (!ev) return [];
  if (cache.has(ev)) return cache.get(ev);
  const out = [];
  for (let i = 0; i < ev.length; i++) {
    const v = ev[i]; if (!v || v.k !== 'VOTE' || v.kind !== 'P') continue;
    const change = v.pick === 'change', voteEnd = v.t + v.d, who = (parseInt(String(v.id).replace(/\D+/g, ''), 10) || 0) % 2;
    let chgT = null;
    if (change) for (let j = i + 1; j < ev.length && j < i + 4; j++) if (ev[j].k === 'CHG' && ev[j].def === v.team) { chgT = ev[j].t; break; }
    const throwEnd = change && chgT !== null ? chgT : voteEnd + PEN_STAY_HOLD;
    out.push({ team: v.team, who, start: v.t - PEN_WARM_LEAD, throwEnd, end: change && chgT !== null ? chgT + CW_SIGNAL : throwEnd + PEN_WALK, change: change && chgT !== null, chgT });
  }
  cache.set(ev, out); return out;
}
/* what the figure of reliever `who` of `team` does at time T: null (idle on the bench) or {k: 'out' | 'throw' | 'back' | 'gate', f: 0..1 walk progress, tt: s since the throws began, over: true once the walk to the gate is done (he is the pitcher now)} */
export function warmAt(ev, team, who, T) {
  for (const w of windows(ev)) {
    if (w.team !== team || w.who !== who || T < w.start || T > w.end) continue;
    if (T < w.start + PEN_WALK) return { k: 'out', f: sm((T - w.start) / PEN_WALK), tt: 0 };
    if (T <= w.throwEnd) return { k: 'throw', f: 1, tt: T - w.start - PEN_WALK };
    if (w.change) return { k: 'gate', f: sat((T - w.throwEnd) / CW_SIGNAL), tt: 0, over: T >= w.end };
    return { k: 'back', f: sm((T - w.throwEnd) / PEN_WALK), tt: 0 };
  }
  return null;
}
/* the reliever's spot [s, d] and facing [ds, dd] (local) for a warmAt state (null = idle at his bench spot, facing the lane) */
export function relieverAt(who, st) {
  const home = PEN_BENCH[who % 2], idleFace = [0, -1], thr = [1, 0];
  if (!st) return { p: home, face: idleFace };
  const lerp = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  if (st.k === 'out') return { p: lerp(home, PEN_MOUND, st.f), face: st.f < 1 ? unit(PEN_MOUND[0] - home[0], PEN_MOUND[1] - home[1]) : thr };
  if (st.k === 'throw') return { p: PEN_MOUND, face: thr };
  if (st.k === 'back') return { p: lerp(PEN_MOUND, home, st.f), face: unit(home[0] - PEN_MOUND[0], home[1] - PEN_MOUND[1]) };
  const gate = [CW_GATE_S, CW_GATE_D];
  return { p: lerp(PEN_MOUND, gate, st.f), face: unit(gate[0] - PEN_MOUND[0], gate[1] - PEN_MOUND[1]) };
}
function unit(a, b) { const l = Math.hypot(a, b) || 1; return [a / l, b / l]; }
/* the two hand targets {r, l} (right hand; the left mirrors x) of a throwing loop at tt s: hands together, rock back, release, follow through */
export const THROW_READY = [.04, .62, .38], THROW_BACK = [.32, 1.05, -.25], THROW_OUT = [.12, .9, .75], THROW_LEFT_FWD = [.3, .85, .45], THROW_LEFT_TUCK = [.25, .6, .1];
export function throwHands(tt) {
  const ph = (((tt / PEN_THROW_PERIOD) % 1) + 1) % 1;
  if (ph < .45) return { r: THROW_READY, l: THROW_READY };
  if (ph < .7) { const f = sm((ph - .45) / .25); return { r: mixV(THROW_READY, THROW_BACK, f), l: mixV(THROW_READY, THROW_LEFT_FWD, f) }; }
  if (ph < .82) { const f = sm((ph - .7) / .12); return { r: mixV(THROW_BACK, THROW_OUT, f), l: mixV(THROW_LEFT_FWD, THROW_LEFT_TUCK, f) }; }
  const f = sm((ph - .82) / .18); return { r: mixV(THROW_OUT, THROW_READY, f), l: mixV(THROW_LEFT_TUCK, THROW_READY, f) };
}
