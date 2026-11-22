/* abilities.mjs: redraws the factory abilities of league/players.js (#169). Hand-run, never at game time.
 *   node league/tools/abilities.mjs            prints the draw (distribution before/after, stars, holes, win rates)
 *   node league/tools/abilities.mjs --write    also rewrites the ability fields of ../players.js
 * What it does, deterministically (ABILITY_SEED, then the first seed after it whose teams come out balanced):
 *   1. every rating gets a right-skewed, long-tailed draw (standardised lognormal): most players a little under
 *      the mean, a few clearly above it; potential the same;
 *   2. per team one star of its own kind (STARS), two or three good players (GOOD), one obvious hole (HOLES);
 *   3. each rating is rescaled so the quantity the engine uses keeps its league value (mean con, spd, arm, ctrl,
 *      mean pow^2 for home runs, mean 1/eye for chasing, mean 1/stuff for contact): league rates stay put;
 *   4. players who carry a bio keep the same best rating (bios.js tags[0]); body build follows pow and spd;
 *   5. Monte Carlo over all pairings: every team must win between WIN_MIN and WIN_MAX of its games.
 * Names, numbers, ids, positions, ages, hands and heights are never touched. The demonstration game keeps its
 * own frozen copy (../preseason/rosters-opening.js). */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url)), FILE = path.join(HERE, '../players.js');
const { ROSTERS } = await import(pathToFileURL(FILE));
const { TEAMS } = await import(pathToFileURL(path.join(HERE, '../teams.js')));
const { BIOS } = await import(pathToFileURL(path.join(HERE, '../bios.js')));
const { simGame } = await import(pathToFileURL(path.join(HERE, '../../engine/index.js')));
const { ratingScale } = await import(pathToFileURL(path.join(HERE, '../ratings.js')));

export const ABILITY_SEED = 169;
const SEED_TRIES = 400;
const SKEW = 0.6;                 /* lognormal sigma: skewness about 2.3, long right tail */
const SPREAD = 1.25;              /* new standard deviation relative to today's */
const STAR_Z = 3.3, STAR_SECOND_Z = 2.2, REST_CAP_Z = 1.8, GOOD_Z = 1.7, HOLE_Z = -2.3, HOLE_JITTER = 0.5;
/* the 1 to 100 display (../ratings.js) must read: every star first on his team and at least STAR_OVR, every hole under HOLE_OVR */
const STAR_OVR = 90, HOLE_OVR = 45, LEAGUE_OVR = [60, 65];
const WIN_MIN = 0.45, WIN_MAX = 0.55, MC_SEARCH = 200, MC_FINAL = 600;
const BAT = ['con', 'pow', 'eye', 'spd', 'arm'], PIT = ['stuff', 'ctrl', 'arm'];
/* the engine's use of each rating: the league value of this function stays the same after the redraw */
const USE = { con: x => x, pow: x => x * x, eye: x => 1 / x, spd: x => x, arm: x => x, stuff: x => 1 / x, ctrl: x => x, pot: x => x };
/* one star per team, each of a different kind: [slot, main rating, second rating, rating he is short of] */
const STARS = {
  pheasants: { kind: '王牌先發', slot: 'p4', main: 'stuff', second: 'ctrl' },
  owls: { kind: '重砲', slot: 'b4', main: 'pow', second: 'eye', short: 'spd' },
  macaques: { kind: '安打機器', slot: 'b2', main: 'con', second: 'eye', short: 'pow' },
  muntjacs: { kind: '飛毛腿', slot: 'b2', main: 'spd', second: 'con', short: 'pow' },
};
const GOOD = { pheasants: ['b2', 'b4', 'b1'], owls: ['b2', 'p3'], macaques: ['b4', 'p1', 'b5'], muntjacs: ['b4', 'p2'] };
const HOLES = { pheasants: 'b9', owls: 'b9', macaques: 'b9', muntjacs: 'b9' };

const mulberry32 = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const LN_MEAN = Math.exp(SKEW * SKEW / 2), LN_SD = Math.sqrt((Math.exp(SKEW * SKEW) - 1) * Math.exp(SKEW * SKEW));
const skewed = rng => { const n = Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng()); return (Math.exp(SKEW * n) - LN_MEAN) / LN_SD; };
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
const r3 = x => Math.round(x * 1000) / 1000, r2 = x => Math.round(x * 100) / 100, clamp01 = x => Math.max(0, Math.min(1, x));
const slotOf = p => p.id.split('-')[1];
const groups = R => ({ bat: R.flatMap(t => t.bat), pit: R.flatMap(t => t.pit) });
const keysOf = g => (g === 'bat' ? [...BAT, 'pot'] : [...PIT, 'pot']);
const bestOf = (p, keys) => keys.reduce((a, b) => (p[b] > p[a] ? b : a));

/* today's league value and spread of every rating, per group */
const OLD = groups(ROSTERS), TARGET = {};
for (const g of ['bat', 'pit']) for (const k of keysOf(g)) TARGET[g + k] = { use: mean(OLD[g].map(p => USE[k](p[k]))), sd: sd(OLD[g].map(p => p[k])) };
/* the display avg placeholder follows contact the way it does today (least squares over today's batters) */
const AVG = (() => { const m = mean(OLD.bat.map(p => p.con)), a = mean(OLD.bat.map(p => p.avg)); let xy = 0, xx = 0; for (const p of OLD.bat) { xy += (p.con - m) * (p.avg - a); xx += (p.con - m) ** 2; } return { m, a, b: xy / xx }; })();

function rescale(R) {
  const G = groups(R);
  for (const g of ['bat', 'pit']) for (const k of keysOf(g)) {
    const want = TARGET[g + k].use, f = c => mean(G[g].map(p => USE[k](p[k] * c)));
    let lo = 0.5, hi = 2; for (let i = 0; i < 60; i++) { const c = (lo + hi) / 2; ((f(c) < want) === (USE[k](2) > USE[k](1))) ? lo = c : hi = c; }
    const c = (lo + hi) / 2; for (const p of G[g]) p[k] *= c;
  }
}
/* a bio says what a player is best at: keep that rating his best by swapping it with the one that overtook it */
function keepBioBest(R) {
  for (const t of R) for (const [g, keys] of [['bat', BAT], ['pit', PIT]]) for (const p of t[g]) {
    const bio = BIOS[p.id]; if (!bio) continue;
    const old = bestOf(OLD_BY_ID.get(p.id), keys);
    for (let now = bestOf(p, keys), n = 0; now !== old && n < keys.length; now = bestOf(p, keys), n++) {
    /* swap in units of each rating's spread, so a wide rating never lands raw in a narrow one */
    const S = k => TARGET[g + k].sd, zo = (p[old] - 1) / S(old), zn = (p[now] - 1) / S(now);
    p[old] = 1 + zn * S(old); p[now] = 1 + zo * S(now);
    if (p[old] <= p[now]) [p[old], p[now]] = [p[now], p[old]];
    }
  }
}
const OLD_BY_ID = new Map([...OLD.bat, ...OLD.pit].map(p => [p.id, p]));

export function draw(seed) {
  const rng = mulberry32(seed), R = ROSTERS.map(t => ({ bat: t.bat.map(p => ({ ...p })), pit: t.pit.map(p => ({ ...p })) }));
  for (const g of ['bat', 'pit']) for (const p of groups(R)[g]) for (const k of keysOf(g)) p[k] = 1 + TARGET[g + k].sd * SPREAD * skewed(rng);
  /* the long tail belongs to the named players: everyone else stays under REST_CAP_Z */
  R.forEach((t, i) => {
    const id = TEAMS[i].id, named = new Set([STARS[id].slot, ...GOOD[id]]);
    for (const p of [...t.bat, ...t.pit]) if (!named.has(slotOf(p))) for (const k of keysOf(p.pos ? 'bat' : 'pit')) if (k !== 'pot')
      p[k] = Math.min(p[k], 1 + REST_CAP_Z * TARGET[(p.pos ? 'bat' : 'pit') + k].sd * SPREAD);
  });
  R.forEach((t, i) => {
    const id = TEAMS[i].id, find = s => [...t.bat, ...t.pit].find(p => slotOf(p) === s), z = (p, k, n) => { p[k] = Math.max(p[k], 1 + n * TARGET[(p.pos ? 'bat' : 'pit') + k].sd * SPREAD); };
    const S = STARS[id], star = find(S.slot);
    for (const k of (star.pos ? BAT : PIT)) z(star, k, 0);
    z(star, S.main, STAR_Z); z(star, S.second, STAR_SECOND_Z);
    if (S.short) star[S.short] = Math.min(star[S.short], 1 - 0.5 * TARGET['bat' + S.short].sd * SPREAD);
    for (const s of GOOD[id]) { const p = find(s), bio = BIOS[p.id], keys = p.pos ? BAT : PIT; z(p, bio ? bestOf(OLD_BY_ID.get(p.id), keys) : bestOf(p, keys), GOOD_Z); }
    const hole = find(HOLES[id]); for (const k of BAT) hole[k] = Math.min(hole[k], 1);
    for (const k of ['con', 'pow']) hole[k] = Math.min(hole[k], 1 + (HOLE_Z - HOLE_JITTER * rng()) * TARGET['bat' + k].sd * SPREAD);
  });
  for (let i = 0; i < 6; i++) { rescale(R); keepBioBest(R); }
  for (const p of groups(R).bat) {
    p.avg = r3(AVG.a + AVG.b * (p.con - AVG.m));
    const pw = p.pow - 1, sp = p.spd - 1;
    p.body = { slim: r2(clamp01((sp - 0.04) / 0.1 - pw / 0.2)), power: r2(clamp01((pw - 0.02) / 0.2)), heavy: r2(clamp01((pw - 0.1) / 0.15 - sp / 0.1)) };
  }
  for (const p of groups(R).pit) { const st = p.stuff - 1; p.body = { slim: 0, power: r2(clamp01((st - 0.01) / 0.08)), heavy: 0 }; }
  for (const g of ['bat', 'pit']) for (const p of groups(R)[g]) for (const k of keysOf(g)) p[k] = r3(p[k]);
  return R;
}

export function ratingsCheck(R) {
  const rate = ratingScale(R), all = [], out = [];
  R.forEach((t, i) => {
    const id = TEAMS[i].id, ps = [...t.bat, ...t.pit].map(p => ({ p, r: rate(p) })), star = ps.find(x => slotOf(x.p) === STARS[id].slot), hole = ps.find(x => slotOf(x.p) === HOLES[id]);
    all.push(...ps.map(x => x.r.ovr));
    if (star.r.ovr < STAR_OVR || ps.some(x => x !== star && x.r.ovr >= star.r.ovr)) out.push(`${id}: star ${star.r.ovr} is not first or under ${STAR_OVR}`);
    if (hole.r.ovr >= HOLE_OVR) out.push(`${id}: hole ${hole.r.ovr}`);
  });
  const m = mean(all); if (m < LEAGUE_OVR[0] || m > LEAGUE_OVR[1]) out.push(`league overall ${m.toFixed(1)}`);
  return out;
}

export function winRates(R, games) {
  const w = TEAMS.map(() => 0), n = TEAMS.map(() => 0);
  let s = 1;
  for (let a = 0; a < TEAMS.length; a++) for (let h = 0; h < TEAMS.length; h++) if (a !== h)
    for (let i = 0; i < games; i++) { const f = simGame(s++, {}, { rosters: R, teams: [a, h] }).final.sc; n[a]++; n[h]++; w[f[0] > f[1] ? a : h]++; }
  return w.map((x, i) => x / n[i]);
}

const stats = a => { const m = mean(a), s = sd(a), skew = mean(a.map(x => ((x - m) / s) ** 3)), kurt = mean(a.map(x => ((x - m) / s) ** 4)) - 3;
  return { min: Math.min(...a), max: Math.max(...a), in1: a.filter(x => Math.abs(x - m) <= s).length / a.length, out2: a.filter(x => x - m > 2 * s).length, under: a.filter(x => x < m).length / a.length, skew, kurt }; };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let seed = ABILITY_SEED, R = null, wr = null;
  for (; seed < ABILITY_SEED + SEED_TRIES; seed++) {
    R = draw(seed); if (ratingsCheck(R).length) continue;
    wr = winRates(R, MC_SEARCH);
    if (wr.every(x => x > WIN_MIN + 0.025 && x < WIN_MAX - 0.025)) break;
  }
  wr = winRates(R, MC_FINAL);
  console.log(`seed ${seed}${seed === ABILITY_SEED + SEED_TRIES ? ' (no balanced seed found!)' : ''}`);
  const NEW = groups(R), f = x => x.toFixed(2);
  console.log('rating   | before: min max in1sd >2sd skew kurt | after: min max in1sd >2sd under-mean skew kurt');
  for (const g of ['bat', 'pit']) for (const k of keysOf(g)) {
    const a = stats(OLD[g].map(p => p[k])), b = stats(NEW[g].map(p => p[k]));
    console.log(`${g} ${k.padEnd(5)} | ${f(a.min)} ${f(a.max)} ${(a.in1 * 100).toFixed(0)}% ${a.out2} ${f(a.skew)} ${f(a.kurt)} | ${f(b.min)} ${f(b.max)} ${(b.in1 * 100).toFixed(0)}% ${b.out2} ${(b.under * 100).toFixed(0)}% ${f(b.skew)} ${f(b.kurt)}`);
  }
  R.forEach((t, i) => {
    const id = TEAMS[i].id, find = s => [...t.bat, ...t.pit].find(p => slotOf(p) === s), S = STARS[id], st = find(S.slot), ho = find(HOLES[id]);
    console.log(`${id}: win ${(wr[i] * 100).toFixed(1)}%  star ${st.name} (${S.kind}, ${S.main} ${st[S.main]})  good ${GOOD[id].map(s => find(s).name).join(' ')}  hole ${ho.name} (con ${ho.con} pow ${ho.pow})`);
  });
  const before = ratingScale(ROSTERS), after = ratingScale(R);
  console.log('overall 1..100, before -> after (batters in lineup order, then pitchers):');
  R.forEach((t, i) => console.log(`${TEAMS[i].id}: ` + [...t.bat, ...t.pit].map(p => `${p.name} ${before(OLD_BY_ID.get(p.id)).ovr}->${after(p).ovr}`).join(', ')));
  const avgOvr = (rate, ps) => mean(ps.map(p => rate(p).ovr)).toFixed(1);
  console.log(`league overall mean ${avgOvr(before, [...OLD.bat, ...OLD.pit])} -> ${avgOvr(after, [...NEW.bat, ...NEW.pit])}`);
  const bad = wr.filter(x => x < WIN_MIN || x > WIN_MAX).length;
  if (bad) { console.error(`${bad} team(s) outside ${WIN_MIN * 100}..${WIN_MAX * 100}%`); process.exit(1); }
  if (process.argv.includes('--write')) {
    let src = readFileSync(FILE, 'utf8');
    const fields = ['con', 'pow', 'eye', 'spd', 'arm', 'stuff', 'ctrl', 'pot', 'avg'];
    for (const p of [...NEW.bat, ...NEW.pit]) {
      const re = new RegExp(`^(.*id: "${p.id}".*)$`, 'm'), m = src.match(re); if (!m) throw new Error(`${p.id} not found`);
      let line = m[1];
      for (const k of fields) if (k in p) line = line.replace(new RegExp(`\\b${k}: [0-9.]+`), `${k}: ${p[k]}`);
      line = line.replace(/body: \{[^}]*\}/, `body: {slim: ${p.body.slim}, power: ${p.body.power}, heavy: ${p.body.heavy}}`);
      src = src.replace(m[1], line);
    }
    writeFileSync(FILE, src); console.log('wrote league/players.js');
  }
}
