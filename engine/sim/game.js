/* Deterministic baseball game simulation.
 *
 *   simGame(seed, decisions, opts) -> { ev, stream, final, stats, ... }
 *
 * Same seed + same decisions + same rosters + same engine commit = the same game.
 * `ev` is the list of broadcast frames (one per pitch, break, change...) that the viewer plays
 * back. `stream` is the flat, indexed event stream (pitch, swing, contact, fielder action, out
 * with its reason, run scored, substitution...) that everything else consumes.
 *
 * The simulation draws what the players try; rules/fielding.js decides what the defence can
 * really do, and rules/outs.js is the only way an out gets recorded. */
import * as K from '../constants.js';
import { mulberry32 } from '../rng.js';
import { FIELDER_KEYS, OUTFIELD_KEYS, HOME, spotXZ, dist, clamp, runnerTimeline, fielderStart } from '../rules/field.js';
import { strikeout, isForced } from '../rules/outs.js';
import { resolveGround, resolveFly, resolveHit, resolveSteal, resolvePickoff } from '../rules/fielding.js';
import { TEAMS } from '../../league/teams.js';
import { ROSTERS } from '../../league/players.js';
import { COPY } from './copy.js';

const GLOVE_KEYS = FIELDER_KEYS.filter(k => k !== 'P' && k !== 'C');            /* the seven who chase batted balls */
const INFIELD_KEYS = GLOVE_KEYS.filter(k => !OUTFIELD_KEYS.includes(k));
const span = (rng, [min, width]) => min + rng() * width;
const round3 = x => Math.round(x * K.STREAM_TIME_PRECISION) / K.STREAM_TIME_PRECISION;

export function simGame(seed, decisions, opts) {
  decisions = decisions || {}; opts = opts || {};
  seed = seed >>> 0;
  const allRosters = opts.rosters || ROSTERS;
  const TI = opts.teams || [0, 1], TT = TI.map(i => TEAMS[i]);
  const RR = TI.map((ti, k) => {
    const r = allRosters[ti], sp = opts.starters ? opts.starters[k] : seed % K.ROTATION_SIZE;
    const rp = r.pit.filter(p => p.role !== 'SP'), o = opts.pen ? opts.pen[k] % rp.length : 0;
    return { bat: r.bat.slice(), bench: (r.bench || []).slice(), pit: [r.pit[sp], ...rp.slice(o), ...rp.slice(0, o)] };
  });
  const pinchHit = opts.pinchHit ?? K.PINCH_HIT_ON;   /* #436 part 2: off = factory games byte for byte */
  const R = mulberry32(seed);                          /* decides outcomes */
  const look = mulberry32((seed ^ K.COSMETIC_SALT) >>> 0);   /* decides looks only; never read by outcome code */
  const ev = [], stream = [];
  let t = K.PRE_DUR, decisionNo = 0, over = false, lead = -1, wp = null, lp = null;
  const st = { inn: 1, half: 0, outs: 0, b: [null, null, null], sc: [0, 0], ls: [[], []], H: [0, 0], E: [0, 0],
    lu: [0, 0], pi: [0, 0], pc: [0, 0], ra: [0, 0], hold: [0, 0], steal: false, sbAsked: false, ibbAsked: false, phAsked: false };
  const newLine = () => ({ ab: 0, h: 0, d: 0, t: 0, hr: 0, rbi: 0, bb: 0, k: 0 });
  /* stats: one row per player who batted; the first LINEUP_SIZE rows are the starting lineup in order, a pinch hitter
   * gets a new row (batters[k][row] = his name) and row[k][slot] points at the row of whoever holds that slot now */
  const stats = [0, 1].map(k => RR[k].bat.map(newLine)), batters = [0, 1].map(k => RR[k].bat.map(b => b.name));
  const row = [0, 1].map(k => RR[k].bat.map((_, i) => i));
  const batValue = b => b.con * b.pow;
  const pst = [0, 1].map(k => RR[k].pit.map(() => ({ outs: 0, r: 0, h: 0, bb: 0, k: 0, hr: 0, bf: 0 })));

  const snap = () => ({ inn: st.inn, half: st.half, outs: st.outs, b: st.b.slice(), sc: st.sc.slice(), ls: [st.ls[0].slice(), st.ls[1].slice()], H: st.H.slice(), E: st.E.slice() });
  const emit = (type, time, data) => stream.push({ i: stream.length, f: ev.length, t: round3(time), type, ...data });
  const pushFrame = e => { ev.push(e); t += e.d; };
  const pitIdx = d => allRosters[TI[d]].pit.indexOf(RR[d].pit[st.pi[d]]);   /* index in the team roster, which is what viewers look up */
  const spdOf = (team, name) => (RR[team].bat.find(b => b.name === name) || { spd: 1 }).spd;
  const stealTryP = (team, name) => clamp(K.STEAL_TRY_BASE + (spdOf(team, name) - 1) * K.STEAL_TRY_PER_SPD, ...K.STEAL_TRY_RANGE);
  const stealOkP = (team, name, base) => base === 3 ? clamp(K.STEAL3_OK_BASE + (spdOf(team, name) - 1) * K.STEAL_OK_PER_SPD, ...K.STEAL3_OK_RANGE)
    : clamp(K.STEAL_OK_BASE + (spdOf(team, name) - 1) * K.STEAL_OK_PER_SPD, ...K.STEAL_OK_RANGE);
  /* the base a runner may steal now: second (first occupied, second open) or third (#38: second alone) */
  const stealBase = () => st.outs >= K.OUTS_PER_HALF - 1 ? 0 : st.b[0] && !st.b[1] ? 2 : st.b[1] && !st.b[0] && !st.b[2] ? 3 : 0;
  const armOf = def => key => (key === 'P' ? RR[def].pit[st.pi[def]] : RR[def].bat.find(b => b.pos === key) || {}).arm || 1;
  /* chase speed of a fielder (rules/fielding.js chase): the pitcher has no `def` (1); a missing `def` is 1, so FIELD_VAVG * 1
   * keeps old games exact. An out lands within the reach of the slower of him and the average pace (reach below):
   * a quicker fielder gets to the same ball sooner (time for the throw), a slower one is never asked for a catch
   * he cannot make (rules/outs.js flyCatch). */
  const defOf = (def, key) => key === 'P' ? 1 : clamp((RR[def].bat.find(b => b.pos === key) || {}).def || 1, K.DEF_MIN, K.DEF_MAX);
  const rangeOf = def => key => K.FIELD_VAVG * defOf(def, key);
  /* hit / error chance factor of a defence for a ball type (constants.js DEF_HIT_WEIGHT): 1 exactly when nobody has `def` */
  const defGroup = (def, type) => { const ks = type === 'GB' ? INFIELD_KEYS : type === 'PU' ? GLOVE_KEYS : OUTFIELD_KEYS; return ks.reduce((t, k) => t + defOf(def, k), 0) / ks.length; };
  const defFactor = (def, type, w) => 1 / (1 + (defGroup(def, type) - 1) * w);
  /* pitch mix of a pitcher (#378): a `pitches` list ({ name: rating } as league/freeagents.js stores it, or plain names) keeps only his own PITCH_TYPES,
   * each with its factory share, rescaled to sum 1; no list (every factory pitcher), or no known name in it = all of
   * PITCH_TYPES, the same table as before. Drawn with `look`, so it changes the pitch name and km/h, never an outcome. */
  const mixes = new Map();
  const mixOf = p => {
    if (!p.pitches) return K.PITCH_TYPES;
    if (!mixes.has(p)) {
      const has = n => Array.isArray(p.pitches) ? p.pitches.includes(n) : Object.prototype.hasOwnProperty.call(p.pitches, n);
      const own = K.PITCH_TYPES.map((t, i) => [t, t[1] - (i ? K.PITCH_TYPES[i - 1][1] : 0)]).filter(([t]) => has(t[0]));
      const total = own.reduce((s, [, w]) => s + w, 0); let cum = 0;
      mixes.set(p, own.length ? own.map(([t, w], i) => [t[0], i === own.length - 1 ? 1 : (cum += w / total), t[2]]) : K.PITCH_TYPES);
    }
    return mixes.get(p);
  };
  const addRun = n => { const o = st.half; st.sc[o] += n; st.ls[o][st.inn - 1] = (st.ls[o][st.inn - 1] || 0) + n; };

  /* A decision the fans (or anyone outside the engine) may make. Without an entry in
   * `decisions` the coach's own pick is used and the frame is marked pending. */
  const vote = (team, kind, q, options, ai) => {
    const id = `${kind}${decisionNo++}`, has = Object.prototype.hasOwnProperty.call(decisions, id), pick = has ? decisions[id] : ai;
    emit('decision', t, { id, team, kind, pick, pending: !has });
    pushFrame({ t, d: K.VOTE_DUR, k: 'VOTE', id, team, kind, q, opts: options, ai, pick, pending: !has, s0: snap(), s1: snap(),
      desc: COPY.voteResult(TT[team], options.find(o => o[0] === pick)[1]) });
    return pick;
  };

  /* Walk or hit-by-pitch: the batter takes first and only forced runners move. */
  const forceAdvance = who => {
    const m = [], B = st.b, nb = B.slice(); let runs = 0;
    if (B[0]) { if (B[1]) { if (B[2]) { m.push([3, HOME, B[2]]); runs++; } m.push([2, 3, B[1]]); nb[2] = B[1]; } m.push([1, 2, B[0]]); nb[1] = B[0]; }
    m.push([0, 1, who]); nb[0] = who; st.b = nb;
    return { moves: m, runs };
  };

  /* Stream events for one pitch frame, in time order. */
  const emitPitchFrame = (e, x) => {
    const [off, bi] = e.bat, bat = RR[off].bat[bi], out = [], add = (type, time, data) => out.push({ type, time, data });
    const who = { batter: bat.name, team: off, lineup: bi };
    if (e.r === 'ibb') add('intentional_walk', e.t + e.showAt, { ...who, pitcher: x.pitcher });
    else if (e.po) add('pickoff', e.t + K.PO_THROW_AT, { ...who, pitcher: x.pitcher, runner: e.s0.b[0], base: 1, count: e.c0, safe: e.pof ? true : undefined, runnerAt: e.pof ? round3(e.t + e.plan.runnerAt) : undefined });
    else if (e.r === 'bk') add('balk', e.t + e.showAt, { ...who, pitcher: x.pitcher, count: e.c0 });
    else {
      add('pitch', e.t + K.RELEASE, { ...who, pitcher: x.pitcher, pitchType: e.pt, kmh: e.kmh, inZone: e.inZ, count: e.c0, n: e.pc });
      if (e.swing) add('swing', e.t + K.ARRIVE, { ...who });
      if (e.r === 'inplay') add('contact', e.t + K.ARRIVE, { ...who, ball: e.play.type, bunt: !!e.play.bunt, spray: round3(e.play.spray), dist: round3(e.play.dist), hang: round3(e.play.hang), land: [round3(e.play.lx), round3(e.play.lz)], fielder: e.play.fielder });
      else add('call', e.t + K.ARRIVE + K.CALL_LAG, { ...who, call: { ball: 'ball', cstr: 'called_strike', sstr: 'swinging_strike', foul: 'foul', hbp: 'hit_by_pitch' }[e.r], count: e.c1 });
    }
    if (e.plan) for (const a of e.plan.actions) add('fielder_action', e.t + (e.plan.steal || e.plan.po ? a.t : K.ARRIVE + a.t), { action: a.a, fielder: a.f, base: a.base ?? null, to: a.to ?? null, team: 1 - off });
    let n = e.s0.outs;
    for (const o of e.outs) add('out', e.t + o.at, { ...o, at: undefined, ballAt: o.ballAt == null ? undefined : round3(e.t + o.ballAt), touchAt: o.touchAt == null ? undefined : round3(e.t + o.touchAt),
      fielderAt: o.fielderAt == null ? undefined : round3(e.t + o.fielderAt), runnerAt: o.runnerAt == null ? undefined : round3(e.t + o.runnerAt), team: off, outs: ++n, steal: e.sbGo ? true : undefined, pickoff: e.po ? true : undefined });
    const gone = new Set(e.outs.map(o => o.runner)), inningOver = e.s1.outs >= K.OUTS_PER_HALF;
    let sc = e.s0.sc[off];
    if (!(inningOver && e.outs.length)) for (const m of e.moves) {
      if (gone.has(m[2])) continue;
      add('runner_advance', e.t + m[3].arriveT, { runner: m[2], from: m[0], to: m[1], team: off, how: e.sbGo ? 'steal' : e.bk ? 'balk' : e.pb ? 'passed_ball' : e.wp ? 'wild_pitch' : e.r === 'inplay' ? 'batted' : 'walk' });
      if (m[1] === HOME) add('run_scored', e.t + m[3].arriveT, { runner: m[2], team: off, runs: ++sc });
    }
    if (e.pa) add('pa_end', e.t + Math.max(e.showAt, ...out.map(o => o.time - e.t)), { ...who, pitcher: x.pitcher, result: x.result, rbi: x.rbi || 0 });
    out.sort((a, b) => a.time - b.time);
    for (const o of out) emit(o.type, o.time, o.data);
  };

  emit('game_start', 0, { seed, engine: K.ENGINE_VERSION, teams: TT.map(T => T.id), lineups: RR.map(r => r.bat.map(b => b.name)), starters: RR.map(r => r.pit[0].name) });
  pushFrame({ t: 0, d: K.PRE_DUR, k: 'PRE', desc: COPY.pre(), s0: snap(), s1: snap() });
  t = K.PRE_DUR;

  while (!over) {
    if (ev.length > K.MAX_FRAMES) throw new Error(`game ${seed} did not terminate`);
    const off = st.half, def = 1 - off;
    st.ls[off][st.inn - 1] = st.ls[off][st.inn - 1] || 0;
    emit('half_start', t, { inning: st.inn, half: off, team: off });
    if (st.inn > K.REGULATION_INNINGS && !st.b[K.TIEBREAK_RUNNER_BASE - 1]) {
      const name = RR[off].bat[(st.lu[off] + K.LINEUP_SIZE - 1) % K.LINEUP_SIZE].name;
      st.b[K.TIEBREAK_RUNNER_BASE - 1] = name;
      emit('runner_placed', t, { runner: name, base: K.TIEBREAK_RUNNER_BASE, team: off });
    }
    while (st.outs < K.OUTS_PER_HALF && !over) {
      if (ev.length > K.MAX_FRAMES) throw new Error(`game ${seed} did not terminate`);
      /* ---- pitching change ---- */
      /* The question comes up a little before the coach himself would act. His own pick: a reliever who is asked
       * about comes out; a starter stays until his pitch budget (shorter with every run allowed, and late) is spent. */
      const spBudget = K.SP_LIMIT_PITCHES - st.ra[def] * K.SP_LIMIT_PER_RUN - (st.inn >= K.SP_LATE_INNING ? K.SP_LATE_CUT : 0);
      const tired = () => st.pi[def] === 0 ? (st.pc[def] > spBudget - span(R, K.SP_ASK_BEFORE) || st.ra[def] >= span(R, K.SP_PULL_RUNS)) : (st.pc[def] > span(R, K.RP_PULL_PITCHES) || st.ra[def] >= K.RP_PULL_RUNS);
      if (st.pi[def] < RR[def].pit.length - 1 && st.hold[def] <= 0 && tired()) {
        const cur = RR[def].pit[st.pi[def]], nx = RR[def].pit[st.pi[def] + 1];
        const coach = st.pi[def] > 0 || st.pc[def] >= spBudget || st.ra[def] >= K.SP_MAX_RUNS ? 'change' : 'stay';
        const pick = vote(def, 'P', COPY.askChange(cur, st.pc[def]), [['change', COPY.optChange(nx)], ['stay', COPY.optStay(cur)]], coach);
        if (pick === 'stay') { st.hold[def] = K.STAY_HOLD_BATTERS; continue; }
        const s0 = snap(); st.pi[def]++; st.pc[def] = 0; st.ra[def] = 0;
        emit('substitution', t, { team: def, role: 'pitcher', out: cur.name, in: nx.name });
        pushFrame({ t, d: K.CHANGE_DUR, k: 'CHG', desc: COPY.change(TT[def], nx), s0, s1: snap(), def });
        continue;
      }
      /* ---- offence: pinch hit (#436 part 2)? Late, a runner in scoring position, a better bat on the bench. The new man
       * takes the slot and the position of the one he replaces and stays in; the replaced player is out of the game. ---- */
      if (pinchHit && !st.phAsked && st.inn >= K.PH_MIN_INNING && (st.b[1] || st.b[2]) && RR[off].bench.length) {
        st.phAsked = true;
        const slot = st.lu[off], cur = RR[off].bat[slot];
        const ph = RR[off].bench.reduce((a, b) => batValue(b) > batValue(a) ? b : a);
        if (batValue(ph) > batValue(cur)) {
          const coach = batValue(ph) - batValue(cur) >= K.PH_EDGE ? 'ph' : 'stay';
          const pick = vote(off, 'H', COPY.askPinch(cur, ph), [['ph', COPY.optPinch(ph)], ['stay', COPY.optLetHit(cur)]], coach);
          if (pick === 'ph') {
            const s0 = snap(), inPlayer = { ...ph, pos: cur.pos };
            RR[off].bench = RR[off].bench.filter(b => b !== ph); RR[off].bat[slot] = inPlayer;
            row[off][slot] = stats[off].length; stats[off].push(newLine()); batters[off].push(ph.name);
            emit('substitution', t, { team: off, role: 'pinch_hitter', out: cur.name, in: ph.name, lineup: slot, pos: cur.pos });
            pushFrame({ t, d: K.PH_DUR, k: 'SUB', desc: COPY.pinch(TT[off], ph, cur), s0, s1: snap(), team: off, lineup: slot });
          }
          continue;
        }
      }
      const pit0 = RR[def].pit[st.pi[def]], bi = st.lu[off], bat = RR[off].bat[bi], bs = stats[off][row[off][bi]], ps = pst[def][st.pi[def]];
      const tire = Math.max(0, st.pc[def] - K.TIRE_AFTER_PITCHES);
      const pit = { name: pit0.name, stuff: pit0.stuff * (1 - tire * K.TIRE_STUFF_PER_PITCH), ctrl: pit0.ctrl * (1 - tire * K.TIRE_CTRL_PER_PITCH) };
      const line = COPY.batLine(bs), pline = COPY.pitLine(ps);
      const ctxOf = play => ({ play, bases: st.b.slice(), outs: st.outs, batter: bat.name, arm: armOf(def), vavg: rangeOf(def) });
      const endPA = () => { st.lu[off] = (bi + 1) % K.LINEUP_SIZE; st.hold[def]--; ps.bf++; st.phAsked = false; };

      /* ---- offence: steal second (or third, #38)? The runner breaks on the next real pitch. st.steal = the base. ---- */
      const sbB = stealBase();
      if (sbB && !st.sbAsked && R() < (sbB === 3 ? K.STEAL3_CONSIDER_P : K.STEAL_CONSIDER_P)) {
        st.sbAsked = true; if (R() < stealTryP(off, st.b[sbB - 2])) st.steal = sbB;
        continue;
      }
      st.sbAsked = false;
      /* ---- defence: intentional walk? ---- */
      if ((st.b[1] || st.b[2]) && !st.b[0] && st.outs < K.OUTS_PER_HALF - 1 && st.inn >= K.IBB_MIN_INNING && bat.pow > K.IBB_MIN_POWER && !st.ibbAsked && R() < K.IBB_CONSIDER_P) {
        st.ibbAsked = true; const close = Math.abs(st.sc[0] - st.sc[1]) <= K.IBB_CLOSE_RUNS, late = st.inn >= K.IBB_COACH_MIN_INNING;
        const pick = vote(def, 'I', COPY.askIbb(bat), [['ibb', COPY.optIbb()], ['pitch', COPY.optPitch()]], close && late ? 'ibb' : 'pitch');
        if (pick === 'ibb') {
          const s0 = snap(), nb = st.b.slice(); nb[0] = bat.name; st.b = nb; bs.bb++; ps.bb++; endPA(); st.ibbAsked = false;
          const e = { t, k: 'P', r: 'ibb', bat: [off, bi], pit: [def, pitIdx(def)], pc: st.pc[def], c0: [0, 0], c1: [0, 0], inZ: false, zx: K.IBB_PITCH_SPOT[0], zy: K.IBB_PITCH_SPOT[1], line, pline, s0,
            moves: [[0, 1, bat.name, runnerTimeline(0, 1, { kind: 'walk' })]], outs: [], runs: 0, pa: true, swing: false, desc: COPY.ibb(bat.name), s1: snap(), d: K.PITCH_DUR.ibb, showAt: K.IBB_SHOW_AT };
          emitPitchFrame(e, { pitcher: pit.name, result: 'intentional_walk' }); pushFrame(e); continue;
        }
      }
      st.ibbAsked = false;
      /* ---- offence: sacrifice bunt? (coach decides, late and close, weaker hitter) ---- */
      let bunt = false;
      if (st.outs === 0 && (st.b[0] || st.b[1]) && !st.b[2] && bat.pow < K.BUNT_POW_MAX && R() < K.BUNT_ASK_P) {
        const margin = st.sc[off] - st.sc[def];
        bunt = st.inn >= K.BUNT_MIN_INNING && margin <= 0 && margin >= -K.BUNT_MAX_DEFICIT;
      }

      let balls = 0, strikes = 0, paDone = false, pofN = 0;
      while (!paDone) {
        const s0 = snap(), c0 = [balls, strikes]; st.pc[def]++;
        const going = st.steal && st.steal === stealBase() ? st.steal : 0; st.steal = false;
        const inZ = bunt || R() < clamp(K.ZONE_BY_COUNT[balls][strikes] * pit.ctrl, K.ZONE_P_MIN, K.ZONE_P_MAX);
        const zx = inZ ? (R() - K.HALF) * 2 * K.ZONE_HALF_WIDTH : (R() < K.HALF ? -1 : 1) * (K.MISS_X_MIN + R() * K.MISS_X_SPAN);
        const zy = inZ ? K.ZONE_Y_MIN + R() * K.ZONE_Y_SPAN : (R() < K.HALF ? K.MISS_LOW_Y - R() * K.MISS_LOW_SPAN : K.MISS_HIGH_Y + R() * K.MISS_HIGH_SPAN);
        const pq = look(), PT = mixOf(pit0).find(p => pq < p[1]);
        const kmh = Math.round(K.KMH_BASE + (pit.stuff - K.KMH_STUFF_REF) * K.KMH_PER_STUFF + PT[2] + (look() - K.HALF) * K.KMH_JITTER);
        const e = { t, k: 'P', bat: [off, bi], pit: [def, pitIdx(def)], pc: st.pc[def], c0, inZ, zx, zy, line, pline, pt: PT[0], kmh, s0, swing: false };

        /* ---- what happens to the pitch ---- */
        if (!going && (st.b[0] || st.b[1] || st.b[2]) && R() < K.BK_P) {
          /* balk (#38): the pitcher stops in his motion, the umpire calls it, no pitch counts, every runner moves up one base */
          e.r = 'bk'; st.pc[def]--; e.pc = st.pc[def];
        } else if (!going && st.b[0] && !st.b[1] && R() < K.PO_P) {
          /* pickoff (#38): the pitcher throws over to first before the pitch and the runner is tagged diving back; no pitch counts */
          e.r = 'po'; st.pc[def]--; e.pc = st.pc[def];
        } else if (!going && st.b[0] && !st.b[1] && pofN < K.POF_MAX_PA && R() < K.POF_P) {
          /* throw-over that does not get him (#38): the runner is back in time, the ball goes back to the pitcher; no pitch counts */
          e.r = 'pof'; pofN++; st.pc[def]--; e.pc = st.pc[def];
        } else if (bunt) { e.swing = true; e.r = 'inplay'; }
        else {
          const sw = inZ ? K.SWING_ZONE_BY_COUNT[balls][strikes] : K.SWING_CHASE_BY_COUNT[balls][strikes] / bat.eye;
          if (R() < Math.min(K.SWING_MAX, sw)) {
            e.swing = true;
            const contact = Math.min(K.CONTACT_MAX, (inZ ? K.CONTACT_IN_ZONE : K.CONTACT_CHASE) * bat.con / pit.stuff);
            if (R() > contact) { strikes++; e.r = 'sstr'; }
            else if (R() < (strikes === K.STRIKES_FOR_OUT - 1 ? K.FOUL_P_2K : K.FOUL_P)) { e.r = 'foul'; if (strikes < K.STRIKES_FOR_OUT - 1) strikes++; e.foulDir = R() < K.HALF ? -1 : 1; }
            else e.r = 'inplay';
          } else if (inZ) { strikes++; e.r = 'cstr'; }
          else if (R() < K.HBP_P) e.r = 'hbp';
          else { balls++; e.r = 'ball'; }
        }

        let desc = '', moves = [], runs = 0, outs = [], play = null, plan = null, result = null, rbi = 0, sbGo = false;
        const name = bat.name, B = st.b;
        if (e.r === 'hbp' || balls === K.BALLS_FOR_WALK) {
          const f = forceAdvance(name); moves = f.moves; runs = f.runs; bs.bb++; ps.bb++; paDone = true;
          result = e.r === 'hbp' ? 'hit_by_pitch' : 'walk';
          desc = e.r === 'hbp' ? COPY.hbp(name) : COPY.walk(name);
          if (runs) { rbi = runs; desc += COPY.forcedIn(runs); }
        } else if (strikes === K.STRIKES_FOR_OUT) {
          outs.push(strikeout({ batter: name, looking: e.r === 'cstr', strikes, at: K.ARRIVE + K.CATCH_SNAP }));
          bs.ab++; bs.k++; ps.k++; paDone = true; result = 'strikeout'; desc = COPY.strikeout(name, e.r === 'cstr');
        } else if (e.r === 'inplay') {
          paDone = true; bs.ab++;
          /* ---- the batted ball ---- */
          let type, res = 'out', spray, d, hang, peak, tryLead = null, fumble = 0;
          if (bunt) {
            const q = R(); type = 'GB';
            spray = K.BUNT_SPRAY_DEG[0] + R() * (K.BUNT_SPRAY_DEG[1] - K.BUNT_SPRAY_DEG[0]); d = span(R, K.BUNT_DIST); hang = d / K.BUNT_ROLL_SPEED; peak = K.GB_PEAK;
            if (q >= K.BUNT_HIT_END) tryLead = B[1] ? 3 : 2;            /* defence goes for the lead runner */
            else if (q >= K.BUNT_SAC_END) fumble = K.BUNT_HIT_FUMBLE;   /* a bunt too good to pick up cleanly */
          } else {
            const tr = R(); type = tr < K.GB_SHARE ? 'GB' : tr < K.LD_SHARE_END ? 'LD' : (R() < K.POPUP_OF_AIR ? 'PU' : 'FB');
            spray = clamp((R() - K.HALF) * K.SPRAY_MAIN_DEG + (R() - K.HALF) * K.SPRAY_NOISE_DEG, -K.SPRAY_MAX_DEG, K.SPRAY_MAX_DEG);
            const hrP = K.HR_P * bat.pow * bat.pow / pit.stuff;
            const dh = defFactor(def, type, K.DEF_HIT_WEIGHT);
            if (type === 'GB') { if (R() < K.GB_HIT_P * bat.con / pit.stuff * dh) res = R() < K.GB_DOUBLE_P ? '2B' : '1B'; }
            else if (type === 'LD') { if (R() < K.LD_HIT_P * bat.con / pit.stuff * dh) { const q = R(); res = q < K.LD_SINGLE_END ? '1B' : q < K.LD_DOUBLE_END ? '2B' : '3B'; } }
            else if (type === 'FB') { if (R() < hrP) res = 'HR'; else if (R() < K.FB_HIT_P * dh) { const q = R(); res = q < K.FB_SINGLE_END ? '1B' : q < K.FB_DOUBLE_END ? '2B' : '3B'; } }
            else if (R() < K.PU_HIT_P * dh) res = '1B';
            if (res === 'out' && R() < K.ERROR_P * defFactor(def, type, K.DEF_ERR_WEIGHT)) res = 'E';
            const fielded = res === 'out' || res === 'E';
            if (type === 'GB') { d = span(R, fielded ? K.GB_OUT_DIST : K.GB_HIT_DIST); hang = d / (res === 'out' ? K.GB_OUT_SPEED : K.GB_HIT_SPEED); peak = K.GB_PEAK; }
            else if (type === 'LD') { d = res === 'out' ? (R() < K.LD_SHALLOW_P ? span(R, K.LD_SHALLOW_DIST) : span(R, K.LD_DEEP_DIST)) : span(R, K.LD_HIT_DIST); hang = d / K.LD_SPEED; peak = span(R, K.LD_PEAK); }
            else if (type === 'PU') { d = span(R, K.PU_DIST); hang = span(R, K.PU_HANG); peak = span(R, K.PU_PEAK); }
            else { d = span(R, res === 'HR' ? K.FB_HR_DIST : res === 'out' ? K.FB_OUT_DIST : K.FB_HIT_DIST); hang = span(R, K.FB_HANG); peak = span(R, K.FB_PEAK); }
            if (res === '3B') d = Math.max(d, K.TRIPLE_MIN_DIST);
          }
          const land = spotXZ(spray, d);
          /* nearest fielder takes it */
          let fielder = 'P', nearest = Infinity;
          for (const k of bunt ? K.BUNT_FIELDERS : FIELDER_KEYS) { if (k === 'C') continue; const dd = dist(fielderStart(k, B, st.outs), land); if (dd < nearest) { nearest = dd; fielder = k; } }
          /* a ball that is caught or fielded has to be reachable at a human pace: pull the landing point toward him.
           * A ball caught in the air gets no slack at all (the fielder is under it when it comes down). */
          let lx = land[0], lz = land[1];
          if (res === 'out' || res === 'E') {
            const [fx, fz] = fielderStart(fielder, B, st.outs), v = Math.min(K.FIELD_VAVG, rangeOf(def)(fielder));
            const reach = type === 'GB' ? Math.max(0, v * (hang - K.FIELD_REACT)) + K.GB_REACH_BONUS : Math.max(0, v * (hang - K.FIELD_REACT)) * K.AIR_REACH_SAFETY;
            if (nearest > reach) { const k = reach / nearest; lx = fx + (lx - fx) * k; lz = fz + (lz - fz) * k; }
          }
          play = { type, res, lx, lz, hang, peak, fielder, spray, dist: d, bunt };
          const ctx = ctxOf(play); ctx.fumble = fumble;
          const forcedOnGround = B[0] ? (B[1] ? (B[2] ? 3 : 2) : 1) : 0;   /* how many runners the batter pushes ahead of him */

          if (res === 'HR') {
            for (let i = 2; i >= 0; i--) if (B[i]) { moves.push([i + 1, HOME, B[i]]); runs++; }
            moves.push([0, HOME, name]); runs++; st.b = [null, null, null]; bs.h++; bs.hr++; st.H[off]++; ps.h++; ps.hr++;
            plan = resolveHit(ctx).plan; result = 'home_run'; desc = COPY.homer(name, runs); e.big = K.BIG.HUGE;
          } else if (res !== 'out') {
            const adv = res === '3B' ? 3 : res === '2B' ? 2 : 1, nb = [null, null, null];
            for (let i = 2; i >= 0; i--) {
              if (!B[i]) continue; let to = i + 1 + adv;
              if (res === '1B' && i === 1 && R() < K.SCORE_FROM_2ND_ON_SINGLE) to = HOME;
              if (res === '1B' && i === 0 && !nb[2] && R() < K.FIRST_TO_THIRD_ON_SINGLE) to = 3;
              if (res === '2B' && i === 0 && R() < K.SCORE_FROM_1ST_ON_DOUBLE) to = HOME;
              to = Math.min(HOME, to); while (to < HOME && nb[to - 1]) to++;
              moves.push([i + 1, to, B[i]]); if (to === HOME) runs++; else nb[to - 1] = B[i];
            }
            moves.push([0, adv, name]); nb[adv - 1] = name; st.b = nb; plan = resolveHit(ctx).plan;
            if (res === 'E') { st.E[def]++; result = 'error'; desc = COPY.error(name, type === 'GB'); }
            else { bs.h++; st.H[off]++; ps.h++; if (res === '2B') bs.d++; if (res === '3B') bs.t++; result = { '1B': 'single', '2B': 'double', '3B': 'triple' }[res]; desc = COPY.hit(name, res); }
            if (runs) desc += COPY.drivesIn(runs); e.big = runs ? K.BIG.NOTABLE : K.BIG.NONE;
          } else if (type === 'GB') {
            const tryDoublePlay = !bunt && !!B[0] && st.outs < K.OUTS_PER_HALF - 1 && R() < K.DP_TRY_P;
            const g = resolveGround(ctx, { tryDoublePlay, leadBase: tryLead });
            plan = g.plan; outs = g.outs;
            if (g.kind === 'dp') {
              play.dp = true; moves = [[1, 2, B[0]], [0, 1, name]]; const nb = [null, B[1], B[2]];
              if (st.outs === 0 && B[2]) { moves.push([3, HOME, B[2]]); runs++; nb[2] = null; }
              if (st.outs === 0 && B[1]) { moves.push([2, 3, B[1]]); nb[2] = B[1]; nb[1] = null; }
              st.b = nb; result = 'double_play'; desc = COPY.doublePlay(name, fielder);
            } else if (g.kind === 'fc') {
              /* lead runner put out, batter safe at first; forced runners move up, the rest hold */
              const ob = g.outBase, nb = B.slice(); moves = [[0, 1, name]];
              for (let i = 2; i >= 0; i--) {
                if (!B[i]) continue;
                if (i + 2 === ob) { moves.push([i + 1, ob, B[i]]); nb[i] = null; continue; }
                if (isForced(i + 1, B, true) || (i === 2 && !bunt && st.outs === 0)) { moves.push([i + 1, i + 2, B[i]]); nb[i] = null; if (i === 2) runs++; else nb[i + 1] = B[i]; }
              }
              nb[0] = name; st.b = nb; result = 'fielders_choice';
              desc = bunt ? COPY.buntLeadOut(name, outs[0].runner, ob, outs[0].reason === 'force') : COPY.fieldersChoice(name, fielder, outs[0].runner, ob);
            } else if (g.kind === 'out') {
              const nb = B.slice(); moves = [[0, 1, name]];
              if (bunt || (forcedOnGround && st.outs < K.OUTS_PER_HALF - 1)) {
                /* everyone the batter pushes has to run, and is on the next base by the time the batter is out at first */
                const push = bunt ? [1, 0].filter(i => B[i]) : [...Array(forcedOnGround).keys()].reverse();
                for (const i of push) { if (i === 2) { moves.push([3, HOME, B[2]]); runs++; nb[2] = null; } else { moves.push([i + 1, i + 2, B[i]]); nb[i + 1] = B[i]; nb[i] = null; } }
                result = bunt ? 'sac_bunt' : 'groundout'; desc = bunt ? COPY.sacBunt(name) : COPY.groundAdvance(name, fielder);
                if (bunt) bs.ab--;   /* a sacrifice is not an at-bat */
              } else if (st.outs < K.OUTS_PER_HALF - 1 && (B[1] || B[2]) && R() < K.GB_ADVANCE_P) {
                if (B[2]) { moves.push([3, HOME, B[2]]); runs++; nb[2] = null; }
                if (B[1] && !nb[2]) { moves.push([2, 3, B[1]]); nb[2] = B[1]; nb[1] = null; }
                result = 'groundout'; desc = COPY.groundAdvance(name, fielder);
              } else { result = 'groundout'; desc = COPY.groundOut(name, fielder); }
              st.b = nb;
            } else {
              /* the defence could not make any play in time: an infield hit. Forced runners move up one base. */
              const nb = B.slice(); moves = [[0, 1, name]];
              for (let i = 2; i >= 0; i--) if (B[i] && isForced(i + 1, B, true)) { moves.push([i + 1, i + 2, B[i]]); nb[i] = null; if (i === 2) runs++; else nb[i + 1] = B[i]; }
              nb[0] = name; st.b = nb; play.res = '1B'; play.infield = true; bs.h++; st.H[off]++; ps.h++;
              result = bunt ? 'bunt_single' : 'infield_single'; desc = bunt ? COPY.buntHit(name) : COPY.infieldHit(name);
              if (runs) desc += COPY.drivesIn(runs); e.big = runs ? K.BIG.NOTABLE : K.BIG.NONE;
            }
          } else {
            /* caught in the air */
            const nb = B.slice(); moves = [[0, 1, name]]; let tagUp = null, sacFly = false, toThird = null;
            const canTag = st.outs < K.OUTS_PER_HALF - 1 && type === 'FB';
            if (canTag && B[2] && R() < K.SAC_FLY_P) { tagUp = { from: 3, to: HOME }; sacFly = true; moves.push([3, HOME, B[2]]); runs++; nb[2] = null; }
            /* the runner on second tags and takes third if it is open; the throw goes to the lead runner */
            if (canTag && B[1] && !nb[2] && R() < K.TAG_2ND_TO_3RD_P) { tagUp = tagUp || { from: 2, to: 3 }; toThird = B[1]; moves.push([2, 3, B[1]]); nb[2] = B[1]; nb[1] = null; }
            const fly = resolveFly(ctx, tagUp); plan = fly.plan; outs = fly.outs; st.b = nb;
            if (sacFly) { result = 'sac_fly'; desc = COPY.sacFly(name, B[2]); bs.ab--; }   /* a sacrifice fly is not an at-bat */
            else { result = type === 'LD' ? 'lineout' : type === 'PU' ? 'popout' : 'flyout'; desc = type === 'LD' ? COPY.lineOut(name, fielder) : type === 'PU' ? COPY.popOut(name) : COPY.flyOut(name, fielder); }
            if (toThird) desc += COPY.tagToThird(toThird);
          }
          if (runs && outs.length) desc += COPY.runsNote(runs);
          rbi = res === 'E' || play.dp ? 0 : runs;
        } else if (e.r === 'po') {
          const runner = B[0], p = resolvePickoff(ctxOf(null));
          plan = p.plan; outs = p.outs; st.b = [null, null, B[2]]; e.po = true; e.big = K.BIG.NOTABLE;
          desc = COPY.pickoff(runner);
        } else if (e.r === 'pof') {
          /* e.po marks every pickoff-throw frame, e.pof the ones where the runner is safe */
          plan = resolvePickoff(ctxOf(null), true).plan; e.po = true; e.pof = true; e.big = K.BIG.NONE;
          desc = COPY.pickoffSafe(B[0]);
        } else if (e.r === 'bk') {
          const nb = [null, B[0], B[1]];
          if (B[2]) { moves.push([3, HOME, B[2]]); runs++; }
          if (B[1]) moves.push([2, 3, B[1]]);
          if (B[0]) moves.push([1, 2, B[0]]);
          st.b = nb; e.bk = true; e.big = runs ? K.BIG.NOTABLE : K.BIG.NONE;
          desc = COPY.balk(runs);
        } else {
          desc = COPY.call(e.r);
          if (going && e.r !== 'foul') {
            const runner = st.b[going - 2], s = resolveSteal(ctxOf(null), !(R() < stealOkP(off, runner, going)), going);
            plan = s.plan; outs = s.outs; moves = [[going - 1, going, runner, s.tl]]; sbGo = true; e.sbGo = true; e.big = s.ok ? K.BIG.NOTABLE : K.BIG.NONE;
            st.b = going === 3 ? [null, null, s.ok ? runner : null] : s.ok ? [null, runner, st.b[2]] : [null, null, st.b[2]];
            desc += s.ok ? COPY.stealOk(runner, going) : COPY.stealOut(runner, going);
          } else if (!going && (e.r === 'ball' || e.r === 'sstr' || e.r === 'cstr') && (B[0] || B[1] || B[2]) && R() < (!inZ && zy <= K.MISS_LOW_Y ? K.WP_P : K.PB_P)) {
            /* ---- the pitch gets past the catcher (#38); every runner moves up one base. A low pitch out of the zone
             * (ball in the dirt) is a wild pitch; any other pitch he should have caught is a passed ball.
             * e.wp marks both (the ball got by), e.pb the passed ball. ---- */
            const pb = inZ || zy > K.MISS_LOW_Y;
            const nb = [null, B[0], B[1]];
            if (B[2]) { moves.push([3, HOME, B[2]]); runs++; }
            if (B[1]) moves.push([2, 3, B[1]]);
            if (B[0]) moves.push([1, 2, B[0]]);
            st.b = nb; e.wp = true; if (pb) e.pb = true; e.big = runs ? K.BIG.NOTABLE : K.BIG.NONE;
            desc += pb ? COPY.passedBall(runs) : COPY.wildPitch(runs);
          }
        }

        /* ---- book the outs and runs ---- */
        const before = st.outs;
        st.outs = Math.min(K.OUTS_PER_HALF, st.outs + outs.length);
        outs = outs.slice(0, st.outs - before);
        ps.outs += outs.length;
        if (paDone) endPA();
        if (st.outs >= K.OUTS_PER_HALF && outs.length && runs) {
          /* the half ended on this play with a force or the batter out before first: no run scores */
          runs = 0; rbi = 0;
        }
        bs.rbi += rbi;
        if (runs) {
          addRun(runs); st.ra[def] += runs; ps.r += runs;
          const now = st.sc[0] > st.sc[1] ? 0 : st.sc[1] > st.sc[0] ? 1 : -1;
          if (now !== lead) { lead = now; if (now >= 0) { wp = [now, st.pi[now]]; lp = [1 - now, st.pi[1 - now]]; } }
        }
        if (paDone) { balls = 0; strikes = 0; }
        Object.assign(e, { c1: [balls, strikes], moves, play, plan, outs, runs, desc, pa: paDone });
        if (st.half === 1 && st.inn >= K.REGULATION_INNINGS && st.sc[1] > st.sc[0]) { over = true; e.walkoff = true; e.desc += COPY.walkoff(e.desc); e.big = K.BIG.HUGE; }
        e.s1 = snap();

        /* ---- when each runner starts and arrives ---- */
        const inplay = e.r === 'inplay', flyOut = inplay && play.res === 'out' && play.type !== 'GB';
        for (const m of moves) {
          if (m[3]) continue;
          const [from, to, who] = m, stays = to < HOME && e.s1.b[to - 1] === who, outHere = outs.some(o => o.runner === who && o.base === to);
          const slide = to >= 2 && inplay && play.res !== 'HR' && ((flyOut && from > 0) || (to === HOME ? look() < K.HOME_SLIDE_P : stays || outHere));
          m[3] = runnerTimeline(from, to, { kind: inplay ? 'inplay' : e.wp ? 'wp' : e.bk ? 'bk' : 'walk', tagUpAt: flyOut && from > 0 ? K.ARRIVE + plan.catchT : null, slide });
        }

        /* ---- broadcast timing: the result is shown when it has really happened ---- */
        const lastOut = outs.length ? Math.max(...outs.map(o => o.at)) : 0;
        let d = K.PITCH_DUR[e.r] || K.PITCH_DUR_DEFAULT, showAt = K.ARRIVE + K.CALL_LAG;
        if (inplay) {
          const walkBack = dist(plan.target, plan.start) / K.WALK_BACK_SPEED;
          d = K.INPLAY_BASE_DUR + play.hang + (moves.length ? K.INPLAY_MOVES_DUR : 0) + (runs ? K.INPLAY_RUNS_DUR : 0);
          d = Math.max(d, K.ARRIVE + plan.catchT + K.POST_CATCH_HOLD + walkBack + K.WALK_BACK_PAD, K.ARRIVE + plan.arrive + K.POST_PLAY_HOLD, ...moves.map(m => m[3].arriveT + K.POST_PLAY_HOLD));
          showAt = outs.length ? lastOut + K.OUT_CALL_LAG : play.infield ? moves[0][3].arriveT + K.OUT_CALL_LAG : K.ARRIVE - K.HIT_SHOW_LEAD + play.hang;
        } else if (sbGo) {
          showAt = moves[0][3].arriveT + K.OUT_CALL_LAG;
          d = Math.max(d, plan.arrive + K.POST_PLAY_HOLD, showAt + K.POST_PLAY_HOLD);
        } else if (e.pof) {
          showAt = plan.arrive + K.OUT_CALL_LAG;
          d = Math.max(K.PITCH_DUR.pof, plan.back.arrive + K.POST_PLAY_HOLD);
        } else if (e.po) {
          showAt = lastOut + K.OUT_CALL_LAG;
          d = Math.max(K.PITCH_DUR.po, showAt + K.POST_PLAY_HOLD);
        } else if (e.bk) {
          showAt = K.BK_CALL_AT;
          d = Math.max(K.PITCH_DUR.bk, ...moves.map(m => m[3].arriveT + K.POST_PLAY_HOLD));
        } else if (e.wp) {
          showAt = Math.max(...moves.map(m => m[3].arriveT)) + K.OUT_CALL_LAG;
          d = Math.max(d, showAt + K.POST_PLAY_HOLD);
        } else {
          if (e.r === 'hbp' || (paDone && e.r === 'ball')) d = K.WALK_FRAME_DUR;
          if (outs.length) showAt = lastOut + K.OUT_CALL_LAG;
        }
        if (paDone) d += K.PA_END_HOLD;
        e.d = d; e.showAt = showAt;
        emitPitchFrame(e, { pitcher: pit.name, result, rbi });
        pushFrame(e);
        if (st.outs >= K.OUTS_PER_HALF && !paDone) break;
      }
    }
    if (over) break;
    /* ---- end of the half inning ---- */
    const s0 = snap();
    emit('half_end', t, { inning: st.inn, half: st.half, team: st.half, runs: st.ls[st.half][st.inn - 1] || 0, outs: st.outs, score: st.sc.slice() });
    if (st.half === 0 && st.inn >= K.REGULATION_INNINGS && st.sc[1] > st.sc[0]) { over = true; break; }   /* home team leads: no bottom half */
    if (st.half === 1 && st.inn >= K.REGULATION_INNINGS && st.sc[0] !== st.sc[1]) { over = true; break; }
    if (st.half === 1 && st.inn >= K.MAX_INNINGS) { over = true; break; }
    if (st.half === 0) st.half = 1; else { st.half = 0; st.inn++; }
    st.outs = 0; st.b = [null, null, null]; st.sbAsked = false; st.ibbAsked = false; st.steal = false; st.phAsked = false;
    pushFrame({ t, d: K.BREAK_DUR, k: 'BRK', desc: COPY.halfEnd(s0.inn, s0.half, TT, s0.sc), s0, s1: snap() });
  }

  const fin = snap(), winner = fin.sc[0] > fin.sc[1] ? 0 : fin.sc[1] > fin.sc[0] ? 1 : -1;
  emit('game_end', t, { score: fin.sc.slice(), innings: fin.inn, winner, walkoff: st.outs < K.OUTS_PER_HALF });
  fin.outs = K.OUTS_PER_HALF;
  ev.push({ t, d: 1e9, k: 'END', desc: winner < 0 ? COPY.tie(fin.sc) : COPY.final(TT[winner], fin.sc), s0: fin, s1: fin });
  return { ev, stream, dur: t, stats, batters, pst, final: fin, wp, lp, staff: RR.map(r => r.pit), teams: TI, seed, engine: K.ENGINE_VERSION };
}
