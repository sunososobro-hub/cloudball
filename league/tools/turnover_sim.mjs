/* Turnover simulation of #565: runs the league through SEASONS seasons (train a season, age a year, league/turnover.js seasonEnd)
 * from league/site/players.json and prints one row per season, then the steady-state band. Display model only (rule 10).
 *   node league/tools/turnover_sim.mjs [--seasons 30] [--seed 565] [--cull 1] [--out snapshot.json] [--json]
 * Per season: retired, culled, rookies in, 一軍 average age, 一軍 median overall, share of 一軍 aged 30+, call-up queue length,
 * 自由市場 count. Career = whole seasons a player spent in the 一軍 (players already there at the start are not counted).
 * --out writes the league after the last season (players.json format) so a later step can commit it as the day-1 snapshot. */
import { readFileSync, writeFileSync } from 'node:fs';
import { mulberry32 } from '../../engine/rng.js';
import { trainDay, defaultSplit, overallOf, KEYS, DAYS_PER_SEASON } from '../training.js';
import { advanceYear, seasonEnd, CULL_PER_POS } from '../turnover.js';
import { FIRST_TIER } from '../callup.js';

export const BAND_FROM = 5;                     /* seasons before this are the run-in; the band is read from here on */
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const hash = t => { let h = 2166136261; for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619); return h >>> 0; };
const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const median = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };

/* one season of daily training for everybody still in a team or on the market (the default split, hands-off) */
export function trainSeason(players, season, seed) {
  const out = structuredClone(players);
  for (const [id, p] of Object.entries(out)) {
    const pit = p.role === 'P', keys = KEYS[pit ? 'pit' : 'bat'];
    const abil = Object.fromEntries(keys.map(k => [k, p.abilities[k]]));
    const s = { pit, age0: p.age, day: 0, pot: p.abilities.pot, split: defaultSplit(pit ? 'pit' : 'bat', p.pos), abil };
    const r = mulberry32(hash(`${seed}/${id}/${season}`));
    for (let d = 0; d < DAYS_PER_SEASON; d++) trainDay(s, r, 0);
    for (const k of keys) p.abilities[k] = Math.round(s.abil[k]);
    p.overall = overallOf({ ...s, abil: Object.fromEntries(keys.map(k => [k, p.abilities[k]])) });
  }
  return out;
}

export function simulate(start, { seasons = 30, seed = 565, cullPerPos = CULL_PER_POS } = {}) {
  let players = structuredClone(start);
  const since = {}, careers = [], rows = [];
  for (const [id, p] of Object.entries(players)) if (p.tier === FIRST_TIER) since[id] = null;     /* tenure unknown at the start */
  for (let y = 1; y <= seasons; y++) {
    const r = seasonEnd(advanceYear(trainSeason(players, y, seed)), { seed: hash(`${seed}/${y}`), cullPerPos });
    for (const id of [...r.retired, ...r.culled]) if (id in since) { if (since[id] !== null) careers.push({ season: y, years: y - since[id] }); delete since[id]; }
    for (const c of r.called) since[c.id] = y;
    players = r.players;
    const first = Object.values(players).filter(p => p.tier === FIRST_TIER), ovr = first.map(p => p.overall);
    rows.push({ season: y, retired: r.retired.length, culled: r.culled.length, rookies: r.rookies.length, called: r.called.length,
      avgAge: +mean(first.map(p => p.age)).toFixed(2), medOvr: median(ovr), over30: +(first.filter(p => p.age >= 30).length / (first.length || 1)).toFixed(3),
      queue: r.waiting.length, free: Object.values(players).filter(p => p.tier === 3).length, starters: first.length });
  }
  const run = rows.filter(r => r.season >= BAND_FROM), tail = careers.filter(c => c.season >= BAND_FROM);
  const band = k => [Math.min(...run.map(r => r[k])), Math.max(...run.map(r => r[k]))];
  return { rows, players, band: { avgAge: band('avgAge'), medOvr: band('medOvr'), over30: band('over30') },
    career: { n: tail.length, mean: +mean(tail.map(c => c.years)).toFixed(2) } };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const start = JSON.parse(readFileSync(new URL('../site/players.json', import.meta.url), 'utf8'));
  const res = simulate(start, { seasons: +arg('seasons', 30), seed: +arg('seed', 565), cullPerPos: +arg('cull', CULL_PER_POS) });
  if (process.argv.includes('--json')) console.log(JSON.stringify({ rows: res.rows, band: res.band, career: res.career }));
  else {
    console.log('season retired culled rookies called  avgAge medOvr over30 queue free starters');
    for (const r of res.rows) console.log([r.season, r.retired, r.culled, r.rookies, r.called, r.avgAge, r.medOvr, r.over30, r.queue, r.free, r.starters].map(x => String(x).padStart(7)).join(' '));
    console.log(`band from season ${BAND_FROM}: avgAge ${res.band.avgAge.join('..')}  medOvr ${res.band.medOvr.join('..')}  over30 ${res.band.over30.join('..')}`);
    console.log(`一軍 career (left after season ${BAND_FROM}, entered in the sim): n=${res.career.n} mean=${res.career.mean} seasons`);
  }
  if (arg('out', '')) writeFileSync(arg('out', ''), JSON.stringify(res.players, null, 1) + '\n');
}
