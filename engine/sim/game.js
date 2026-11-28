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
import { FIELDER_KEYS, OUTFIELD_KEYS, HOME, BASES, spotXZ, dist, clamp, runnerTimeline, fielderStart, runPace } from '../rules/field.js';
import { strikeout, isForced } from '../rules/outs.js';
import { resolveGround, resolveFly, resolveHit, resolveSteal, resolvePickoff, resolveRundown, resolveDroppedThird, resolveTriple, resolveDoubledOff } from '../rules/fielding.js';
import { TEAMS } from '../../league/teams.js';
import { ROSTERS } from '../../league/players.js';
import { COPY } from './copy.js';
import { temperOf } from '../../league/temper.js';
import { levelOf, situationOf, LEVEL_NEUTRAL } from '../../league/agentset.js';

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
  const pinchRun = opts.pinchRun ?? K.PINCH_RUN_ON;   /* #436 part 3: off = factory games byte for byte */
  const defSub = opts.defSub ?? K.DEF_SUB_ON;         /* #436 part 7: off = factory games byte for byte */
  const grudgeOn = opts.grudge ?? K.GRUDGE_ON;        /* #379 part 3: off = factory games byte for byte */
  const grudges = [];                                  /* one row per hit batter: { inning, half, from, to, temper, score } */
  const retaliateOn = grudgeOn && (opts.retaliate ?? K.RETALIATE_ON);   /* #379 part 4: needs the record; off = part 3 games byte for byte */
  const owed = [0, 0];                                 /* grudge points a team holds for its hit batters, cleared at its pitcher's next chance */
  let warned = false;                                  /* after a retaliation the umpire has warned both benches: no more in this game */
  const feud = mulberry32((seed ^ K.FEUD_SALT) >>> 0);  /* #379 part 4: retaliation draws apart, so R keeps its sequence until one happens */
  const benchOn = retaliateOn && (opts.benchClear ?? K.BENCH_CLEAR_ON);   /* #379 part 5: needs retaliation; off = part 4 games byte for byte */
  const ejectOn = benchOn && (opts.eject ?? K.EJECT_ON);   /* #379 part 6: needs bench-clearing; off = part 5 games byte for byte */
  const ejected = [false, false];                      /* the team's pitcher was ejected: the next reliever comes in before the next pitch */
  const ejectBatOn = benchOn && (opts.ejectBatter ?? K.EJECT_BATTER_ON);   /* #379 part 7: needs bench-clearing; off = part 6 games byte for byte */
  const ejectedBat = [null, null];                     /* name of the team's ejected batter-runner: a bench man runs for him before the next pitch */
  /* #795 part 2: 經紀人 agent sets, { <player name>: set } (league/agentset.js, frozen at game lock). A missing set or a neutral
   * cell multiplies nothing and draws nothing extra, so games without opts.agents are factory games byte for byte. */
  const agents = opts.agents || null;
  const agentLevel = (name, team, freq) => {
    const set = agents && name && agents[name];
    if (!set) return LEVEL_NEUTRAL;
    return levelOf(set, situationOf(set.kind, { inning: st.inn, outs: st.outs, bases: st.b, margin: st.sc[team] - st.sc[1 - team] }), freq);
  };
  const agentMult = (name, team, freq, table) => { const lv = agentLevel(name, team, freq); return lv === LEVEL_NEUTRAL ? 1 : table[lv]; };
  /* part 2b: the pitch mix with the fastball share scaled by m (the other pitches keep their ratios); a mix without 直球 first is kept */
  const fbMix = (mix, m) => {
    if (m === 1 || mix[0][0] !== K.PITCH_TYPES[0][0] || mix.length < 2) return mix;
    const f0 = mix[0][1], f1 = Math.min(K.AGENT_FASTBALL_SHARE_MAX, f0 * m), k = (1 - f1) / (1 - f0);
    return mix.map((p, i) => [p[0], i === 0 ? f1 : i === mix.length - 1 ? 1 : f1 + (p[1] - f0) * k, p[2]]);
  };
  const R = mulberry32(seed);                          /* decides outcomes */
  const look = mulberry32((seed ^ K.COSMETIC_SALT) >>> 0);   /* decides looks only; never read by outcome code */
  const rare = mulberry32((seed ^ K.RARE_PLAY_SALT) >>> 0);
  const obsR = mulberry32((seed ^ K.OBSTRUCTION_SALT) >>> 0);   /* #614 part 15: obstruction draws, apart so R, rare and look keep their sequences */
  const visitR = mulberry32((seed ^ K.VISIT_SALT) >>> 0);   /* #614 part 11: catcher visits (timing only), drawn apart so R and look keep their sequences */  /* #614 part 9: outcomes of rare plays (catcher's interference), drawn apart so the main sequence R is not shifted */
  const ev = [], stream = [];
  let t = K.PRE_DUR, decisionNo = 0, over = false, lead = -1, wp = null, lp = null;
  const st = { inn: 1, half: 0, outs: 0, b: [null, null, null], sc: [0, 0], ls: [[], []], H: [0, 0], E: [0, 0],
    lu: [0, 0], pi: [0, 0], pc: [0, 0], ra: [0, 0], hold: [0, 0], vis: [-1, -1], mv: [0, 0], mvCap: [K.MOUND_VISIT_LIMIT, K.MOUND_VISIT_LIMIT], steal: false, sbAsked: false, ibbAsked: false, phAsked: false, prAsked: false, dsAsked: false };
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
    else if (e.po) add('pickoff', e.t + K.PO_THROW_AT, { ...who, pitcher: x.pitcher, runner: e.s0.b[0], base: 1, count: e.c0, safe: e.pof ? true : undefined, rundown: e.rd ? true : undefined, runnerAt: e.pof ? round3(e.t + e.plan.runnerAt) : undefined });
    else if (e.r === 'bk') add('balk', e.t + e.showAt, { ...who, pitcher: x.pitcher, count: e.c0 });
    else {
      add('pitch', e.t + K.RELEASE, { ...who, pitcher: x.pitcher, pitchType: e.pt, kmh: e.kmh, inZone: e.inZ, count: e.c0, n: e.pc });
      if (e.swing) add('swing', e.t + K.ARRIVE, { ...who });
      if (e.r === 'inplay') add('contact', e.t + K.ARRIVE, { ...who, ball: e.play.type, bunt: !!e.play.bunt, spray: round3(e.play.spray), dist: round3(e.play.dist), hang: round3(e.play.hang), land: [round3(e.play.lx), round3(e.play.lz)], fielder: e.play.fielder, foul: e.play.foul ? true : undefined, infieldFly: e.play.infieldFly ? true : undefined, dropped: e.play.iffDrop ? true : undefined });
      else {
        /* #614 part 6: the catcher points to the base umpire, whose ruling is the call */
        if (e.chk) add('appeal', e.t + K.ARRIVE + K.CHECK_APPEAL_AT, { ...who, umpire: e.chk.ump === 3 ? 'third_base' : 'first_base', ruling: e.chk.swing ? 'swing' : 'no_swing', count: e.c1 });
        add('call', e.t + K.ARRIVE + (e.chk ? K.CHECK_APPEAL_AT : K.CALL_LAG), { ...who, call: { ball: 'ball', cstr: 'called_strike', sstr: 'swinging_strike', foul: 'foul', hbp: 'hit_by_pitch', ci: 'catcher_interference' }[e.r], tip: e.tip ? true : undefined, dropped: e.k3 ? true : undefined, bunt: e.bunt ? true : undefined, checkSwing: e.chk ? true : undefined, count: e.c1 });
      }
    }
    if (e.plan) for (const a of e.plan.actions) add('fielder_action', e.t + (e.plan.steal || e.plan.po || e.plan.k3 ? a.t : K.ARRIVE + a.t), { action: a.a, fielder: a.f, base: a.base ?? null, to: a.to ?? null, team: 1 - off });
    let n = e.s0.outs;
    for (const o of e.outs) add('out', e.t + o.at, { ...o, at: undefined, ballAt: o.ballAt == null ? undefined : round3(e.t + o.ballAt), touchAt: o.touchAt == null ? undefined : round3(e.t + o.touchAt),
      fielderAt: o.fielderAt == null ? undefined : round3(e.t + o.fielderAt), runnerAt: o.runnerAt == null ? undefined : round3(e.t + o.runnerAt), team: off, outs: ++n, steal: e.sbGo ? true : undefined, pickoff: e.po ? true : undefined });
    const gone = new Set(e.outs.map(o => o.runner)), inningOver = e.s1.outs >= K.OUTS_PER_HALF;
    let sc = e.s0.sc[off];
    if (!(inningOver && e.outs.length)) for (const m of e.moves) {
      if (gone.has(m[2])) continue;
      add('runner_advance', e.t + m[3].arriveT, { runner: m[2], from: m[0], to: m[1], team: off, how: e.r === 'inplay' && m[0] === 0 && e.play && e.play.obstruction ? 'obstruction' : e.sbGo ? 'steal' : e.k3 ? 'dropped_third_strike' : e.bk ? 'balk' : e.pb ? 'passed_ball' : e.wp ? 'wild_pitch' : e.r === 'ci' ? 'catcher_interference' : e.r === 'inplay' ? (e.play && (e.play.errAdvance || e.play.wildThrow) ? 'error' : 'batted') : 'walk' });
      if (m[1] === HOME) add('run_scored', e.t + m[3].arriveT, { runner: m[2], team: off, runs: ++sc });
    }
    if (e.pa) add('pa_end', e.t + Math.max(e.showAt, ...out.map(o => o.time - e.t)), { ...who, pitcher: x.pitcher, result: x.result, rbi: x.rbi || 0, groundRule: e.play && e.play.groundRule ? true : undefined, obstruction: e.play && e.play.obstruction ? true : undefined, retaliation: e.retal ? true : undefined });
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
    st.dsAsked = false;
    /* #614 part 11: a team that starts an extra inning with no mound visit left gets one more (OBR 5.10(m)) */
    if (st.inn > K.REGULATION_INNINGS && st.mv[def] >= st.mvCap[def]) st.mvCap[def] += K.MOUND_VISIT_EXTRA;
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
      /* #379 part 6: an ejected pitcher leaves before the next pitch; no vote, no tired() draw. No reliever left: he stays in. */
      if (ejected[def]) {
        ejected[def] = false;
        if (st.pi[def] < RR[def].pit.length - 1) {
          const cur = RR[def].pit[st.pi[def]], nx = RR[def].pit[st.pi[def] + 1];
          const s0 = snap(); st.pi[def]++; st.pc[def] = 0; st.ra[def] = 0; st.hold[def] = 0;
          emit('substitution', t, { team: def, role: 'pitcher', out: cur.name, in: nx.name, ejected: true });
          pushFrame({ t, d: K.CHANGE_DUR, k: 'CHG', desc: COPY.ejectChange(TT[def], cur, nx), s0, s1: snap(), def, ejected: true });
          continue;
        }
      }
      /* #379 part 7: an ejected batter-runner leaves before the next pitch; the fastest bench man takes his base, lineup slot
       * and position (no vote). Empty bench or he is off the bases already: he stays. */
      if (ejectedBat[off]) {
        const name = ejectedBat[off]; ejectedBat[off] = null;
        const base = st.b.indexOf(name), slot = RR[off].bat.findIndex(b => b.name === name);
        if (base >= 0 && slot >= 0 && RR[off].bench.length) {
          const cur = RR[off].bat[slot], spd = b => b.spd || 1;
          const pr = RR[off].bench.reduce((a, b) => spd(b) > spd(a) ? b : a);
          const s0 = snap(), inPlayer = { ...pr, pos: cur.pos };
          RR[off].bench = RR[off].bench.filter(b => b !== pr); RR[off].bat[slot] = inPlayer;
          const nb = st.b.slice(); nb[base] = pr.name; st.b = nb;
          row[off][slot] = stats[off].length; stats[off].push(newLine()); batters[off].push(pr.name);
          emit('substitution', t, { team: off, role: 'pinch_runner', out: cur.name, in: pr.name, lineup: slot, pos: cur.pos, base: base + 1, ejected: true });
          pushFrame({ t, d: K.PR_DUR, k: 'SUB', desc: COPY.ejectRunner(TT[off], pr, cur), s0, s1: snap(), team: off, lineup: slot, base: base + 1, ejected: true });
          continue;
        }
      }
      const spBudget = K.SP_LIMIT_PITCHES - st.ra[def] * K.SP_LIMIT_PER_RUN - (st.inn >= K.SP_LATE_INNING ? K.SP_LATE_CUT : 0);
      const tired = () => st.pi[def] === 0 ? (st.pc[def] > spBudget - span(R, K.SP_ASK_BEFORE) || st.ra[def] >= span(R, K.SP_PULL_RUNS)) : (st.pc[def] > span(R, K.RP_PULL_PITCHES) || st.ra[def] >= K.RP_PULL_RUNS);
      if (st.pi[def] < RR[def].pit.length - 1 && st.hold[def] <= 0 && tired()) {
        const cur = RR[def].pit[st.pi[def]], nx = RR[def].pit[st.pi[def] + 1];
        const coach = st.pi[def] > 0 || st.pc[def] >= spBudget || st.ra[def] >= K.SP_MAX_RUNS ? 'change' : 'stay';
        const pick = vote(def, 'P', COPY.askChange(cur, st.pc[def]), [['change', COPY.optChange(nx)], ['stay', COPY.optStay(cur)]], coach);
        if (pick === 'stay') {
          st.hold[def] = K.STAY_HOLD_BATTERS;
          /* #81: the pitching coach goes out to talk to him, once per pitcher (a second visit to the same pitcher would take him out).
           * Timing only: no draw, so every outcome stays as it was; only later times move. */
          if (st.vis[def] !== st.pi[def] && st.mv[def] < st.mvCap[def]) {
            st.vis[def] = st.pi[def]; st.mv[def]++;
            emit('mound_visit', t, { team: def, pitcher: cur.name, staff: 'pitching' });
            pushFrame({ t, d: K.MOUND_VISIT_DUR, k: 'VIS', desc: COPY.visit(TT[def], cur), s0: snap(), s1: snap(), def });
          }
          continue;
        }
        const s0 = snap(); st.pi[def]++; st.pc[def] = 0; st.ra[def] = 0;
        emit('substitution', t, { team: def, role: 'pitcher', out: cur.name, in: nx.name });
        pushFrame({ t, d: K.CHANGE_DUR, k: 'CHG', desc: COPY.change(TT[def], nx), s0, s1: snap(), def });
        continue;
      }
      /* ---- defence: defensive replacement (#436 part 7)? Late, before the first pitch of a half the leading team fields:
       * the bench man with the best glove gain over the fielder at his own position (a man playing out of his own
       * position, a pinch hitter or runner, counts DS_OFF_POS of his glove). The new man takes the slot and the position
       * and stays in; the replaced player is out of the game. Asked once per half. ---- */
      if (defSub && !st.dsAsked) st.dsAsked = st.inn < K.DS_MIN_INNING || st.sc[def] <= st.sc[off] || !RR[def].bench.length ? true : 'ask';
      if (st.dsAsked === 'ask') {
        st.dsAsked = true;
        const own = allRosters[TI[def]], natPos = b => ([...own.bat, ...(own.bench || [])].find(p => p.name === b.name) || b).pos;
        const glove = b => (b.def || 1) * (b.arm || 1), held = b => glove(b) * (natPos(b) === b.pos ? 1 : K.DS_OFF_POS);
        let best = null;
        for (const ds of RR[def].bench) {
          const slot = RR[def].bat.findIndex(b => b.pos === ds.pos);
          if (slot < 0) continue;
          const gain = glove(ds) - held(RR[def].bat[slot]);
          if (gain >= K.DS_EDGE && (!best || gain > best.gain)) best = { ds, slot, gain };
        }
        if (best) {
          const { ds, slot } = best, cur = RR[def].bat[slot];
          const coach = st.sc[def] - st.sc[off] <= K.DS_CLOSE_RUNS ? 'ds' : 'stay';
          const pick = vote(def, 'D', COPY.askDef(cur, ds, cur.pos), [['ds', COPY.optDef(ds)], ['stay', COPY.optLetField(cur)]], coach);
          if (pick === 'ds') {
            const s0 = snap(), inPlayer = { ...ds, pos: cur.pos };
            RR[def].bench = RR[def].bench.filter(b => b !== ds); RR[def].bat[slot] = inPlayer;
            row[def][slot] = stats[def].length; stats[def].push(newLine()); batters[def].push(ds.name);
            emit('substitution', t, { team: def, role: 'defensive', out: cur.name, in: ds.name, lineup: slot, pos: cur.pos });
            pushFrame({ t, d: K.DS_DUR, k: 'SUB', desc: COPY.defSub(TT[def], ds, cur, cur.pos), s0, s1: snap(), team: def, lineup: slot, role: 'defensive' });
          }
          continue;
        }
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
      /* ---- offence: pinch run (#436 part 3)? Late, for the lead runner, when the fastest man on the bench is clearly
       * quicker. The coach's own pick is the runner only in a close game. The new man takes the base, the lineup slot and
       * the position of the one he replaces and stays in; the replaced player is out of the game. Asked once per batter. ---- */
      if (pinchRun && !st.prAsked && st.inn >= K.PR_MIN_INNING && RR[off].bench.length) {
        const base = st.b[2] ? 2 : st.b[1] ? 1 : st.b[0] ? 0 : -1;
        const slot = base < 0 ? -1 : RR[off].bat.findIndex(b => b.name === st.b[base]);
        if (slot >= 0) {
          st.prAsked = true;
          const cur = RR[off].bat[slot], spd = b => b.spd || 1;
          const pr = RR[off].bench.reduce((a, b) => spd(b) > spd(a) ? b : a);
          if (spd(pr) - spd(cur) >= K.PR_EDGE) {
            const coach = Math.abs(st.sc[off] - st.sc[def]) <= K.PR_CLOSE_RUNS ? 'pr' : 'stay';
            const pick = vote(off, 'R', COPY.askRun(cur, pr, base + 1), [['pr', COPY.optRun(pr)], ['stay', COPY.optLetRun(cur)]], coach);
            if (pick === 'pr') {
              const s0 = snap(), inPlayer = { ...pr, pos: cur.pos };
              RR[off].bench = RR[off].bench.filter(b => b !== pr); RR[off].bat[slot] = inPlayer;
              const nb = st.b.slice(); nb[base] = pr.name; st.b = nb;
              row[off][slot] = stats[off].length; stats[off].push(newLine()); batters[off].push(pr.name);
              emit('substitution', t, { team: off, role: 'pinch_runner', out: cur.name, in: pr.name, lineup: slot, pos: cur.pos, base: base + 1 });
              pushFrame({ t, d: K.PR_DUR, k: 'SUB', desc: COPY.pinchRun(TT[off], pr, cur), s0, s1: snap(), team: off, lineup: slot, base: base + 1 });
            }
            continue;
          }
        }
      }
      const pit0 = RR[def].pit[st.pi[def]], bi = st.lu[off], bat = RR[off].bat[bi], bs = stats[off][row[off][bi]], ps = pst[def][st.pi[def]];
      const tire = Math.max(0, st.pc[def] - K.TIRE_AFTER_PITCHES);
      const pit = { name: pit0.name, stuff: pit0.stuff * (1 - tire * K.TIRE_STUFF_PER_PITCH), ctrl: pit0.ctrl * (1 - tire * K.TIRE_CTRL_PER_PITCH) };
      const line = COPY.batLine(bs), pline = COPY.pitLine(ps);
      const ctxOf = play => ({ play, bases: st.b.slice(), outs: st.outs, batter: bat.name, arm: armOf(def), vavg: rangeOf(def), pace: runPace(bat.spd) });
      const endPA = () => { st.lu[off] = (bi + 1) % K.LINEUP_SIZE; st.hold[def]--; ps.bf++; st.phAsked = false; st.prAsked = false; };

      /* ---- offence: steal second (or third, #38)? The runner breaks on the next real pitch. st.steal = the base. ---- */
      const sbB = stealBase();
      if (sbB && !st.sbAsked && R() < (sbB === 3 ? K.STEAL3_CONSIDER_P : K.STEAL_CONSIDER_P)) {
        const hold = sbB === 2 ? agentMult(RR[def].pit[st.pi[def]].name, def, 'pickoff', K.AGENT_PICKOFF_HOLD_MULT) : 1;   /* part 2b: a pitcher who throws over holds the runner on first */
        st.sbAsked = true; if (R() < stealTryP(off, st.b[sbB - 2]) * agentMult(st.b[sbB - 2], off, 'steal', K.AGENT_STEAL_TRY_MULT) * hold) st.steal = sbB;
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
      /* ---- defence: the catcher goes out to talk to his pitcher (#614 part 11)? A runner in scoring position, right after a pitch,
       * while the team has a mound visit left (coach and catcher share MOUND_VISIT_LIMIT). Timing only: its own RNG, no continue
       * (the loop's own draws stay in order), so every outcome stays as it was; only later times move. ---- */
      if ((st.b[1] || st.b[2]) && st.mv[def] < st.mvCap[def] && ev.length && ev[ev.length - 1].k === 'P' && visitR() < K.CATCHER_VISIT_P) {
        const c = RR[def].bat.find(b => b.pos === 'C'), cn = c ? c.name : COPY.fielder('C');
        st.mv[def]++;
        emit('mound_visit', t, { team: def, pitcher: pit0.name, staff: 'catcher', catcher: cn, left: st.mvCap[def] - st.mv[def] });
        pushFrame({ t, d: K.CATCHER_VISIT_DUR, k: 'CVIS', desc: COPY.catcherVisit(TT[def], cn, pit0), s0: snap(), s1: snap(), def });
      }
      /* ---- offence: sacrifice bunt? (coach decides, late and close, weaker hitter) ---- */
      let bunt = false;
      if (st.outs === 0 && (st.b[0] || st.b[1]) && !st.b[2] && bat.pow < K.BUNT_POW_MAX && R() < K.BUNT_ASK_P * agentMult(bat.name, off, 'bunt', K.AGENT_BUNT_MULT)) {
        const margin = st.sc[off] - st.sc[def];
        bunt = st.inn >= K.BUNT_MIN_INNING && margin <= 0 && margin >= -K.BUNT_MAX_DEFICIT;
      }

      /* ---- defence: retaliation (#379 part 4)? The first batter the offended team's pitcher faces after one of its own was hit:
       * one chance, RETALIATE_P x the grudge points it holds x the pitcher's temperament factor; the first pitch hits him. ---- */
      let brush = false;
      if (retaliateOn && !warned && owed[def] > 0) {
        brush = feud() < Math.min(K.RETALIATE_MAX_P, K.RETALIATE_P * owed[def] * K.GRUDGE_TEMPER_SCALE[temperOf(pit0)]);
        owed[def] = 0;
      }

      let balls = 0, strikes = 0, paDone = false, pofN = 0;
      while (!paDone) {
        const s0 = snap(), c0 = [balls, strikes]; st.pc[def]++;
        const going = st.steal && st.steal === stealBase() ? st.steal : 0; st.steal = false;
        /* #795 part 2b: the pitcher's own agent set (fastball share, edges, pickoff); every factor is exactly 1 at LEVEL_NEUTRAL */
        const lvFb = agentLevel(pit.name, def, 'fastball'), lvEdge = agentLevel(pit.name, def, 'edges'), lvPo = agentLevel(pit.name, def, 'pickoff');
        const zoneM = K.AGENT_FASTBALL_ZONE_MULT[lvFb] * K.AGENT_EDGE_ZONE_MULT[lvEdge], poM = K.AGENT_PICKOFF_MULT[lvPo];
        const inZ = !brush && (bunt || R() < clamp(K.ZONE_BY_COUNT[balls][strikes] * pit.ctrl * zoneM, K.ZONE_P_MIN, K.ZONE_P_MAX));
        const zx = inZ ? (R() - K.HALF) * 2 * K.ZONE_HALF_WIDTH : (R() < K.HALF ? -1 : 1) * (K.MISS_X_MIN + R() * K.MISS_X_SPAN);
        const zy = inZ ? K.ZONE_Y_MIN + R() * K.ZONE_Y_SPAN : (R() < K.HALF ? K.MISS_LOW_Y - R() * K.MISS_LOW_SPAN : K.MISS_HIGH_Y + R() * K.MISS_HIGH_SPAN);
        const pq = look(), PT = fbMix(mixOf(pit0), K.AGENT_FASTBALL_SHARE_MULT[lvFb]).find(p => pq < p[1]);
        const kmh = Math.round(K.KMH_BASE + (pit.stuff - K.KMH_STUFF_REF) * K.KMH_PER_STUFF + PT[2] + (look() - K.HALF) * K.KMH_JITTER);
        const e = { t, k: 'P', bat: [off, bi], pit: [def, pitIdx(def)], pc: st.pc[def], c0, inZ, zx, zy, line, pline, pt: PT[0], kmh, s0, swing: false };
        let foulFly = false;
        /* #614 part 6: a check swing the catcher appeals to the base umpire on the batter's open side (first for a right-handed
         * batter, third for a left-handed one). A label drawn from the looks RNG on a ball or a swinging strike already decided,
         * so no outcome changes: `swing` false = the appeal is denied (ball stands), true = the base umpire rules a swing (strike). */
        const appeal = swing => { e.chk = { ump: bat.hand === 'L' ? 3 : 1, swing }; return COPY.checkSwing(e.chk.ump, swing); };

        /* ---- what happens to the pitch ---- */
        if (brush) { brush = false; e.r = 'hbp'; e.retal = true; }
        else if (!going && (st.b[0] || st.b[1] || st.b[2]) && R() < K.BK_P * K.AGENT_PICKOFF_BALK_MULT[lvPo]) {
          /* balk (#38): the pitcher stops in his motion, the umpire calls it, no pitch counts, every runner moves up one base */
          e.r = 'bk'; st.pc[def]--; e.pc = st.pc[def];
        } else if (!going && st.b[0] && !st.b[1] && R() < K.PO_P * poM) {
          /* pickoff (#38): the pitcher throws over to first before the pitch and the runner is tagged diving back; no pitch counts */
          e.r = 'po'; st.pc[def]--; e.pc = st.pc[def];
        } else if (!going && st.b[0] && !st.b[1] && pofN < K.POF_MAX_PA && R() < K.POF_P * poM) {
          /* throw-over that does not get him (#38): the runner is back in time, the ball goes back to the pitcher; no pitch counts */
          e.r = 'pof'; pofN++; st.pc[def]--; e.pc = st.pc[def];
        } else if (bunt) {
          /* #614 part 3: a bunt attempt can go foul: a strike at any count, so with two strikes a strikeout */
          e.swing = true;
          if (R() < K.BUNT_FOUL_P) { e.r = 'foul'; e.bunt = true; strikes++; e.foulDir = R() < K.BUNT_FOUL_RIGHT_P ? 1 : -1; }
          else e.r = 'inplay';
        }
        else {
          const sw = inZ ? K.SWING_ZONE_BY_COUNT[balls][strikes] : K.SWING_CHASE_BY_COUNT[balls][strikes] / bat.eye;
          const early = balls + strikes < K.AGENT_EARLY_PITCHES ? agentMult(bat.name, off, 'swing_early', K.AGENT_SWING_EARLY_MULT) : 1;
          if (R() < Math.min(K.SWING_MAX, early === 1 ? sw : sw * early)) {
            e.swing = true;
            const contactM = K.AGENT_FASTBALL_CONTACT_MULT[lvFb] * (inZ ? K.AGENT_EDGE_CONTACT_MULT[lvEdge] : 1);   /* part 2b: corner strikes are hard to square up */
            const contact = Math.min(K.CONTACT_MAX, (inZ ? K.CONTACT_IN_ZONE : K.CONTACT_CHASE) * bat.con / pit.stuff * contactM);
            /* #614 part 9: the bat clips the catcher's mitt: catcher's interference, the batter is awarded first (E2) */
            if (!going && rare() < K.CI_OF_SWING) e.r = 'ci';
            else if (R() > contact) { strikes++; e.r = 'sstr'; }
            else if (R() < (strikes === K.STRIKES_FOR_OUT - 1 ? K.FOUL_P_2K : K.FOUL_P)) {
              /* #614 part 1: some balls fouled off in the air are caught in foul ground (a fly-catch out, any count) */
              if (R() < K.FOUL_OUT_P) { e.r = 'inplay'; foulFly = true; }
              else { e.r = 'foul'; if (strikes < K.STRIKES_FOR_OUT - 1) strikes++; e.foulDir = R() < K.HALF ? -1 : 1; }
            }
            else e.r = 'inplay';
          } else if (inZ) { strikes++; e.r = 'cstr'; }
          else if (R() < K.HBP_P) e.r = 'hbp';
          else { balls++; e.r = 'ball'; }
        }

        let desc = '', moves = [], runs = 0, outs = [], play = null, plan = null, result = null, rbi = 0, sbGo = false;
        const name = bat.name, B = st.b;
        if (e.r === 'ci') {
          /* OBR 5.05(b)(3) / 6.01(c): dead ball, the batter takes first, only forced runners move; an error on the catcher, not an at-bat */
          const f = forceAdvance(name); moves = f.moves; runs = f.runs; st.E[def]++; paDone = true; e.big = K.BIG.NOTABLE;
          result = 'catcher_interference'; desc = COPY.catcherInterference(name);
          if (runs) desc += COPY.forcedIn(runs);
        } else if (e.r === 'hbp' || balls === K.BALLS_FOR_WALK) {
          const f = forceAdvance(name); moves = f.moves; runs = f.runs; bs.bb++; ps.bb++; paDone = true;
          result = e.r === 'hbp' ? 'hit_by_pitch' : 'walk';
          if (e.r === 'hbp' && grudgeOn) {
            const tp = temperOf(bat);
            const score = K.GRUDGE_HBP * K.GRUDGE_TEMPER_SCALE[tp];
            grudges.push({ inning: st.inn, half: st.half, from: bat.id, to: pit0.id, temper: tp, score, ...(e.retal ? { retaliation: true } : {}) });
            /* a retaliation ends the feud for this game (the umpire warns both benches); any other hit batter's team owes one back */
            if (e.retal) { warned = true; e.big = K.BIG.NOTABLE; } else owed[off] += score;
          }
          desc = e.r === 'hbp' ? COPY.hbp(name) : COPY.walk(name);
          if (e.r === 'ball' && look() < K.CHECK_APPEAL_BALL_P) desc = COPY.call('ball') + appeal(false) + '，' + desc;
          if (runs) { rbi = runs; desc += COPY.forcedIn(runs); }
        } else if (strikes === K.STRIKES_FOR_OUT) {
          /* #614 part 2: a share of the swinging third strikes are foul tips the catcher holds (a label, looks RNG) */
          /* #614 part 4: a third strike the catcher does not hold, first open or two outs: the batter runs, the catcher throws to first */
          const k3Free = !going && !e.bunt && (e.r === 'sstr' || e.r === 'cstr') && (!B[0] || st.outs === K.OUTS_PER_HALF - 1);
          if (k3Free && R() < (e.r === 'sstr' && !inZ && zy <= K.MISS_LOW_Y ? K.K3_DROP_DIRT_P : K.K3_DROP_P)) {
            const k = resolveDroppedThird(ctxOf(null), span(R, K.K3_RETRIEVE));
            plan = k.plan; outs = k.outs; e.k3 = true; e.big = k.ok ? K.BIG.NOTABLE : K.BIG.NONE;
            if (k.ok) { const f = forceAdvance(name); moves = f.moves; runs = f.runs; for (const m of moves) if (m[0] === 0) m[3] = k.tl; }
            desc = COPY.droppedThird(name, e.r === 'cstr', k.ok, runs, !!k.plan.k3tag);
          } else {
            if (e.r === 'sstr' && look() < K.FOUL_TIP_OF_WHIFF) e.tip = true;
            else if (e.r === 'sstr' && look() < K.CHECK_APPEAL_OF_WHIFF) appeal(true);
            outs.push(strikeout({ batter: name, looking: e.r === 'cstr', strikes, at: K.ARRIVE + (e.chk ? K.CHECK_APPEAL_AT : K.CATCH_SNAP) }));
            desc = COPY.strikeout(name, e.r === 'cstr', e.tip, e.bunt, e.chk && e.chk.ump);
          }
          bs.ab++; bs.k++; ps.k++; paDone = true; result = 'strikeout';
        } else if (e.r === 'inplay') {
          paDone = true; bs.ab++;
          /* ---- the batted ball ---- */
          let type, res = 'out', spray, d, hang, peak, tryLead = null, fumble = 0, foulKey = null;
          if (bunt) {
            const q = R(); type = 'GB';
            spray = K.BUNT_SPRAY_DEG[0] + R() * (K.BUNT_SPRAY_DEG[1] - K.BUNT_SPRAY_DEG[0]); d = span(R, K.BUNT_DIST); hang = d / K.BUNT_ROLL_SPEED; peak = K.GB_PEAK;
            if (q >= K.BUNT_HIT_END) tryLead = B[1] ? 3 : 2;            /* defence goes for the lead runner */
            else if (q >= K.BUNT_SAC_END) fumble = K.BUNT_HIT_FUMBLE;   /* a bunt too good to pick up cleanly */
          } else if (foulFly) {
            /* #614 part 1: a foul fly that is caught; FOUL_OUT_ZONES places it in foul ground near its fielder */
            const z = R(), [key, , [a0, aw], dd] = K.FOUL_OUT_ZONES.find(r => z < r[1]);
            type = K.FOUL_OUT_FB_KEYS.includes(key) ? 'FB' : 'PU';
            spray = a0 + R() * aw; d = span(R, dd);
            hang = span(R, type === 'PU' ? K.PU_HANG : K.FB_HANG); peak = span(R, type === 'PU' ? K.PU_PEAK : K.FB_PEAK);
            foulKey = key;
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
            if (res === '3B') { d = Math.max(d, K.TRIPLE_MIN_DIST); hang = Math.max(hang, d / K.HIT_HORIZ_SPEED_MAX); }
          }
          const land = spotXZ(spray, d);
          /* nearest fielder takes it */
          let fielder = 'P', nearest = Infinity;
          if (foulKey) {
            /* the fly stays up until its fielder is under it (FOUL_OUT_HANG_PAD), so the reach pull below never moves it */
            fielder = foulKey; nearest = dist(fielderStart(fielder, B, st.outs), land);
            const v = Math.min(K.FIELD_VAVG, rangeOf(def)(fielder));
            hang = Math.max(hang, nearest / (v * K.AIR_REACH_SAFETY) + K.FIELD_REACT + K.FOUL_OUT_HANG_PAD);
          } else for (const k of bunt ? K.BUNT_FIELDERS : FIELDER_KEYS) { if (k === 'C') continue; const dd = dist(fielderStart(k, B, st.outs), land); if (dd < nearest) { nearest = dd; fielder = k; } }
          /* a ball that is caught or fielded has to be reachable at a human pace: pull the landing point toward him.
           * A ball caught in the air gets no slack at all (the fielder is under it when it comes down). */
          let lx = land[0], lz = land[1];
          if (res === 'out' || res === 'E') {
            const [fx, fz] = fielderStart(fielder, B, st.outs), v = Math.min(K.FIELD_VAVG, rangeOf(def)(fielder));
            const reach = type === 'GB' ? Math.max(0, v * (hang - K.FIELD_REACT)) + K.GB_REACH_BONUS : Math.max(0, v * (hang - K.FIELD_REACT)) * K.AIR_REACH_SAFETY;
            if (nearest > reach) { const k = reach / nearest; lx = fx + (lx - fx) * k; lz = fz + (lz - fz) * k; }
          }
          play = { type, res, lx, lz, hang, peak, fielder, spray, dist: d, bunt };
          if (foulKey) play.foul = true;
          /* #614 part 10: infield fly (OBR 5.09(a)(5)): a fair pop-up or fly (not a liner or bunt) to an infielder, runners on first
           * and second, fewer than two outs: declared, the batter is out caught or not. The error draw above is then a dropped
           * infield fly: still an out, the runners hold (no new draw: R is not shifted) */
          if ((type === 'PU' || type === 'FB') && !foulKey && !bunt && (res === 'out' || res === 'E') && (fielder === 'P' || INFIELD_KEYS.includes(fielder))
            && st.outs < K.OUTS_PER_HALF - 1 && !!B[0] && !!B[1]) {
            play.infieldFly = true;
            if (res === 'E') { res = 'out'; play.res = 'out'; play.iffDrop = true; }
          }
          const ctx = ctxOf(play); ctx.fumble = fumble;
          const forcedOnGround = B[0] ? (B[1] ? (B[2] ? 3 : 2) : 1) : 0;   /* how many runners the batter pushes ahead of him */

          if (res === 'HR') {
            for (let i = 2; i >= 0; i--) if (B[i]) { moves.push([i + 1, HOME, B[i]]); runs++; }
            moves.push([0, HOME, name]); runs++; st.b = [null, null, null]; bs.h++; bs.hr++; st.H[off]++; ps.h++; ps.hr++;
            plan = resolveHit(ctx).plan; result = 'home_run'; desc = COPY.homer(name, runs); e.big = K.BIG.HUGE;
          } else if (res !== 'out') {
            const adv = res === '3B' ? 3 : res === '2B' ? 2 : 1, nb = [null, null, null];
            let sendHome = false;   /* out on the bases (#38): a runner from second who would hold at third is sent home */
            /* advancing on an error (#38): the outfielder bobbles the single; everyone takes one base more */
            const bobble = res === '1B' && OUTFIELD_KEYS.includes(fielder) && R() < K.OF_BOBBLE_1B_P;
            /* advancing on an error (#38): the infielder's throw to first sails past the bag; everyone takes one base more */
            const wildThrow = res === 'E' && type === 'GB' && !bunt && fielder !== '1B' && R() < K.WILD_THROW_SHARE;
            /* #614 part 7: ground-rule double: an air-ball double whose roll reaches the wall bounces over it; the ball is dead
             * and every runner gets exactly two bases (the runner from first stops at third) */
            const groundRule = res === '2B' && type !== 'GB' && !bunt && Math.sqrt(lx * lx + lz * lz) * K.HIT_ROLL_FACTOR > K.FENCE_R - K.WALL_PICKUP && R() < K.GRD_OF_WALL_2B_P;
            /* extra bases taken (#794 part 3): the runner's spd raises, the outfielder's arm lowers the chance he takes the
             * extra base (same one draw each, only the threshold moves; spd 1 and arm 1 give the old chance exactly) */
            const holdArm = OUTFIELD_KEYS.includes(fielder) ? clamp(1 - (armOf(def)(fielder) - 1) * K.XB_HOLD_PER_ARM, ...K.XB_ARM_RANGE) : 1;
            const xbP = (p, runner) => p * clamp(1 + (spdOf(off, runner) - 1) * K.XB_PER_SPD, ...K.XB_SPD_RANGE) * holdArm;
            for (let i = 2; i >= 0; i--) {
              if (!B[i]) continue; let to = i + 1 + adv;
              if (bobble || wildThrow) { to = Math.min(HOME, to + 1); moves.push([i + 1, to, B[i]]); if (to === HOME) runs++; else nb[to - 1] = B[i]; continue; }
              if (res === '1B' && i === 1 && R() < xbP(K.SCORE_FROM_2ND_ON_SINGLE, B[i])) to = HOME;
              else if (res === '1B' && i === 1 && OUTFIELD_KEYS.includes(fielder) && st.outs < K.OUTS_PER_HALF - 1 && R() < K.SEND_FROM_2ND_ON_SINGLE_P) {
                sendHome = true; moves.push([2, HOME, B[1]]); continue;   /* scores or is out: decided by the throw below */
              }
              if (res === '1B' && i === 0 && !nb[2] && R() < xbP(K.FIRST_TO_THIRD_ON_SINGLE, B[i])) to = 3;
              if (res === '2B' && i === 0 && !groundRule && R() < xbP(K.SCORE_FROM_1ST_ON_DOUBLE, B[i])) to = HOME;
              to = Math.min(HOME, to); while (to < HOME && nb[to - 1]) to++;
              moves.push([i + 1, to, B[i]]); if (to === HOME) runs++; else nb[to - 1] = B[i];
            }
            /* advancing on a throw (#38): the runner from second scores on an outfield single, second is open, the
             * outfielder throws home behind him and the batter takes second on the throw */
            const throwHome = !bobble && !sendHome && res === '1B' && OUTFIELD_KEYS.includes(fielder) && moves.some(m => m[0] === 2 && m[1] === HOME) && !nb[1] && R() < K.THROW_HOME_ON_SINGLE_P;
            /* out on the bases (#38): the batter tries to stretch an outfield single into a double; the throw decides */
            const stretch = !bobble && !throwHome && !sendHome && res === '1B' && OUTFIELD_KEYS.includes(fielder) && !nb[1] && st.outs < K.OUTS_PER_HALF - 1 && R() < K.STRETCH_1B_P;
            /* #614 part 15: obstruction (OBR 6.01(h)(2)): on an outfield single with second open, the batter rounding first runs into the
             * first baseman, who has no ball and is not fielding; the umpire awards him second, the base he would have reached.
             * Scored a single plus an error on 1B (OBR 9.12(c)); the other runners keep the bases the single gave them */
            const obstruct = !bobble && !throwHome && !sendHome && !stretch && res === '1B' && OUTFIELD_KEYS.includes(fielder) && !nb[1] && obsR() < K.OBSTRUCTION_OF_OF_1B_P;
            const bTo = throwHome || stretch || bobble || wildThrow || obstruct ? 2 : adv;
            moves.push([0, bTo, name]); nb[bTo - 1] = name; st.b = nb;
            if (bobble) { ctx.fumble = K.OF_BOBBLE_TIME; play.errAdvance = true; }
            if (wildThrow) play.wildThrow = true;
            if (groundRule) play.groundRule = true;
            if (obstruct) play.obstruction = true;
            const h = resolveHit(ctx, { throwHome, sendHome, stretch, bobble, wildThrow, obstruct }); plan = h.plan;
            if (sendHome) { if (h.safe) runs++; else { outs = h.outs; play.outHome = true; } }
            if (throwHome) { play.onThrow = true; }
            let hitRes = res;   /* the scorer's hit: a stretch that is safe is a double, one thrown out stays a single */
            if (stretch) { if (h.safe) hitRes = '2B'; else { outs = h.outs; play.outStretch = true; nb[1] = null; } }
            if (res === 'E') { st.E[def]++; result = 'error'; desc = COPY.error(name, type === 'GB'); }
            else { if (bobble || obstruct) st.E[def]++; bs.h++; st.H[off]++; ps.h++; if (hitRes === '2B') bs.d++; if (hitRes === '3B') bs.t++; result = { '1B': 'single', '2B': 'double', '3B': 'triple' }[hitRes]; desc = groundRule ? COPY.groundRuleDouble(name) : COPY.hit(name, hitRes); }
            if (runs) desc += COPY.drivesIn(runs);
            if (play.onThrow) desc += COPY.onThrow(name);
            if (play.outHome) desc += COPY.outAtHome(B[1]);
            if (play.outStretch) desc += COPY.outStretching();
            if (bobble) desc += COPY.errAdvance(fielder);
            if (wildThrow) desc += COPY.wildThrow(fielder);
            if (obstruct) desc += COPY.obstruction();
            e.big = runs ? K.BIG.NOTABLE : K.BIG.NONE;
          } else if (type === 'GB') {
            const tryDoublePlay = !bunt && !!B[0] && st.outs < K.OUTS_PER_HALF - 1 && R() < K.DP_TRY_P;
            let g = resolveGround(ctx, { tryDoublePlay, leadBase: tryLead });
            /* #614 part 12: a double play to the third baseman with nobody out and runners on first and second becomes a 5-4-3
             * triple play whenever all three forces beat their runners (resolveTriple); no draw, so R keeps its sequence */
            if (g.kind === 'dp') { const tp = resolveTriple(ctx); if (tp) g = tp; }
            plan = g.plan; outs = g.outs;
            if (g.kind === 'tp') {
              play.dp = true; play.tp = true; play.pace = runPace(bat.spd); moves = [];   /* three force outs: nobody advances and no run counts; pace: the batter's run (#794, render tpFix) */
              result = 'triple_play'; desc = COPY.triplePlay(name, fielder);
            } else if (g.kind === 'dp') {
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
                const push = bunt ? [2, 1, 0].filter(i => B[i]) : [...Array(forcedOnGround).keys()].reverse();
                for (const i of push) {
                  /* #826: a bunt never puts two runners on a base: the runner on third goes only when forced (bases loaded), the one on second only while third is free after that */
                  if (bunt && (i === 2 ? !(B[0] && B[1]) : nb[i + 1])) continue;
                  if (i === 2) { moves.push([3, HOME, B[2]]); runs++; nb[2] = null; } else { moves.push([i + 1, i + 2, B[i]]); nb[i + 1] = B[i]; nb[i] = null; } }
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
            /* runners tag only on a ball an outfielder catches (#38 part 13): a fly or a line drive; an infield fly or a
             * liner to an infielder is too short to score or take third on */
            const canTag = st.outs < K.OUTS_PER_HALF - 1 && (type === 'FB' || type === 'LD') && OUTFIELD_KEYS.includes(fielder);
            if (canTag && B[2] && R() < K.SAC_FLY_P) { tagUp = { from: 3, to: HOME }; sacFly = true; moves.push([3, HOME, B[2]]); runs++; nb[2] = null; }
            /* the runner on second tags and takes third if it is open; the throw goes to the lead runner */
            if (canTag && B[1] && !nb[2] && R() < K.TAG_2ND_TO_3RD_P) { tagUp = tagUp || { from: 2, to: 3 }; toThird = B[1]; moves.push([2, 3, B[1]]); nb[2] = B[1]; nb[1] = null; }
            /* #614 part 13: a liner an infielder catches, a runner on and fewer than two outs: the runner nearest the catch may
             * have broken on contact (drawn from `rare`, R keeps its sequence); the timing decides if he is doubled off */
            let ldDp = null;
            if (type === 'LD' && !foulKey && !bunt && (fielder === 'P' || INFIELD_KEYS.includes(fielder)) && st.outs < K.OUTS_PER_HALF - 1 && (B[0] || B[1] || B[2])) {
              let base = 0, best = Infinity;
              for (let i = 0; i < 3; i++) if (B[i]) { const dd = dist([lx, lz], BASES[i + 1]); if (dd < best) { best = dd; base = i + 1; } }
              /* #614 part 14: with nobody out, the low end of that same draw (LD_BOTH_BROKE_OF_P of it) has the next runner
               * off too (a hit-and-run sends them all): one number, so `rare` keeps its sequence */
              let base2 = 0;
              if (st.outs === 0) { best = Infinity; for (let i = 0; i < 3; i++) if (B[i] && i + 1 !== base) { const dd = dist([lx, lz], BASES[i + 1]); if (dd < best) { best = dd; base2 = i + 1; } } }
              const u = rare();
              if (u < K.LD_DOUBLED_OFF_P) ldDp = resolveDoubledOff(ctx, base, u < K.LD_DOUBLED_OFF_P * K.LD_BOTH_BROKE_OF_P ? base2 : 0);
              if (ldDp) { nb[base - 1] = null; play.ldDp = base; }
              if (ldDp && ldDp.plan.ldTp) { nb[ldDp.plan.ldTp.base - 1] = null; play.ldTp = ldDp.plan.ldTp.base; }
            }
            const fly = ldDp || resolveFly(ctx, tagUp, !!play.iffDrop); plan = fly.plan; outs = fly.outs; st.b = nb;
            if (sacFly) { result = 'sac_fly'; desc = COPY.sacFly(name, B[2]); bs.ab--; }   /* a sacrifice fly is not an at-bat */
            else { result = play.ldTp ? 'triple_play' : type === 'LD' ? 'lineout' : type === 'PU' ? 'popout' : 'flyout'; desc = play.iffDrop ? COPY.infieldFlyDrop(name, fielder) : play.foul ? COPY.foulOut(name, fielder) : play.ldTp ? COPY.lineTriplePlay(name, fielder, B[play.ldDp - 1], B[play.ldTp - 1]) : play.ldDp ? COPY.lineDoublePlay(name, fielder, B[play.ldDp - 1], play.ldDp) : type === 'LD' ? COPY.lineOut(name, fielder) : type === 'PU' ? COPY.popOut(name) : COPY.flyOut(name, fielder); }
            if (toThird) desc += COPY.tagToThird(toThird);
          }
          if (runs && outs.length) desc += COPY.runsNote(runs);
          rbi = res === 'E' || play.dp ? 0 : play.errAdvance ? (B[2] ? 1 : 0) : runs;   /* on a bobble only the runner from third is driven in by the single */
        } else if (e.r === 'po') {
          /* #614 part 8: a share of the pickoffs are run down between first and second (a label, looks RNG: same out) */
          const runner = B[0], rd = look() < K.RD_OF_PO_P, p = rd ? resolveRundown(ctxOf(null)) : resolvePickoff(ctxOf(null));
          plan = p.plan; outs = p.outs; st.b = [null, null, B[2]]; e.po = true; e.big = K.BIG.NOTABLE;
          if (rd) e.rd = true;
          desc = rd ? COPY.pickoffRundown(runner) : COPY.pickoff(runner);
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
          desc = COPY.call(e.bunt ? 'foulBunt' : e.r);
          if (going && e.r !== 'foul') {
            const runner = st.b[going - 2], s = resolveSteal(ctxOf(null), !(R() < stealOkP(off, runner, going) * agentMult(runner, off, 'steal', K.AGENT_STEAL_OK_MULT)), going);
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
          /* #614 part 2: a swinging strike the catcher held may be a foul tip: still a strike, the ball stays live (a steal goes on) */
          if (e.r === 'sstr' && !e.wp && look() < K.FOUL_TIP_OF_WHIFF) { e.tip = true; desc = COPY.call('tip') + desc.slice(COPY.call('sstr').length); }
          /* #614 part 6: check-swing appeals on a ball or a held swinging strike (labels, looks RNG) */
          else if (e.r === 'sstr' && !e.wp && look() < K.CHECK_APPEAL_OF_WHIFF) desc = COPY.call('chk') + appeal(true) + desc.slice(COPY.call('sstr').length);
          else if (e.r === 'ball' && !e.wp && look() < K.CHECK_APPEAL_BALL_P) desc = COPY.call('ball') + appeal(false) + desc.slice(COPY.call('ball').length);
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
          const slide = to >= 2 && inplay && play.res !== 'HR' && ((flyOut && from > 0) || (to === HOME ? outHere || look() < K.HOME_SLIDE_P : stays || outHere));
          m[3] = runnerTimeline(from, to, { kind: inplay ? (play.res === 'HR' ? 'trot' : 'inplay') : e.wp || e.k3 ? 'wp' : e.bk ? 'bk' : 'walk', tagUpAt: flyOut && from > 0 ? K.ARRIVE + plan.catchT : null, slide, pace: from === 0 && inplay && !play.onThrow ? runPace(bat.spd) : 1 });   /* on the throw home he trails the runner (#38 part 7) */
        }

        /* ---- broadcast timing: the result is shown when it has really happened ---- */
        const lastOut = outs.length ? Math.max(...outs.map(o => o.at)) : 0;
        let d = K.PITCH_DUR[e.r] || K.PITCH_DUR_DEFAULT, showAt = K.ARRIVE + K.CALL_LAG;
        if (inplay) {
          const walkBack = dist(plan.target, plan.start) / K.WALK_BACK_SPEED;
          d = K.INPLAY_BASE_DUR + play.hang + (moves.length ? K.INPLAY_MOVES_DUR : 0) + (runs ? K.INPLAY_RUNS_DUR : 0);
          d = Math.max(d, K.ARRIVE + plan.catchT + K.POST_CATCH_HOLD + walkBack + K.WALK_BACK_PAD, K.ARRIVE + plan.arrive + K.POST_PLAY_HOLD, ...moves.map(m => m[3].arriveT + K.POST_PLAY_HOLD));
          showAt = outs.length ? lastOut + K.OUT_CALL_LAG : play.infield ? moves[0][3].arriveT + K.OUT_CALL_LAG : K.ARRIVE - K.HIT_SHOW_LEAD + play.hang;
        } else if (e.k3) {
          /* #614 part 4: the call at first is shown when the throw or the batter gets there */
          showAt = (outs.length ? lastOut : plan.runnerAt) + K.OUT_CALL_LAG;
          d = Math.max(d, plan.arrive + K.POST_PLAY_HOLD, showAt + K.POST_PLAY_HOLD, ...moves.map(m => m[3].arriveT + K.POST_PLAY_HOLD));
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
          if (e.r === 'hbp') d = K.PITCH_DUR.hbp - K.PA_END_HOLD;   /* #610: the walk to first, then the trainer's check; PA_END_HOLD below makes it PITCH_DUR.hbp */
          else if (paDone && e.r === 'ball') d = K.WALK_FRAME_DUR;
          if (outs.length) showAt = lastOut + K.OUT_CALL_LAG;
        }
        if (paDone) d += K.PA_END_HOLD;
        e.d = d; e.showAt = showAt;
        emitPitchFrame(e, { pitcher: pit.name, result, rbi });
        pushFrame(e);
        /* #379 part 5: after a retaliation the hit batter may charge the mound and both benches empty; a feud draw only after a
         * retaliation (which R never sees), state unchanged, so outcomes stay; only later times move */
        if (e.retal && benchOn && !over && feud() < Math.min(K.BENCH_CLEAR_MAX_P, K.BENCH_CLEAR_P * K.GRUDGE_TEMPER_SCALE[temperOf(bat)])) {
          emit('bench_clearing', t, { team: off, batter: bat.name, pitcher: pit0.name });
          pushFrame({ t, d: K.BENCH_CLEAR_DUR, k: 'BENCH', desc: COPY.benchClear(bat.name, pit0.name), s0: snap(), s1: snap(), off, def, big: K.BIG.HUGE });
          /* #379 part 6: the umpire may eject the pitcher who threw at him (feud RNG, after the bench-clearing draw) */
          if (ejectOn && feud() < K.EJECT_PITCHER_P) {
            ejected[def] = true;
            emit('ejection', t, { team: def, player: pit0.name, role: 'pitcher', reason: 'retaliation' });
          }
          /* #379 part 7: then the batter who charged the mound (feud RNG, after the pitcher draw; nothing draws from feud later) */
          if (ejectBatOn && feud() < Math.min(K.EJECT_BATTER_MAX_P, K.EJECT_BATTER_P * K.GRUDGE_TEMPER_SCALE[temperOf(bat)])) {
            ejectedBat[off] = bat.name;
            emit('ejection', t, { team: off, player: bat.name, role: 'batter', reason: 'charged_mound' });
          }
        }
        if (st.outs >= K.OUTS_PER_HALF && !paDone) break;
        /* #614 part 3: two strikes after a foul bunt: the coach mostly takes the bunt off and lets him swing away */
        if (bunt && !paDone && strikes === K.STRIKES_FOR_OUT - 1 && R() >= K.BUNT_2K_KEEP_P) bunt = false;
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
    st.outs = 0; st.b = [null, null, null]; st.sbAsked = false; st.ibbAsked = false; st.steal = false; st.phAsked = false; st.prAsked = false;
    pushFrame({ t, d: K.BREAK_DUR, k: 'BRK', desc: COPY.halfEnd(s0.inn, s0.half, TT, s0.sc), s0, s1: snap() });
  }

  const fin = snap(), winner = fin.sc[0] > fin.sc[1] ? 0 : fin.sc[1] > fin.sc[0] ? 1 : -1;
  emit('game_end', t, { score: fin.sc.slice(), innings: fin.inn, winner, walkoff: st.outs < K.OUTS_PER_HALF });
  fin.outs = K.OUTS_PER_HALF;
  ev.push({ t, d: 1e9, k: 'END', desc: winner < 0 ? COPY.tie(fin.sc) : COPY.final(TT[winner], fin.sc), s0: fin, s1: fin });
  const out = { ev, stream, dur: t, stats, batters, pst, final: fin, wp, lp, staff: RR.map(r => r.pit), teams: TI, seed, engine: K.ENGINE_VERSION };
  if (grudgeOn) out.grudges = grudges;
  return out;
}
