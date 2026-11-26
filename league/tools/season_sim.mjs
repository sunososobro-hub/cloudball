/* How created players really perform (#437). Hand-run, seeded, engine only, no network, prints only.
 *
 *   node league/tools/season_sim.mjs [--fans fans.json] [--seasons N]
 *
 * League: 4 teams x 18 一軍 (the factory players of league/players.js, never changed) plus an engine-only 二軍 per team of
 * SLOTS_BAT created batters and SLOTS_PIT created pitchers, made by league/freeagents.js makePlayer with the real creation
 * rules and league/namepool.js names (unique inside a team, the engine looks players up by name). The 二軍 slots are
 * filled by real fan players first (a choice object each, read from the json file given with --fans, default none; the
 * what-if rows below use FAN_COUNTS generated fan-like choices instead) and the rest by 系統 players (`system: true`).
 * A fan player takes the place of a 系統 player of the same kind, never a 一軍 player.
 *
 * Fan choices are a random legal spread of the whole budget (like league/tools/train_sim.mjs). A 系統 player is the
 * even spread, each ability within SYSTEM_JITTER of budget / keys, so he is a plain filler, not a clever build.
 *
 * Season = the format of #165: 6 pairings x 2 games (one home, one away) = 12 games, then a best-of-three final of the top
 * two (wins, then run difference, then lower team index). SEASONS seeded seasons, each with a fresh 二軍.
 *
 * Who plays in the 一軍 (a rule of this tool, not of the game; promotion does not exist in the product yet): before a
 * season, per team and per kind, the best PROMOTE_MAX 二軍 players whose display overall (league/ratings.js) is at least
 * PROMOTE_MARGIN above the weakest 一軍 player of the slot they would take replace him: a batter takes the lineup spot
 * and fielding position of the man he replaces (positionFit is display only), a starter takes the weakest rotation slot,
 * any other role the weakest reliever slot. Created players do not train here (league/tools/train_sim.mjs does that).
 *
 * Then an audition so every created player has a line that is not picked by the promotion: each created player alone
 * replaces the weakest 一軍 player of his slot for AUDITION_GAMES games against the other teams in turn. Created batters
 * are grouped by the ability they spent most on (a tie = "even"), created pitchers by role; each group is compared with
 * the median of the 一軍 players of that kind, played by the same baseline games.
 *
 * Prints: runs per game; the created batting line (AVG, OBP, SLG, HR per 600 PA) and pitching line (RA9 = runs allowed per
 * 9, the engine counts no earned runs so it is not an ERA; K9, BB9) per group against the 一軍 median; the share of created
 * players who get any 一軍 plate appearance or batter faced, and how it changes with 5, 20 and 60 real fan players, for
 * fan players and for 系統 players apart. Results are reported, never tuned to a target (rule 10: nothing here changes a
 * result or an ability of an existing record). */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { simGame, boxFromStream, aggregate, ROSTERS } from '../../engine/index.js';
import { CREATE, makePlayer, validateCreate } from '../freeagents.js';
import { ratingsOf } from '../ratings.js';

export const SEASONS = 20, SEASON_SEED = 437, FAN_COUNTS = [5, 20, 60];
export const SLOTS_BAT = 9, SLOTS_PIT = 9;          /* 二軍 slots per team and kind */
export const SYSTEM_JITTER = 3;                      /* display points a 系統 ability may sit from the even spread */
export const PROMOTE_MAX = 2, PROMOTE_MARGIN = 0;    /* per team and kind; display overall points above the weakest */
export const AUDITION_GAMES = 6;
export const AUDIT_FANS = 20;                        /* the fan count the audition and the line tables use */
export const FINAL_BEST_OF = 3, MIN_PA = 100, MIN_BF = 100;
export const POSITION = 'pos';

export const rng = seed => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const mix = (...n) => n.reduce((h, x) => Math.imul(h ^ (x >>> 0), 0x9e3779b1) >>> 0, 0x811c9dc5);
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN; };
const rate = (a, b) => (b ? a / b : NaN);

/* integer parts that sum to total, each in [lo, hi], spread at random (as train_sim.mjs) */
function spread(r, keys, total, lo, hi) {
  const out = Object.fromEntries(keys.map(k => [k, lo])); let left = total - lo * keys.length;
  while (left > 0) { const k = keys[Math.floor(r() * keys.length)]; if (out[k] < hi) { out[k]++; left--; } }
  return out;
}
/* a choice of a fan (random legal spread) or of the system (even spread within SYSTEM_JITTER) */
export function choiceOf(r, kind, i, system) {
  const keys = CREATE.keys[kind], budget = CREATE.budget[kind], cap = CREATE.cap[kind];
  let points;
  if (!system) points = spread(r, keys, budget, CREATE.floor, cap);
  else {
    const mid = budget / keys.length;
    points = Object.fromEntries(keys.map(k => [k, Math.round(mid)]));
    for (let n = 0; n < keys.length * 4; n++) {              /* swap points between two abilities, sum kept */
      const a = keys[Math.floor(r() * keys.length)], b = keys[Math.floor(r() * keys.length)];
      if (a !== b && points[a] + 1 <= Math.round(mid) + SYSTEM_JITTER && points[b] - 1 >= Math.round(mid) - SYSTEM_JITTER) { points[a]++; points[b]--; }
    }
    const diff = budget - keys.reduce((s, k) => s + points[k], 0);   /* rounding of the even spread */
    points[keys[0]] += diff;
  }
  const look = { head: 0, skin: 0, hair: 0 };
  return kind === 'bat' ? { kind, pos: CREATE.positions[i % CREATE.positions.length], bats: r() < 0.3 ? 'L' : 'R', build: 'normal', look, points }
    : { kind, role: CREATE.roles[i % CREATE.roles.length], throws: r() < 0.25 ? 'L' : 'R', build: 'normal', look, points };
}

/* The 二軍 of one team: fan choices first (per kind), then 系統 players. Names are unique in the team. */
export function farmOf(season, team, fans) {
  const taken = new Set([...ROSTERS[team].bat, ...ROSTERS[team].pit].map(p => p.name)), out = [];
  const r = rng(mix(SEASON_SEED, season, team, 1));
  for (const kind of CREATE.kinds) {
    const slots = kind === 'bat' ? SLOTS_BAT : SLOTS_PIT, mine = fans[kind] || [];
    for (let i = 0; i < slots; i++) {
      const isFan = i < mine.length, c = isFan ? mine[i] : choiceOf(r, kind, i, true), seed = mix(SEASON_SEED, season, team, kind === 'bat' ? 2 : 3, i);
      let made;
      for (let n = 0; ; n++) { made = makePlayer(seed, { ...c, nameDraw: n }); if (!taken.has(made.player.name)) break; }
      taken.add(made.player.name);
      out.push({ player: { ...made.player, ...(isFan ? {} : { system: true }) }, ratings: made.ratings, kind, fan: isFan, team, season });
    }
  }
  return out;
}

/* fans per team and kind for a league-wide fan count: spread round-robin, half batters and half pitchers */
export function fansFor(season, count, given) {
  const r = rng(mix(SEASON_SEED, season, 9)), per = TEAMS_N.map(() => ({ bat: [], pit: [] }));
  const list = [...given];
  for (let i = list.length; i < count; i++) list.push(choiceOf(r, i % 2 ? 'pit' : 'bat', i, false));
  list.slice(0, count).forEach((c, i) => { const t = per[i % TEAMS_N.length], k = t[c.kind]; if (k.length < (c.kind === 'bat' ? SLOTS_BAT : SLOTS_PIT)) k.push(c); });
  return per;
}
const TEAMS_N = [0, 1, 2, 3];

/* Rosters after promotion: returns { rosters, promoted: Set of created players }. */
export function promote(farm) {
  const rosters = ROSTERS.map(t => ({ bat: [...t.bat], pit: [...t.pit] })), went = new Set();
  for (const team of TEAMS_N) {
    const mine = farm.filter(f => f.team === team);
    const batters = mine.filter(f => f.kind === 'bat').sort((a, b) => b.ratings.ovr - a.ratings.ovr);
    for (const f of batters.slice(0, PROMOTE_MAX)) {
      const weakest = rosters[team].bat.map((p, i) => [ratingsOf(p).ovr, i]).filter(([, i]) => !rosters[team].bat[i].promoted).sort((a, b) => a[0] - b[0])[0];
      if (!weakest || f.ratings.ovr < weakest[0] + PROMOTE_MARGIN) continue;
      rosters[team].bat[weakest[1]] = { ...f.player, [POSITION]: rosters[team].bat[weakest[1]].pos, promoted: true }; went.add(f);
    }
    for (const kind of ['SP', 'RP']) {
      const pitchers = mine.filter(f => f.kind === 'pit' && (f.player.role === 'SP') === (kind === 'SP')).sort((a, b) => b.ratings.ovr - a.ratings.ovr);
      for (const f of pitchers.slice(0, PROMOTE_MAX)) {
        const weakest = rosters[team].pit.map((p, i) => [ratingsOf(p).ovr, i]).filter(([, i]) => (rosters[team].pit[i].role === 'SP') === (kind === 'SP') && !rosters[team].pit[i].promoted).sort((a, b) => a[0] - b[0])[0];
        if (!weakest || f.ratings.ovr < weakest[0] + PROMOTE_MARGIN) continue;
        rosters[team].pit[weakest[1]] = { ...f.player, promoted: true }; went.add(f);
      }
    }
  }
  return { rosters, went };
}

/* one game -> { box, pit: {team: {name: {outs, r, bb, k, bf}}} } */
function play(seed, rosters, teams, opts = {}) {
  const g = simGame(seed, {}, { rosters, teams, ...opts });
  const box = boxFromStream(g.stream), pit = [{}, {}];
  g.pst.forEach((arr, k) => arr.forEach((s, i) => { if (s.bf) pit[k][g.staff[k][i].name] = s; }));
  return { g, box, pit };
}
const addTo = (acc, key, src) => { const a = acc.get(key) || {}; for (const k in src) a[k] = (a[k] || 0) + src[k]; acc.set(key, a); };

/* Plays one #165 season; adds every player's lines to bat / pit (maps keyed team|name) and returns the league boxes. */
export function playSeason(season, rosters, bat, pit) {
  const boxes = [], wins = [0, 0, 0, 0], diff = [0, 0, 0, 0], take = (res, teams) => {
    boxes.push(res.box);
    teams.forEach((t, k) => { for (const [n, s] of Object.entries(res.box.players[k])) addTo(bat, `${t}|${n}`, s); for (const [n, s] of Object.entries(res.pit[k])) addTo(pit, `${t}|${n}`, s); });
    const [a, b] = res.box.score; diff[teams[0]] += a - b; diff[teams[1]] -= a - b;
    if (a !== b) wins[a > b ? teams[0] : teams[1]]++;
    return a > b ? teams[0] : teams[1];
  };
  let g = 0;
  for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) for (const teams of [[a, b], [b, a]]) take(play(mix(SEASON_SEED, season, g++), rosters, teams), teams);
  const order = [0, 1, 2, 3].sort((x, y) => wins[y] - wins[x] || diff[y] - diff[x] || x - y), [a, b] = order, fw = { [a]: 0, [b]: 0 };
  for (let n = 0; fw[a] < 2 && fw[b] < 2 && n < FINAL_BEST_OF; n++) { const teams = n % 2 ? [b, a] : [a, b]; fw[take(play(mix(SEASON_SEED, season, g++), rosters, teams), teams)]++; }
  return boxes;
}

const batLine = s => { const ab = s.ab || 0, pa = s.pa || 0, den = ab + (s.bb || 0) + (s.hbp || 0) + (s.sf || 0);
  return { pa, avg: rate(s.h || 0, ab), obp: rate((s.h || 0) + (s.bb || 0) + (s.hbp || 0), den), slg: rate(s.tb || 0, ab), hr600: pa ? 600 * (s.hr || 0) / pa : NaN }; };
const pitLine = s => ({ bf: s.bf || 0, ra9: rate(27 * (s.r || 0), s.outs || 0), k9: rate(27 * (s.k || 0), s.outs || 0), bb9: rate(27 * (s.bb || 0), s.outs || 0) });
const sum = (rows, keys) => Object.fromEntries(keys.map(k => [k, rows.reduce((t, r) => t + (r[k] || 0), 0)]));
const BATK = ['pa', 'ab', 'h', 'tb', 'hr', 'bb', 'hbp', 'sf'], PITK = ['bf', 'outs', 'r', 'k', 'bb'];
const f3 = x => (Number.isFinite(x) ? x.toFixed(3) : '  n/a');
const f2 = x => (Number.isFinite(x) ? x.toFixed(2) : ' n/a');
const pct = x => (Number.isFinite(x) ? (100 * x).toFixed(0) + '%' : 'n/a');
const dominant = p => { const e = Object.entries(p.points).sort((a, b) => b[1] - a[1]); return e[0][1] === e[1][1] ? 'even' : e[0][0]; };

/* the pool of what a fan sees: made once per season and fan count */
function league(season, fanCount, given) {
  const fans = fansFor(season, fanCount, given);
  return TEAMS_N.flatMap(t => farmOf(season, t, fans[t]));
}

export function run({ seasons = SEASONS, given = [], log = console.log } = {}) {
  /* A: promotion seasons for each fan count (and baseline with nobody promoted) */
  const rows = [];
  const base = { bat: new Map(), pit: new Map(), boxes: [] };
  for (let s = 0; s < seasons; s++) base.boxes.push(...playSeason(s, ROSTERS, base.bat, base.pit));
  rows.push({ label: '一軍 only', boxes: base.boxes, fans: 0, system: 0 });
  const promo = {};
  for (const fc of [0, ...FAN_COUNTS]) {
    const bat = new Map(), pit = new Map(), boxes = [], stat = { fan: [0, 0], system: [0, 0] };
    for (let s = 0; s < seasons; s++) {
      const farm = league(s, fc, given), { rosters } = promote(farm);
      boxes.push(...playSeason(s, rosters, bat, pit));
      for (const f of farm) {
        const key = `${f.team}|${f.player.name}`, got = f.kind === 'bat' ? (bat.get(key) || {}).pa : (pit.get(key) || {}).bf, who = f.fan ? 'fan' : 'system';
        stat[who][1]++; if (got > 0) stat[who][0]++;
      }
    }
    promo[fc] = stat; rows.push({ label: `fans ${fc}`, boxes, ...stat });
  }
  log(`seasons ${seasons}, seed ${SEASON_SEED}, 二軍 ${SLOTS_BAT} bat + ${SLOTS_PIT} pit per team, promote up to ${PROMOTE_MAX} per team and kind (margin ${PROMOTE_MARGIN})`);
  log('\nruns per game (both teams)');
  for (const r of rows) log(`  ${r.label.padEnd(10)} ${f2(aggregate(r.boxes).runsPerGame)}   games ${r.boxes.length}`);
  log('\nshare of created players with any 一軍 plate appearance or batter faced, by fan count (promotion rule above)');
  for (const fc of [0, ...FAN_COUNTS]) {
    const { fan, system } = promo[fc], all = [fan[0] + system[0], fan[1] + system[1]];
    log(`  ${String(fc).padStart(2)} real fans: all ${pct(rate(...all))} (${all[0]}/${all[1]})   fans ${fan[1] ? pct(rate(...fan)) + ` (${fan[0]}/${fan[1]})` : 'none'}   系統 ${pct(rate(...system))} (${system[0]}/${system[1]})`);
  }

  /* B: audition, every created player of the AUDIT_FANS league alone in the slot of the weakest 一軍 player */
  const aBat = new Map(), aPit = new Map(), groups = new Map(), key = (f, g) => `${f.team}|${f.player.name}|${g}`;
  for (let s = 0; s < seasons; s++) {
    for (const f of league(s, AUDIT_FANS, given)) {
      const roster = ROSTERS.map(t => ({ bat: [...t.bat], pit: [...t.pit] })), t = f.team;
      let slot, opts = {};
      if (f.kind === 'bat') { slot = roster[t].bat.map((p, i) => [ratingsOf(p).ovr, i]).sort((a, b) => a[0] - b[0])[0][1]; roster[t].bat[slot] = { ...f.player, [POSITION]: roster[t].bat[slot].pos }; }
      else {
        const sp = f.player.role === 'SP', ix = roster[t].pit.map((p, i) => [ratingsOf(p).ovr, i]).filter(([, i]) => (roster[t].pit[i].role === 'SP') === sp).sort((a, b) => a[0] - b[0])[0][1];
        roster[t].pit[ix] = f.player; if (sp) opts.slot = ix;
      }
      groups.set(`${t}|${f.player.name}|${s}`, f.kind === 'bat' ? dominant({ points: pointsOf(f) }) : f.player.role);
      for (let n = 0; n < AUDITION_GAMES; n++) {
        const opp = (t + 1 + n) % 4, home = n % 2 === 0, teams = home ? [t, opp] : [opp, t], k = home ? 0 : 1;
        const o = { ...(opts.slot !== undefined ? { starters: [0, 0].map((_, j) => (j === k ? opts.slot : 0)) } : {}) };
        const res = play(mix(SEASON_SEED, s, 99, t, n, f.kind === 'bat' ? 1 : 2, f.player.num), roster, teams, o);
        const pl = res.box.players[k][f.player.name], ps = res.pit[k][f.player.name];
        if (pl) addTo(aBat, key(f, s), pl); if (ps) addTo(aPit, key(f, s), ps);
      }
    }
  }
  const byGroup = new Map();
  for (const [k, v] of [...aBat, ...aPit]) { const g = groups.get(k); if (!g) continue; const a = byGroup.get(g) || []; a.push(v); byGroup.set(g, a); }
  const medBat = (() => { const l = [...base.bat.values()].filter(s => s.pa >= MIN_PA).map(batLine); return { avg: median(l.map(x => x.avg)), obp: median(l.map(x => x.obp)), slg: median(l.map(x => x.slg)), hr600: median(l.map(x => x.hr600)), n: l.length }; })();
  const medPit = role => { const names = new Set(ROSTERS.flatMap((t, ti) => t.pit.filter(p => (p.role === 'SP') === (role === 'SP')).map(p => `${ti}|${p.name}`))); const l = [...base.pit].filter(([k, s]) => names.has(k) && s.bf >= MIN_BF).map(([, s]) => pitLine(s)); return { ra9: median(l.map(x => x.ra9)), k9: median(l.map(x => x.k9)), bb9: median(l.map(x => x.bb9)), n: l.length }; };
  log(`\ncreated batters (audition: ${AUDITION_GAMES} games each, ${AUDIT_FANS} fans in the pool; groups = the ability he spent most on)`);
  log('  group      players     PA   AVG    OBP    SLG   HR/600');
  log(`  一軍 median (${medBat.n} batters with >= ${MIN_PA} PA over the baseline seasons)   ${f3(medBat.avg)}  ${f3(medBat.obp)}  ${f3(medBat.slg)}  ${f2(medBat.hr600)}`);
  const batGroups = [...CREATE.keys.bat, 'even'];
  for (const g of batGroups) {
    const l = byGroup.get(g) || [], t = sum(l, BATK), b = batLine(t);
    log(`  ${g.padEnd(9)} ${String(l.length).padStart(7)} ${String(t.pa).padStart(6)}  ${f3(b.avg)}  ${f3(b.obp)}  ${f3(b.slg)}  ${f2(b.hr600)}`);
  }
  log('\ncreated pitchers (RA9 = runs allowed per 9, not earned runs)');
  log('  role     players    BF   RA9    K9    BB9');
  for (const role of CREATE.roles) {
    const m = medPit(role === 'SP' ? 'SP' : 'RP'), l = byGroup.get(role) || [], t = sum(l, PITK), p = pitLine(t);
    log(`  ${role.padEnd(6)} ${String(l.length).padStart(8)} ${String(t.bf).padStart(6)}  ${f2(p.ra9)}  ${f2(p.k9)}  ${f2(p.bb9)}    一軍 ${role === 'SP' ? 'SP' : 'RP'} median (${m.n}): ${f2(m.ra9)}  ${f2(m.k9)}  ${f2(m.bb9)}`);
  }
  const share = { bat: [0, 0], pit: [0, 0] };
  for (const [k] of groups) { const kind = batGroups.includes(groups.get(k)) ? 'bat' : 'pit'; share[kind][1]++; if ((kind === 'bat' ? aBat : aPit).has(k)) share[kind][0]++; }
  log(`\naudition: ${share.bat[0]}/${share.bat[1]} batters and ${share.pit[0]}/${share.pit[1]} pitchers got a plate appearance or faced a batter`);
  return { promo, medBat };
}
/* the points a created player was made with, read back from his display ratings (makePlayer keeps no points on the player) */
function pointsOf(f) { const r = f.ratings; return f.kind === 'bat' ? { con: r.con, pow: r.pow, eye: r.eye, spd: r.spd, arm: r.arm } : { stuff: r.stuff, ctrl: r.ctrl, arm: r.arm }; }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), opt = n => (a.includes(n) ? a[a.indexOf(n) + 1] : undefined);
  const given = opt('--fans') ? JSON.parse(readFileSync(opt('--fans'), 'utf8')) : [];
  for (const [i, c] of given.entries()) { const why = validateCreate(c); if (why.length) throw new Error(`fan choice ${i}: ${why.join('; ')}`); }
  run({ seasons: Number(opt('--seasons') || SEASONS), given });
}
