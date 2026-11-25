/* Headless whole-game suite. Simulates GAMES full games (default 1000) under plain Node and
 * fails if any of them breaks a rule of baseball or of this repository:
 *
 *   - a game does not terminate, or ends in a way the rules do not allow
 *   - an out without a legal reason (the reason is re-derived here from the fielder actions in
 *     the event stream: who held the ball, who was on the base, when the runner got there)
 *   - a half inning without exactly 3 outs (except the last half of a walk-off)
 *   - the batting order is broken
 *   - the score differs from the runs recorded in the stream
 *   - two runs of the same seed differ (determinism)
 *   - engine/ calls a Math function whose last bit is not the same in every JavaScript engine (sin, cos,
 *     pow, ...), or the engine's own sine and cosine are wrong or no longer give the recorded bits
 *   - engine/ touches the DOM, three.js, wall-clock time, unseeded randomness or the viewer code
 *   - a count table of the engine does not cover every count, or holds something that is not a probability
 *   - the league-wide rates of the default sample drift away from the reference league (REFERENCE below)
 *   - a fielder waits to tag in the lane of the runner sliding into his base
 *   - the coach, left to himself, takes out a starter who is pitching well and has not thrown many pitches
 *   - starters leave much earlier or later than in the reference league (innings per start)
 *
 * Every team plays every other team, home and away. The league-wide rates are printed for tuning.
 * Usage: node tests/replay/run.mjs            (GAMES=200 node ... for a quicker run, rates not checked) */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { simGame, boxFromStream, aggregate, fielderStart, sinCosDeg, BASES, ENGINE_VERSION, TEAMS, ZONE_BY_COUNT, SWING_ZONE_BY_COUNT, SWING_CHASE_BY_COUNT, BALLS_FOR_WALK, STRIKES_FOR_OUT } from '../../engine/index.js';

const GAMES = Number(process.env.GAMES || 1000);
const FIRST_SEED = Number(process.env.SEED || 1);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/* Physical limits used to sanity-check the engine's own timings. Deliberately generous. */
const MAX_SPRINT = 10.5;      /* m/s: nobody covers ground faster than this */
const MAX_THROW = 46;         /* m/s: nobody throws harder than this */
const EPS = 2e-3;             /* stream times are rounded to the millisecond */
const REGULATION = 9, MAX_INNINGS = 15, LINEUP = 9;
const SPOT_SLACK = 1.5;       /* a covering fielder stands within this distance of the bag */
const TAG_LANE_CLEAR = 0.3;   /* a fielder waiting to tag stands at least this far beside the arriving runner's lane */
/* The quick hook (#59): with nobody voting, a starter who has allowed at most GOOD_START_RUNS runs is not
 * taken out by his coach before he has thrown GOOD_START_PITCHES pitches. */
const GOOD_START_RUNS = 1, GOOD_START_PITCHES = 80;
/* Innings per start of the reference league (MLB 2025 starters, about 5.2) and how far the default sample may be from it. */
const IP_PER_START = 5.2, IP_PER_START_TOL = 0.15;

/* Reference league: MLB 2025 regular season (2,430 games; league totals from Baseball Savant, runs and
 * intentional walks from the league pitching line). GIDP and steals: MLB 2026 through early August.
 * Wild pitches (#38): 0.34 wild pitches + passed balls per team game in 2025 (CBS Sports, 2025-07-02, "where'd all
 * the wild pitches go"), of which wild pitches are about 6 in 7 -> about 0.29 per team game, 0.58 per game;
 * passed balls the other 1 in 7 -> about 0.05 per team game, 0.10 per game.
 * Steals of third (#38): MLB 2024 (the last full season with published counts), 567 attempts, 466 safe (82.2%) in 2,430
 * games (FanGraphs, 2025-04-23, "The Steals Will Continue Until Success Rates Decline": 2023's 605 tries and 510 steals,
 * then 38 fewer tries and 44 fewer steals in 2024) -> 0.19 SB3 and 0.04 CS3 per game. They are part of SB/game and CS/game.
 * Pickoffs: 185 runners picked off before the 2023 All-Star break, on pace for 346 in 2,430 games (FanGraphs, 2023-07-07,
 *   "pickoffs are still very much on"; no full 2024/2025 count found) -> 0.14 per game.
 * Balks: 181 in 2,430 games in 2025 (Baseball-Reference league pitching totals, 0.04 per team game) -> 0.074 per game.
 * Per-game numbers count both teams. The default sample has to stay within the tolerance, which is about
 * three standard errors of a 1000-game sample plus a little room for the model. Tighten, never loosen. */
const RATE_SAMPLE_MIN = 1000;
const REFERENCE = [   /* [aggregate() key, label, reference, tolerance, decimals, shown as a percentage] */
  ['runsPerGame', 'runs/game', 8.89, 0.7, 2], ['kPct', 'K%', 0.222, 0.01, 1, true], ['bbPct', 'BB%', 0.084, 0.008, 1, true], ['hbpPct', 'HBP%', 0.0105, 0.003, 2, true],
  ['avg', 'AVG', 0.245, 0.008, 3], ['obp', 'OBP', 0.315, 0.009, 3], ['slg', 'SLG', 0.404, 0.014, 3], ['babip', 'BABIP', 0.29, 0.009, 3],
  ['hrPerGame', 'HR/game', 2.33, 0.25, 2], ['doublesPerGame', '2B/game', 3.19, 0.35, 2], ['triplesPerGame', '3B/game', 0.26, 0.12, 2],
  ['gidpPerGame', 'GIDP/game', 1.29, 0.25, 2], ['ibbPerGame', 'IBB/game', 0.23, 0.12, 2], ['sbPerGame', 'SB/game', 1.36, 0.3, 2], ['csPerGame', 'CS/game', 0.41, 0.15, 2], ['wpPerGame', 'WP/game', 0.58, 0.12, 2], ['pbPerGame', 'PB/game', 0.10, 0.05, 2], ['bkPerGame', 'BK/game', 0.074, 0.03, 3], ['poPerGame', 'PO/game', 0.14, 0.05, 2], ['sb3PerGame', 'SB3/game', 0.19, 0.06, 2], ['cs3PerGame', 'CS3/game', 0.04, 0.03, 2],
  ['pitchesPerPa', 'pitches/PA', 3.88, 0.12, 2], ['zonePct', 'zone', 0.507, 0.015, 1, true], ['swingPct', 'swing', 0.478, 0.015, 1, true],
  ['zoneSwingPct', 'zone swing', 0.668, 0.015, 1, true], ['chasePct', 'chase', 0.282, 0.015, 1, true], ['whiffPct', 'whiff', 0.253, 0.015, 1, true],
];

const failures = [];
const fail = (seed, msg) => { if (failures.length < 40) failures.push(`seed ${seed}: ${msg}`); else if (failures.length === 40) failures.push('... more failures suppressed'); };
const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/* distance from point p to the segment a-b */
const segDist = (p, a, b) => {
  const vx = b[0] - a[0], vz = b[1] - a[1], k = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vz) / (vx * vx + vz * vz)));
  return d2(p, [a[0] + vx * k, a[1] + vz * k]);
};

/* ---------- static check: the engine is pure ---------- */
function checkPurity() {
  const banned = [[/\bdocument\b|\bwindow\b|\blocalStorage\b|\bnavigator\b/, 'DOM access'], [/from\s+['"]three|THREE\./, 'three.js'], [/Math\.random\s*\(/, 'unseeded randomness'],
    [/\bDate\.now\b|new Date\b|performance\.now/, 'wall-clock time'], [/from\s+['"][^'"]*\/(render|ui|commentary)\//, 'import from viewer code'], [/\bfetch\s*\(|XMLHttpRequest/, 'network access'],
    [/\bMath\.(a?sinh?|a?cosh?|a?tanh?|atan2|exp|expm1|log(1p|2|10)?|pow|cbrt|hypot)\b|\*\*/, 'a Math function (or **) whose last bit differs between JavaScript engines: use + - * / and Math.sqrt (#7)']];
  const walk = dir => readdirSync(dir).flatMap(f => { const p = path.join(dir, f); return statSync(p).isDirectory() ? walk(p) : /\.m?js$/.test(f) ? [p] : []; });
  for (const file of walk(path.join(ROOT, 'engine'))) {
    const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    if (file.endsWith('season.js')) continue;   /* CLI tool: reads process.argv, prints a report */
    for (const [re, what] of banned) if (re.test(src)) fail('static', `${path.relative(ROOT, file)}: ${what}`);
  }
}

/* ---------- static check: the engine's own sine and cosine (#7) ---------- */
const TRIG_GRID = 7, TRIG_TURNS = 2;   /* the angles checked are k / TRIG_GRID degrees, TRIG_TURNS full turns each way */
const TRIG_TOL = 2e-15;                /* against Math.sin and Math.cos of this Node, which round their own argument */
/* sha256 (first 16 hex digits) of every value on the grid. The arithmetic behind it is exactly rounded, so any
 * JavaScript engine gives this print. If sinCosDeg is changed on purpose: every stream may change, so bump
 * ENGINE_VERSION and record the new print here. */
const TRIG_PRINT = 'a96b371e0cf68775';
function checkTrig() {
  for (const [a, sin, cos] of [[0, 0, 1], [90, 1, 0], [180, 0, -1], [270, -1, 0], [360, 0, 1], [-90, -1, 0]]) {
    const [s, c] = sinCosDeg(a);
    if (!Object.is(s, sin) || !Object.is(c, cos)) fail('static', `sinCosDeg(${a}) is [${s}, ${c}], expected exactly [${sin}, ${cos}]`);
  }
  const values = [], DEG = Math.PI / 180, last = TRIG_TURNS * 360 * TRIG_GRID;
  for (let k = -last; k <= last; k++) {
    const a = k / TRIG_GRID, [s, c] = sinCosDeg(a), [sm, cm] = sinCosDeg(-a);
    values.push(s, c);
    if (!(Math.abs(s - Math.sin(a * DEG)) <= TRIG_TOL && Math.abs(c - Math.cos(a * DEG)) <= TRIG_TOL)) fail('static', `sinCosDeg(${a}) is [${s}, ${c}]: not the sine and cosine of ${a} degrees`);
    if (sm !== -s || cm !== c || Object.is(s, -0) || Object.is(c, -0)) fail('static', `sinCosDeg(${a}) and sinCosDeg(${-a}) are not mirror images, or one holds a negative zero`);
  }
  const print = createHash('sha256').update(JSON.stringify(values)).digest('hex').slice(0, 16);
  if (print !== TRIG_PRINT) fail('static', `sinCosDeg gives print ${print}, recorded ${TRIG_PRINT}: its bits changed (see TRIG_PRINT)`);
}

/* ---------- static check: the count tables cover every count ---------- */
function checkTables() {
  for (const [name, table] of Object.entries({ ZONE_BY_COUNT, SWING_ZONE_BY_COUNT, SWING_CHASE_BY_COUNT })) {
    if (table.length !== BALLS_FOR_WALK || table.some(row => row.length !== STRIKES_FOR_OUT)) fail('static', `${name} must have ${BALLS_FOR_WALK} rows of ${STRIKES_FOR_OUT} (one cell per count)`);
    if (table.flat().some(p => !(p >= 0 && p <= 1))) fail('static', `${name} holds a value that is not a probability`);
  }
}

/* ---------- one game ---------- */
function checkGame(seed, g) {
  const S = g.stream, bad = msg => fail(seed, msg);
  if (!S.length || S[0].type !== 'game_start' || S[S.length - 1].type !== 'game_end') return bad('stream does not run from game_start to game_end');
  const end = S[S.length - 1];

  let bases = [null, null, null], half = null, outsInHalf = 0, halfClosed = true, lastT = -1;
  const expectBatter = [0, 0], halves = [];
  let strikes = 0, balls = 0;

  /* group by frame so that everything that happens on one pitch is judged together */
  const frames = new Map();
  S.forEach((x, i) => {
    if (x.i !== i) bad(`stream index ${x.i} at position ${i}`);
    if (x.t < lastT - EPS) bad(`time runs backwards at event ${i} (${x.type})`);
    lastT = Math.max(lastT, x.t);
    if (!frames.has(x.f)) frames.set(x.f, []);
    frames.get(x.f).push(x);
  });

  for (const [, F] of frames) {
    const pre = bases.slice(), preOuts = outsInHalf;
    const contact = F.find(x => x.type === 'contact'), pitch = F.find(x => x.type === 'pitch');
    const actions = F.filter(x => x.type === 'fielder_action');
    const batterRuns = !!contact || F.some(x => x.type === 'pa_end' && /walk|hit_by_pitch/.test(x.result));

    /* who holds the ball, replayed from the fielder actions */
    const holderAt = (fielder, time) => {
      /* no pitch thrown (a pickoff, #38): the pitcher starts with the ball */
      let holder = pitch || contact ? null : 'P', since = null, flight = null;
      for (const a of actions) {
        if (a.t > time + EPS) break;
        if (a.action === 'field' || a.action === 'catch') { holder = a.fielder; since = a.t; }
        else if (a.action === 'throw') { if (holder !== a.fielder && !(a.fielder === 'C' && !contact)) return `${a.fielder} throws a ball he does not hold`; flight = { from: a.fielder, to: a.to, t: a.t }; holder = null; }
        else if (a.action === 'receive') {
          if (!flight || flight.to !== a.fielder) return `${a.fielder} receives a ball nobody threw to him`;
          holder = a.fielder; since = a.t; flight = null;
        }
      }
      return holder === fielder ? null : `${fielder} does not hold the ball (holder: ${holder})`;
    };
    /* a fielder cannot be at a base sooner than a sprint from where he started allows */
    const canBeThere = (fielder, base, time, t0) => {
      const from = fielderStart(fielder, pre, preOuts), need = Math.max(0, d2(from, BASES[base]) - SPOT_SLACK) / MAX_SPRINT;
      return time - t0 + EPS >= need;
    };
    const playStart = contact ? contact.t : pitch ? pitch.t : F[0].t;

    for (const x of F) {
      if (x.type === 'half_start') {
        if (!halfClosed && half) bad(`inning ${half.inning} half ${half.half} never ended`);
        half = { inning: x.inning, half: x.half, outs: 0 }; halves.push(half); halfClosed = false; outsInHalf = 0; bases = [null, null, null]; pre.fill(null); strikes = balls = 0;
        if (x.team !== x.half) bad('wrong team batting');
      } else if (x.type === 'runner_placed') {
        if (half.inning <= REGULATION) bad('tiebreak runner in regulation');
        bases[x.base - 1] = x.runner; pre[x.base - 1] = x.runner;
      } else if (x.type === 'pitch') {
        if (x.lineup !== expectBatter[x.team]) bad(`batting order: lineup slot ${x.lineup} at bat, expected ${expectBatter[x.team]} (inning ${half.inning})`);
        if (outsInHalf >= 3) bad('pitch thrown after the third out');
        if (x.count[0] !== balls || x.count[1] !== strikes) bad(`count is ${x.count} but the calls add up to ${balls}-${strikes}`);
      } else if (x.type === 'call') {
        if (x.call === 'ball') balls++;
        else if (x.call === 'called_strike' || x.call === 'swinging_strike') strikes++;
        else if (x.call === 'foul' && strikes < 2) strikes++;
      } else if (x.type === 'out') {
        outsInHalf++; half.outs++;
        if (x.outs !== outsInHalf) bad(`out number ${x.outs}, expected ${outsInHalf}`);
        if (outsInHalf > 3) bad('more than three outs in a half inning');
        const why = legalOut(x);
        if (why) bad(`illegal out (${x.reason}, ${x.runner}, base ${x.base}, inning ${half.inning}): ${why}`);
      } else if (x.type === 'pa_end') {
        if (x.lineup !== expectBatter[x.team]) bad(`batting order: plate appearance by slot ${x.lineup}, expected ${expectBatter[x.team]}`);
        if (x.result === 'walk' && balls !== 4) bad(`walk on ${balls} balls`);
        expectBatter[x.team] = (expectBatter[x.team] + 1) % LINEUP; strikes = balls = 0;
      } else if (x.type === 'half_end') {
        if (x.outs !== 3 || outsInHalf !== 3) bad(`inning ${x.inning} half ${x.half} ended with ${outsInHalf} outs`);
        halfClosed = true;
      }
    }

    function legalOut(x) {
      if (x.reason === 'strikeout_swinging' || x.reason === 'strikeout_looking') {
        const call = F.find(c => c.type === 'call');
        if (!call) return 'no pitch was called';
        if (strikes !== 3) return `only ${strikes} strikes`;
        if (x.reason === 'strikeout_looking' ? call.call !== 'called_strike' : call.call !== 'swinging_strike') return `last pitch was ${call.call}`;
        if (x.t + EPS < call.t) return 'recorded before the pitch was called';
        return null;
      }
      if (x.reason === 'fly_catch') {
        if (!contact) return 'no batted ball';
        if (contact.ball === 'GB') return 'a ground ball cannot be caught on the fly';
        const c = actions.find(a => a.action === 'catch' && a.fielder === x.fielder);
        if (!c) return `${x.fielder} never caught the ball`;
        if (c.t > x.t + EPS) return 'out recorded before the catch';
        if (c.t + EPS < contact.t + contact.hang) return 'caught before the ball came down';
        const run = d2(fielderStart(x.fielder, pre, preOuts), contact.land);
        if ((c.t - contact.t) * MAX_SPRINT + EPS < run) return `${x.fielder} cannot cover ${run.toFixed(1)} m in ${(c.t - contact.t).toFixed(2)} s`;
        if (x.runner !== contact.batter) return 'wrong player out';
        return null;
      }
      if (x.reason === 'force' || x.reason === 'tag') {
        if (!x.fielder) return 'no fielder';
        const origin = x.from === 0 ? null : pre[x.from - 1];
        if (x.from === 0 ? (!contact || contact.batter !== x.runner) : origin !== x.runner) return `${x.runner} was not on base ${x.from}`;
        const hold = holderAt(x.fielder, x.t);
        if (hold) return hold;
        if (!(x.t < x.runnerAt + EPS)) return 'runner was already there';
        if (!canBeThere(x.fielder, x.base, x.t, playStart)) return `${x.fielder} cannot reach base ${x.base} that fast`;
        if (x.reason === 'force') {
          let forced = batterRuns; for (let b = x.from - 1; b >= 1; b--) if (!pre[b - 1]) forced = false;
          if (!forced) return 'runner is not forced';
          const touch = actions.find(a => a.action === 'touch' && a.fielder === x.fielder && a.base === x.base);
          if (!touch) return `${x.fielder} never touched base ${x.base}`;
          if (touch.t > x.t + EPS) return 'out recorded before the base was touched';
          if (!(x.t + EPS < x.runnerAt)) return 'ball did not beat the runner';
        } else {
          const tag = actions.find(a => a.action === 'tag' && a.fielder === x.fielder && a.base === x.base);
          if (!tag) return `${x.fielder} never applied a tag`;
          if (!(x.ballAt + EPS < x.runnerAt)) return 'ball arrived after the runner';
        }
        /* every throw in the chain must be physically possible */
        for (let i = 0; i < actions.length; i++) {
          const a = actions[i]; if (a.action !== 'throw' || !a.to) continue;
          const r = actions.find(b => b.action === 'receive' && b.fielder === a.to && b.t + EPS >= a.t);
          if (!r) return `throw to ${a.to} never arrives`;
        }
        return null;
      }
      return `unknown reason "${x.reason}"`;
    }

    /* base runners after this frame */
    const gone = new Set(F.filter(x => x.type === 'out').map(x => x.runner));
    const next = bases.map(r => (gone.has(r) ? null : r));
    const adv = F.filter(x => x.type === 'runner_advance');
    for (const a of adv) if (a.from > 0) { if (next[a.from - 1] !== a.runner) bad(`${a.runner} advances from base ${a.from} but is not there`); next[a.from - 1] = null; }
    for (const a of adv) if (a.to < 4) { if (next[a.to - 1]) bad(`two runners on base ${a.to}`); next[a.to - 1] = a.runner; }
    for (const r of F.filter(x => x.type === 'run_scored')) if (!adv.some(a => a.runner === r.runner && a.to === 4)) bad(`${r.runner} scored without reaching home`);
    bases = next;
  }

  /* ---- innings and the end of the game ---- */
  halves.forEach((h, i) => {
    const last = i === halves.length - 1;
    if (h.outs !== 3 && !(last && end.walkoff)) bad(`inning ${h.inning} half ${h.half}: ${h.outs} outs`);
    const prev = halves[i - 1];
    if (prev && !(prev.half === 0 ? (h.half === 1 && h.inning === prev.inning) : (h.half === 0 && h.inning === prev.inning + 1))) bad('halves out of order');
  });
  const lastHalf = halves[halves.length - 1], [away, home] = end.score;
  if (lastHalf.inning < REGULATION) bad(`game ended in inning ${lastHalf.inning}`);
  if (lastHalf.inning > MAX_INNINGS) bad('game ran past the inning limit');
  if (end.walkoff && !(lastHalf.half === 1 && home > away)) bad('walk-off without the home team winning in the bottom half');
  if (!end.walkoff && lastHalf.half === 0 && !(home > away)) bad('bottom half skipped although the home team is not ahead');
  if (!end.walkoff && lastHalf.half === 1 && away === home && lastHalf.inning < MAX_INNINGS) bad('game ended tied before the inning limit');
  if (end.winner !== (away > home ? 0 : home > away ? 1 : -1)) bad('wrong winner');

  /* ---- score = runs recorded ---- */
  const box = boxFromStream(S);
  if (box.score[0] !== away || box.score[1] !== home) bad(`score ${end.score} but ${box.score} runs recorded`);
  if (g.final.sc[0] !== away || g.final.sc[1] !== home) bad('final score differs from the stream');
  for (const k of [0, 1]) {
    const line = g.final.ls[k].reduce((a, b) => a + (b || 0), 0);
    if (line !== g.final.sc[k]) bad(`line score adds up to ${line}, score is ${g.final.sc[k]}`);
    for (let i = 0; i < g.final.ls[k].length; i++) if ((g.final.ls[k][i] || 0) !== (box.line[k][i] || 0)) bad(`inning ${i + 1}: line score ${g.final.ls[k][i]} vs ${box.line[k][i]} runs recorded`);
    const mine = g.stats[k].reduce((a, b) => ({ ab: a.ab + b.ab, h: a.h + b.h, k: a.k + b.k, bb: a.bb + b.bb, hr: a.hr + b.hr }), { ab: 0, h: 0, k: 0, bb: 0, hr: 0 }), T = box.team[k];
    if (mine.ab !== T.ab || mine.h !== T.h || mine.k !== T.k || mine.hr !== T.hr || mine.bb !== T.bb + T.hbp) bad(`team ${k} batting totals differ between engine and stream`);
  }
  /* ---- a tag is taken beside the runner's lane, not in it (frames: the spot is not in the stream) ---- */
  for (const e of g.ev) {
    const plan = e.plan, cover = plan && plan.CV;
    if (!cover || !cover.key || cover.base == null) continue;
    if (!(plan.steal || plan.tagPlay || plan.actions.some(a => a.a === 'tag'))) continue;
    const clear = segDist(cover.spot, BASES[cover.base - 1], BASES[cover.base]);
    if (clear < TAG_LANE_CLEAR) bad(`${cover.key} waits to tag ${clear.toFixed(2)} m from the lane into base ${cover.base} (at least ${TAG_LANE_CLEAR} m)`);
  }
  if (g.ev.length && g.ev[g.ev.length - 1].k !== 'END') bad('frame list does not end with END');
  return box;
}

/* ---------- one game: how long the starters lasted and who took them out ---------- */
const hook = { starts: 0, outs: 0, pitches: 0, changes: 0, asked: 0, coachChange: 0 };
function checkHook(seed, S) {
  const sp = [0, 1].map(() => ({ inGame: true, outs: 0, runs: 0, pitches: 0 }));   /* indexed by the team in the field */
  for (const x of S) {
    if (x.type === 'pitch') { const p = sp[1 - x.team]; if (p.inGame) p.pitches = x.n; }
    else if (x.type === 'out') { const p = sp[1 - x.team]; if (p.inGame) p.outs++; }
    else if (x.type === 'run_scored') { const p = sp[1 - x.team]; if (p.inGame) p.runs++; }
    else if (x.type === 'substitution' && x.role === 'pitcher') { sp[x.team].inGame = false; hook.changes++; }
    else if (x.type === 'decision' && x.kind === 'P' && x.pending) {
      hook.asked++; if (x.pick === 'change') hook.coachChange++;
      const p = sp[x.team];
      if (p.inGame && x.pick === 'change' && p.runs <= GOOD_START_RUNS && p.pitches < GOOD_START_PITCHES)
        fail(seed, `the coach takes out his starter after ${p.pitches} pitches and ${p.runs} run(s) (a starter with at most ${GOOD_START_RUNS} run(s) allowed gets at least ${GOOD_START_PITCHES} pitches)`);
    }
  }
  for (const p of sp) { hook.starts++; hook.outs += p.outs; hook.pitches += p.pitches; }
}

/* ---------- run ---------- */
checkPurity();
checkTables();
checkTrig();
const boxes = [], outReasons = {}, results = {};
const digest = createHash('sha256');
const started = process.hrtime.bigint();
/* every team plays every other team, home and away, so the rates are the league's and not one matchup's */
const PAIRINGS = TEAMS.flatMap((_, away) => TEAMS.map((_, home) => [away, home])).filter(([away, home]) => away !== home);
for (let n = 0; n < GAMES; n++) {
  const seed = FIRST_SEED + n, opts = { teams: PAIRINGS[n % PAIRINGS.length] };
  let g;
  try { g = simGame(seed, {}, opts); } catch (err) { fail(seed, `engine threw: ${err.message}`); continue; }
  const json = JSON.stringify(g.stream);
  try { if (JSON.stringify(simGame(seed, {}, opts).stream) !== json) fail(seed, 'not deterministic: two runs differ'); } catch (err) { fail(seed, `second run threw: ${err.message}`); }
  digest.update(json);
  const box = checkGame(seed, g);
  if (box) { boxes.push(box); checkHook(seed, g.stream); }
  for (const x of g.stream) { if (x.type === 'out') outReasons[x.reason] = (outReasons[x.reason] || 0) + 1; if (x.type === 'pa_end') results[x.result] = (results[x.result] || 0) + 1; }
}
const ms = Number(process.hrtime.bigint() - started) / 1e6;

const A = aggregate(boxes), f3 = x => x.toFixed(3).replace(/^0/, ''), pct = x => (x * 100).toFixed(1) + '%';
const totalOuts = Object.values(outReasons).reduce((a, b) => a + b, 0);
console.log(`engine ${ENGINE_VERSION}: ${GAMES} games (seeds ${FIRST_SEED}..${FIRST_SEED + GAMES - 1}, ${PAIRINGS.length} pairings of ${TEAMS.length} teams) in ${(ms / 1000).toFixed(1)} s`);
console.log(`stream digest ${digest.digest('hex').slice(0, 16)}`);
console.log(`runs/game ${A.runsPerGame.toFixed(2)}   K% ${pct(A.kPct)}   BB% ${pct(A.bbPct)}   AVG ${f3(A.avg)}   OBP ${f3(A.obp)}   SLG ${f3(A.slg)}   BABIP ${f3(A.babip)}`);
console.log(`HR/game ${A.hrPerGame.toFixed(2)}   2B/game ${A.doublesPerGame.toFixed(2)}   3B/game ${A.triplesPerGame.toFixed(2)}   GIDP/game ${A.gidpPerGame.toFixed(2)}   HBP% ${pct(A.hbpPct)}   PA/game ${A.paPerGame.toFixed(1)}   pitches/game ${A.pitchesPerGame.toFixed(0)}   innings/game ${A.inningsPerGame.toFixed(2)}`);
console.log(`SF/game ${A.sfPerGame.toFixed(2)}   SH/game ${A.shPerGame.toFixed(2)}   IBB/game ${A.ibbPerGame.toFixed(2)}   SB/game ${A.sbPerGame.toFixed(2)}   CS/game ${A.csPerGame.toFixed(2)}   SB% ${pct(A.sbPct)}   SB3/game ${A.sb3PerGame.toFixed(2)}   CS3/game ${A.cs3PerGame.toFixed(2)}   WP/game ${A.wpPerGame.toFixed(2)}   PB/game ${A.pbPerGame.toFixed(2)}   BK/game ${A.bkPerGame.toFixed(3)}   PO/game ${A.poPerGame.toFixed(2)}   ROE/game ${A.roePerGame.toFixed(2)}   H/game ${A.hitsPerGame.toFixed(2)}`);
console.log(`pitches/PA ${A.pitchesPerPa.toFixed(2)}   zone ${pct(A.zonePct)}   swing ${pct(A.swingPct)}   zone swing ${pct(A.zoneSwingPct)}   chase ${pct(A.chasePct)}   whiff ${pct(A.whiffPct)}   zone contact ${pct(A.zoneContactPct)}   chase contact ${pct(A.chaseContactPct)}`);
const ipPerStart = hook.outs / 3 / (hook.starts || 1);
console.log(`IP/start ${ipPerStart.toFixed(2)}   pitches/start ${(hook.pitches / (hook.starts || 1)).toFixed(1)}   pitching changes/game ${(hook.changes / (boxes.length || 1)).toFixed(2)}   coach's own pick when asked about a change: change ${pct(hook.coachChange / (hook.asked || 1))}`);
/* ---------- the league stays close to real baseball ---------- */
const show = (x, digits, percent) => percent ? pct(x) : digits === 3 ? f3(x) : x.toFixed(digits);
if (GAMES >= RATE_SAMPLE_MIN) {
  for (const [key, label, ref, tol, digits, percent] of REFERENCE) if (!(Math.abs(A[key] - ref) <= tol)) fail('league', `${label} is ${show(A[key], digits, percent)}, reference ${show(ref, digits, percent)} (tolerance ${show(tol, digits, percent)})`);
  if (!(Math.abs(ipPerStart - IP_PER_START) <= IP_PER_START_TOL)) fail('league', `IP/start is ${ipPerStart.toFixed(2)}, reference ${IP_PER_START} (tolerance ${IP_PER_START_TOL})`);
  console.log(`rates within tolerance of the reference league on ${REFERENCE.length + 1} measures`);
} else console.log(`rates not checked against the reference league: fewer than ${RATE_SAMPLE_MIN} games`);
console.log(`outs ${totalOuts}: ` + Object.entries(outReasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
console.log('plate appearances: ' + Object.entries(results).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
if (failures.length) { console.error(`\nFAILED: ${failures.length} problem(s)`); for (const f of failures) console.error('  ' + f); process.exit(1); }
console.log(`\nOK: every out has a legal reason, every half inning has 3 outs, batting orders hold, scores match, all ${GAMES} games terminate and replay identically.`);
