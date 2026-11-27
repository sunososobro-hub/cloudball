/* Turns a batted ball (or a steal) into a defensive play: who fields it, who covers which
 * base, when each throw leaves and arrives, and which outs are legal.
 *
 * The simulation proposes what the defence tries; this module decides what actually happens
 * from positions and travel times. An out is returned only when rules/outs.js accepts it:
 * the ball must be held on the base (force) or in the tagging glove (tag) before the runner
 * arrives. If the defence cannot get there in time, the runner is safe.
 *
 * Plan times are seconds after contact. Out records use seconds into the pitch frame. */
import * as K from '../constants.js';
import { BASES, HOME, FIELD_HOME, dist, fielderStart, runTime, runnerTimeline, throwPlan, coverArrival, clamp } from './field.js';
import { forceOut, tagOut, flyCatch, isForced, beats } from './outs.js';

export const HIT_LIKE = ['1B', '2B', '3B', 'E'];   /* results where the ball is not caught or fielded for an out */
const FIRST_BAG = [BASES[1][0] - K.BAG_FOOT, BASES[1][1]];
const SECOND_PIVOT = [BASES[2][0] - K.BAG_FOOT, BASES[2][1] - K.BAG_FOOT];   /* outfield corner, clear of the slide */
const SECOND_RELAY = [BASES[2][0] - K.RELAY_SPOT_OFF[0], BASES[2][1] - K.RELAY_SPOT_OFF[1]];
const SECOND_TAG = [BASES[2][0] + K.SECOND_TAG_OFF[0], BASES[2][1] + K.SECOND_TAG_OFF[1]];   /* beside the lane from first */
const PAST_FIRST = [BASES[1][0] + K.WILD_THROW_PAST[0], BASES[1][1] + K.WILD_THROW_PAST[1]];   /* foul ground behind first */
const THIRD_BAG = [BASES[3][0] + K.BAG_FOOT, BASES[3][1]];
const THIRD_TAG = [BASES[3][0] + K.THIRD_TAG_OFF, BASES[3][1] + K.THIRD_TAG_OFF];
const toFrame = t => K.ARRIVE + t;
const sinceContact = t => t - K.ARRIVE;

/* The fielder goes to the ball. */
function chase(ctx) {
  const p = ctx.play, hit = HIT_LIKE.includes(p.res);
  const start = fielderStart(p.fielder, ctx.bases, ctx.outs);
  const roll = hit && p.type !== 'GB' ? K.HIT_ROLL_FACTOR : 1;
  const r = dist([p.lx, p.lz], [0, 0]) || 1, inWall = hit ? Math.min(roll, (K.FENCE_R - K.WALL_PICKUP) / r) : 1;   /* #684: a roll stops at the wall */
  const target = [p.lx * inWall, p.lz * inWall];
  const D = dist(target, start);
  const ballDownAt = hit ? p.hang + K.HIT_ROLL_TIME : p.hang;
  const fielderAt = D / (ctx.vavg ? ctx.vavg(p.fielder) : K.FIELD_VAVG) + K.FIELD_REACT;   /* vavg: his chase speed (range, `def`) */
  const catchT = Math.max(ballDownAt, fielderAt) + (ctx.fumble || 0);   /* fumble: seconds lost securing the ball */
  return {
    fielder: p.fielder, start, target, stand: [target[0] - (hit ? 0 : K.CATCH_STAND_OFF), target[1]], D,
    catchT, fielderAt, ballDownAt, hit,
    solo: false, soloAt: null, dp: false, tagPlay: false,
    CV: { key: null, spot: FIELD_HOME.P, base: null, at: 0 }, PV: null, PVspot: null,
    xfer: 0, v: 1, TD: 0, TT: 0, t0: Infinity, a1: null, t1: null, pxfer: K.PIVOT_XFER, TD2: 0, V2: 1, TT2: 0,
    arrive: catchT, rt: catchT + K.RETURN_AFTER_CATCH,
    actions: [{ t: catchT, a: hit || p.type === 'GB' ? 'field' : 'catch', f: p.fielder }],
  };
}

/* One throw from the fielder to `cover` (or back toward the mound when cover.key is null).
 * The throw is held until the receiver is on his spot and not before `notBefore`. */
function throwTo(plan, ctx, cover, { rushBudget = null, notBefore = 0 } = {}) {
  const TD = dist(plan.stand, cover.spot), th = throwPlan(ctx.arm(plan.fielder), plan.fielder, TD, rushBudget);
  const coverAt = cover.key ? coverArrival(fielderStart(cover.key, ctx.bases, ctx.outs), cover.spot, K.FIELD_REACT + K.COVER_REACT, K.COVER_SPEED) : 0;
  let xfer = th.xfer, arrive = plan.catchT + xfer + th.flight;
  const earliest = Math.max(coverAt, notBefore);
  if (arrive < earliest) { xfer += earliest - arrive; arrive = earliest; }
  Object.assign(plan, { CV: { ...cover, at: coverAt }, xfer, v: th.v, TD, TT: th.flight, t0: plan.catchT + xfer, arrive,
    rt: Math.max(plan.catchT + K.RETURN_AFTER_CATCH, plan.catchT + xfer + K.RETURN_AFTER_THROW) });
  plan.actions.push({ t: plan.t0, a: 'throw', f: plan.fielder, to: cover.key });
  if (cover.key) plan.actions.push({ t: coverAt, a: 'cover', f: cover.key, base: cover.base }, { t: arrive, a: 'receive', f: cover.key, base: cover.base });
  return plan;
}

const batterArrival = () => sinceContact(runnerTimeline(0, 1, { kind: 'inplay' }).arriveT);
const slideArrival = (from, to) => sinceContact(runnerTimeline(from, to, { kind: 'inplay', slide: true }).arriveT);
const coverOf = (base, fielder) => base === 3 ? (fielder === '3B' ? 'SS' : '3B') : (fielder === 'SS' ? '2B' : 'SS');

/* Ground ball that the defence fields cleanly.
 * tryDoublePlay: go second-to-first. leadBase: (bunt) go for the lead runner at this base.
 * Returns kind: 'dp' | 'fc' (lead runner out, batter safe) | 'out' (batter out at first) | 'safe' (nobody out). */
export function resolveGround(ctx, { tryDoublePlay = false, leadBase = null } = {}) {
  const B = ctx.bases, batterAt = batterArrival(), f = ctx.play.fielder;
  if (leadBase) {
    const plan = chase(ctx), from = leadBase - 1, runner = B[from - 1], runnerAt = slideArrival(from, leadBase);
    const forced = isForced(from, B, true), key = coverOf(leadBase, f);
    const spot = leadBase === 3 ? (forced ? THIRD_BAG : THIRD_TAG) : (forced ? SECOND_PIVOT : SECOND_TAG);
    throwTo(plan, ctx, { key, spot, base: leadBase }, { rushBudget: runnerAt - K.FORCE_MARGIN - plan.catchT });
    if (!beats(plan.arrive, plan.CV.at, runnerAt)) return { kind: 'safe', plan, outs: [] };
    const ev = { runner, from, base: leadBase, fielder: key, runnerAt: toFrame(runnerAt), ballAt: toFrame(plan.arrive) };
    const out = forced ? forceOut({ ...ev, forced, touchAt: toFrame(plan.CV.at) }) : tagOut({ ...ev, fielderAt: toFrame(plan.CV.at) });
    plan.actions.push({ t: sinceContact(out.at), a: forced ? 'touch' : 'tag', f: key, base: leadBase });
    return { kind: 'fc', plan, outs: [out], outBase: leadBase };
  }
  if (tryDoublePlay && B[0]) {
    const plan = chase(ctx), PV = ['2B', '1B'].includes(f) ? 'SS' : '2B', CVkey = f === '1B' ? 'P' : '1B';
    const TD = dist(plan.stand, SECOND_PIVOT), TD2 = dist(SECOND_PIVOT, FIRST_BAG);
    const th = throwPlan(ctx.arm(f), f, TD, null), th2 = throwPlan(ctx.arm(PV), PV, TD2, null);
    /* the feed is hurried so that the relay can still beat the batter */
    let xfer = clamp(batterAt - K.FORCE_MARGIN - plan.catchT - th.flight - K.PIVOT_XFER - th2.flight, K.XFER_RUSH, th.xfer);
    const pivotAt = coverArrival(fielderStart(PV, B, ctx.outs), SECOND_PIVOT, K.FIELD_REACT, K.PIVOT_SPEED);
    let a1 = plan.catchT + xfer + th.flight;
    if (a1 < pivotAt) { xfer += pivotAt - a1; a1 = pivotAt; }
    const runnerAt = slideArrival(1, 2);
    if (beats(a1, pivotAt, runnerAt)) {
      const coverAt = coverArrival(fielderStart(CVkey, B, ctx.outs), FIRST_BAG, K.FIELD_REACT + K.COVER_REACT, K.COVER_SPEED);
      let pxfer = K.PIVOT_XFER, arrive = a1 + pxfer + th2.flight;
      if (arrive < coverAt) { pxfer += coverAt - arrive; arrive = coverAt; }
      Object.assign(plan, { dp: true, PV, PVspot: SECOND_PIVOT, CV: { key: CVkey, spot: FIRST_BAG, base: 1, at: coverAt }, pivotAt,
        xfer, v: th.v, TD, TT: th.flight, t0: plan.catchT + xfer, a1, pxfer, t1: a1 + pxfer, TD2, V2: th2.v, TT2: th2.flight, arrive,
        rt: Math.max(plan.catchT + K.RETURN_AFTER_CATCH, plan.catchT + xfer + K.RETURN_AFTER_THROW) });
      const outs = [forceOut({ runner: B[0], from: 1, base: 2, fielder: PV, forced: isForced(1, B, true), ballAt: toFrame(a1), touchAt: toFrame(pivotAt), runnerAt: toFrame(runnerAt) })];
      plan.actions.push({ t: plan.t0, a: 'throw', f, to: PV }, { t: pivotAt, a: 'cover', f: PV, base: 2 }, { t: a1, a: 'receive', f: PV, base: 2 },
        { t: a1, a: 'touch', f: PV, base: 2 }, { t: plan.t1, a: 'throw', f: PV, to: CVkey }, { t: coverAt, a: 'cover', f: CVkey, base: 1 }, { t: arrive, a: 'receive', f: CVkey, base: 1 });
      if (!beats(arrive, coverAt, batterAt)) return { kind: 'fc', plan, outs, outBase: 2 };
      outs.push(forceOut({ runner: ctx.batter, from: 0, base: 1, fielder: CVkey, forced: true, ballAt: toFrame(arrive), touchAt: toFrame(coverAt), runnerAt: toFrame(batterAt) }));
      plan.actions.push({ t: arrive, a: 'touch', f: CVkey, base: 1 });
      return { kind: 'dp', plan, outs };
    }
    /* cannot get the runner at second: take the out at first instead */
  }
  const plan = chase(ctx);
  if (f === '1B') {   /* first baseman fields it and takes it to the bag himself */
    const toBag = dist(plan.stand, BASES[1]);
    const soloAt = plan.catchT + K.SOLO_SETUP + (toBag < K.COVER_NEAR ? 0 : runTime(toBag, K.COVER_SPEED));
    Object.assign(plan, { solo: true, soloAt, arrive: soloAt, rt: soloAt + K.SOLO_HOLD, CV: { key: null, spot: FIELD_HOME.P, base: null, at: 0 } });
    if (!beats(plan.catchT, soloAt, batterAt)) return { kind: 'safe', plan, outs: [] };
    plan.actions.push({ t: soloAt, a: 'touch', f, base: 1 });
    return { kind: 'out', plan, outs: [forceOut({ runner: ctx.batter, from: 0, base: 1, fielder: f, forced: true, ballAt: toFrame(plan.catchT), touchAt: toFrame(soloAt), runnerAt: toFrame(batterAt) })] };
  }
  throwTo(plan, ctx, { key: '1B', spot: FIRST_BAG, base: 1 }, { rushBudget: batterAt - K.FORCE_MARGIN - plan.catchT });
  if (!beats(plan.arrive, plan.CV.at, batterAt)) return { kind: 'safe', plan, outs: [] };
  plan.actions.push({ t: plan.arrive, a: 'touch', f: '1B', base: 1 });
  return { kind: 'out', plan, outs: [forceOut({ runner: ctx.batter, from: 0, base: 1, fielder: '1B', forced: true, ballAt: toFrame(plan.arrive), touchAt: toFrame(plan.CV.at), runnerAt: toFrame(batterAt) })] };
}

/* Ball caught in the air. tagUp: { from, to } of a runner who tags up and goes (he is safe:
 * the throw is made, and arrives after him), or null. */
export function resolveFly(ctx, tagUp = null) {
  const plan = chase(ctx);
  const out = flyCatch({ batter: ctx.batter, fielder: plan.fielder, fielderAt: toFrame(plan.fielderAt), ballDownAt: toFrame(plan.ballDownAt), at: toFrame(plan.catchT) });
  if (tagUp) {
    const runnerAt = sinceContact(runnerTimeline(tagUp.from, tagUp.to, { kind: 'inplay', tagUpAt: toFrame(plan.catchT), slide: true }).arriveT);
    const cover = tagUp.to === HOME ? { key: 'C', spot: K.HOME_TAG_SPOT, base: HOME } : { key: '3B', spot: THIRD_TAG, base: 3 };
    throwTo(plan, ctx, cover, { notBefore: runnerAt + K.TAG_LATE });
    plan.tagPlay = true;
  } else throwTo(plan, ctx, { key: null, spot: FIELD_HOME.P, base: null });
  return { plan, outs: [out] };
}

/* Hit, error or home run: nobody is out (except a runner sent home or a batter stretching a single, below). The ball comes back in to second base.
 * throwHome (#38): the outfielder throws home behind the runner scoring from second (he is safe: the ball arrives
 * TAG_LATE after him), so the batter takes second on the throw. */
export function resolveHit(ctx, { throwHome = false, sendHome = false, stretch = false, bobble = false, wildThrow = false } = {}) {
  const plan = chase(ctx), p = ctx.play;
  if (wildThrow) {
    /* advancing on an error (#38): the infielder throws to first in a hurry and the ball sails past the bag into foul
     * ground (nobody receives it); the batter and every runner take an extra base on it */
    throwTo(plan, ctx, { key: null, spot: PAST_FIRST, base: null }, { rushBudget: batterArrival() - K.FORCE_MARGIN - plan.catchT });
    plan.wild = true;
    return { plan, outs: [] };
  }
  if (p.res === 'HR') return { plan: throwTo(plan, ctx, { key: null, spot: FIELD_HOME.P, base: null }), outs: [] };
  if (sendHome) {
    /* out on the bases (#38): the runner from second is sent home; the outfielder throws to the catcher. The ball is
     * held back to TAG_EARLY before the runner (a close play); if it cannot be there by then he is safe and scores. */
    const runnerAt = slideArrival(2, HOME);
    throwTo(plan, ctx, { key: 'C', spot: K.HOME_TAG_SPOT, base: HOME }, { notBefore: runnerAt - K.TAG_EARLY });
    plan.throwHome = true; plan.tagPlay = true;
    if (!beats(plan.arrive, plan.CV.at, runnerAt)) return { plan, outs: [], safe: true };
    const out = tagOut({ runner: ctx.bases[1], from: 2, base: HOME, fielder: 'C', ballAt: toFrame(plan.arrive), fielderAt: toFrame(plan.CV.at), runnerAt: toFrame(runnerAt) });
    plan.actions.push({ t: runnerAt, a: 'tag', f: 'C', base: HOME });
    return { plan, outs: [out], safe: false };
  }
  if (throwHome) {
    const runnerAt = sinceContact(runnerTimeline(2, HOME, { kind: 'inplay', slide: true }).arriveT);
    throwTo(plan, ctx, { key: 'C', spot: K.HOME_TAG_SPOT, base: HOME }, { notBefore: runnerAt + K.TAG_LATE });
    plan.throwHome = true; plan.tagPlay = true;   /* the catcher's late sweep tag, as on a sac fly */
    return { plan, outs: [] };
  }
  let key = p.lx >= 0 ? '2B' : 'SS';
  if (key === p.fielder) key = key === '2B' ? 'SS' : '2B';
  if (stretch) {
    /* out on the bases (#38): the batter tries to stretch the single into a double; the outfielder throws to the
     * middle infielder covering second beside the lane. Held to TAG_EARLY before him (a close play); safe when the
     * ball cannot be there by then. */
    const runnerAt = slideArrival(0, 2);
    throwTo(plan, ctx, { key, spot: SECOND_TAG, base: 2 }, { notBefore: runnerAt - K.TAG_EARLY });
    plan.tagPlay = true;
    if (!beats(plan.arrive, plan.CV.at, runnerAt)) return { plan, outs: [], safe: true };
    const out = tagOut({ runner: ctx.batter, from: 0, base: 2, fielder: key, ballAt: toFrame(plan.arrive), fielderAt: toFrame(plan.CV.at), runnerAt: toFrame(runnerAt) });
    plan.actions.push({ t: runnerAt, a: 'tag', f: key, base: 2 });
    return { plan, outs: [out], safe: false };
  }
  /* bobble (#38): ctx.fumble already delays the pickup; the ball comes in to the relay at second only after the batter is there */
  return { plan: throwTo(plan, ctx, { key, spot: SECOND_RELAY, base: null }, { notBefore: bobble ? slideArrival(0, 2) + K.TAG_LATE : 0 }), outs: [] };
}

/* Steal of second on a pitch that is not put in play. wantOut: the simulation's draw says the
 * catcher throws him out. It only stands if the throw can really be there first.
 * Times are seconds into the pitch frame. */
export function resolveSteal(ctx, wantOut, base = 2) {
  /* base 2: steal of second, SS covers beside the lane from first; base 3 (#38): steal of third, 3B covers inside the diamond */
  const runner = ctx.bases[base - 2];
  const key = base === 3 ? '3B' : 'SS', spot = base === 3 ? THIRD_TAG : SECOND_TAG, from = FIELD_HOME.C;
  const coverAt = K.RELEASE + coverArrival(fielderStart(key, ctx.bases, ctx.outs), spot, K.FIELD_REACT, K.COVER_SPEED);
  const TD = dist(from, spot), th = throwPlan(ctx.arm('C'), 'C', TD, null);
  const catchAt = K.ARRIVE + K.CATCH_SNAP, soonest = Math.max(catchAt + K.CATCHER_POP + th.flight, coverAt);
  /* #23 part 2: the catcher throws right after his pop; the runner's jump comes from the draw. A good jump (safe) has him
   * in STEAL_SAFE_BY before that throw, a bad one (out) STEAL_OUT_BY after it. The break stays between the pitcher's first move
   * and STEAL_BREAK_LAST; only when that range cannot fit does the throw wait (hold) or the out turn safe, as before. */
  const target = wantOut ? soonest + K.STEAL_OUT_BY : soonest - K.STEAL_SAFE_BY, first = base === 3 ? K.STEAL3_FIRST_MOVE : K.STEAL_FIRST_MOVE;
  let start = first, tl = runnerTimeline(base - 1, base, { kind: 'steal', slide: true, start });
  for (let i = 0; i < K.STEAL_FIT_ITER; i++) {
    start = clamp(start + target - tl.arriveT, first, K.STEAL_BREAK_LAST);
    tl = runnerTimeline(base - 1, base, { kind: 'steal', slide: true, start });
  }
  const out = wantOut && soonest < tl.arriveT - K.TAG_EARLY;
  const arrive = Math.max(soonest, out ? tl.arriveT - K.TAG_EARLY : tl.arriveT + K.STEAL_SAFE_BY);
  const plan = { steal: true, CV: { key, spot, base, at: coverAt }, from, TD, v: th.v, TT: th.flight, t0: arrive - th.flight, arrive, runnerAt: tl.arriveT,
    actions: [{ t: arrive - th.flight, a: 'throw', f: 'C', to: key }, { t: coverAt, a: 'cover', f: key, base }, { t: arrive, a: 'receive', f: key, base }] };
  if (!out) return { ok: true, plan, outs: [], tl };
  plan.actions.push({ t: tl.arriveT, a: 'tag', f: key, base });
  return { ok: false, plan, tl, outs: [tagOut({ runner, from: base - 1, base, fielder: key, ballAt: arrive, fielderAt: coverAt, runnerAt: tl.arriveT })] };
}

/* Pickoff at first (#38): the pitcher throws to the first baseman holding the runner on.
 * safe false: the runner dives back and is tagged (tagOut checks the tag beats him).
 * safe true (a throw-over that does not get him): shorter lead, he reads the step-off and is back before the ball;
 * the first baseman lobs it back to the pitcher. Times are seconds into the frame. */
export function resolvePickoff(ctx, safe = false) {
  const runner = ctx.bases[0], from = FIELD_HOME.P, key = '1B', spot = fielderStart(key, ctx.bases, ctx.outs);
  const TD = dist(from, spot), TT = Math.max(K.THROW_MIN, TD / K.PO_THROW_V), t0 = K.PO_THROW_AT, arrive = t0 + TT;
  const lead = safe ? K.POF_LEAD : K.PO_LEAD, react = safe ? -K.POF_READ : K.PO_REACT;
  const runnerAt = t0 + react + runTime(lead, K.RUN_SPEED);
  const plan = { po: true, CV: { key, spot, base: 1, at: 0 }, from, TD, v: K.PO_THROW_V, TT, t0, arrive, runnerAt, lead, react,
    actions: [{ t: t0, a: 'throw', f: 'P', to: key }, { t: arrive, a: 'receive', f: key, base: 1 }] };
  if (!safe) {
    plan.actions.push({ t: runnerAt, a: 'tag', f: key, base: 1 });
    return { plan, outs: [tagOut({ runner, from: 1, base: 1, fielder: key, ballAt: arrive, fielderAt: 0, runnerAt })] };
  }
  if (beats(arrive, 0, runnerAt)) throw new Error(`throw-over beats the runner back to first (${arrive.toFixed(3)} < ${runnerAt.toFixed(3)})`);
  const BT = Math.max(K.THROW_MIN, TD / K.POF_BACK_V), b0 = arrive + K.POF_BACK_AFTER;
  Object.assign(plan, { safe: true, back: { t0: b0, TT: BT, arrive: b0 + BT, v: K.POF_BACK_V } });
  plan.actions.push({ t: b0, a: 'throw', f: key, to: 'P' }, { t: b0 + BT, a: 'receive', f: 'P', base: null });
  return { plan, outs: [] };
}
