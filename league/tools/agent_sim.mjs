/* What each 經紀人 frequency does (#795 part 3). Hand-run, seeded, engine only, no network, prints only.
 *
 *   node league/tools/agent_sim.mjs [--games N] [--kind bat|pit]
 *
 * Every game gets the same pairing as the engine checks (teams [s % 4, (s + 1) % 4], seeds 1..N). The agent set goes on
 * every player of teams[0] only (its batters and bench for kind 'bat', its staff for 'pit'); the other side plays the
 * factory game. A whole team carries the set so the effect is above the noise; one fan player is about 1/9 of a lineup
 * (or one pitcher of a staff), so his own share of the run value is far smaller.
 *
 * Rows printed per kind:
 *   1. each frequency alone at every level in the 'normal' row (inherited by every situation), the others neutral:
 *      runs per game of the set's team (scored for 'bat', allowed for 'pit'), the change against neutral with its
 *      standard error, and the rates the trade-off moves (bat: SB, CS, sac bunts, K, BB; pit: 直球 share, K, BB,
 *      throw-overs, steal tries against, balks). Levels above neutral alone cost more than the pool: they are shown for
 *      the effect, the trades below are what a fan can really set.
 *   2. legal trades: one frequency up by d, another down by d, in the 'normal' row (pool spent exactly).
 * Verdict: a legal set "dominates" when it is better for its team than neutral by more than DOMINANT_RUNS runs per game
 * AND by more than DOMINANT_SE standard errors. Prints `no setting dominates` or the sets that do. Never tunes on its own:
 * a person reads the report and changes the AGENT_* constants in engine/constants.js. */
import { fileURLToPath } from 'node:url';
import { simGame, ROSTERS } from '../../engine/index.js';
import * as K from '../../engine/constants.js';
import * as A from '../agentset.js';

export const GAMES = 2000;
export const DOMINANT_RUNS = 0.15;   /* runs per game for a whole team wearing the set (~0.017 per lineup slot) */
export const DOMINANT_SE = 2;
export const TRADE_STEPS = [1, 2];   /* d: up by d on one frequency, down by d on another */

const FB = K.PITCH_TYPES[0][0];

const playersOf = (team, kind) => kind === 'bat' ? [...ROSTERS[team].bat, ...(ROSTERS[team].bench || [])] : ROSTERS[team].pit;
export const agentsFor = (team, kind, row) => {
  if (!row) return undefined;
  return Object.fromEntries(playersOf(team, kind).map(p => [p.name, { v: A.AGENT_SET_VERSION, kind, rows: { [A.NORMAL]: row } }]));
};

/* legal trades of a kind: { label, row }, one frequency up by d, another down by d, pool spent exactly */
export function trades(kind) {
  const out = [], freqs = A.FREQS[kind];
  for (const d of TRADE_STEPS) for (const up of freqs) for (const down of freqs) {
    if (up === down) continue;
    const row = { [up]: A.LEVEL_NEUTRAL + d, [down]: A.LEVEL_NEUTRAL - d };
    if (!A.validateSet({ v: A.AGENT_SET_VERSION, kind, rows: { [A.NORMAL]: row } }).length) out.push({ label: `${up} ${row[up]} / ${down} ${row[down]}`, row });
  }
  return out;
}

/* one config: totals over the games for the set's team (side 0 of opts.teams) */
export function measure(kind, row, games = GAMES) {
  const runs = [], t = { sbTry: 0, sbOk: 0, sh: 0, k: 0, bb: 0, pitches: 0, fb: 0, po: 0, bk: 0 };
  for (let s = 1; s <= games; s++) {
    const teams = [s % 4, (s + 1) % 4];
    const g = simGame(s, {}, { teams, agents: agentsFor(teams[0], kind, row) });
    const end = g.stream.find(e => e.type === 'game_end');
    runs.push(kind === 'bat' ? end.score[0] : end.score[1]);
    const off = kind === 'bat' ? 0 : 1;   /* the batting side whose PAs we count */
    for (const e of g.stream) {
      if (e.type !== 'pa_end' || e.team !== off) continue;
      if (e.result === 'strikeout') t.k++;
      else if (e.result === 'walk') t.bb++;
      else if (e.result === 'sac_bunt') t.sh++;
    }
    /* engine pitch frames: bat[0] = the batting side; e.sbGo = a steal on this pitch, out if the frame records outs */
    for (const e of g.ev) {
      if (e.k !== 'P' || e.bat[0] !== off) continue;
      if (e.r === 'po' || e.r === 'pof') { t.po++; continue; }
      if (e.r === 'bk') { t.bk++; continue; }
      if (e.r === 'ibb') continue;
      t.pitches++; if (e.pt === FB) t.fb++;
      if (e.sbGo) { t.sbTry++; if (!(e.outs || []).length) t.sbOk++; }
    }
  }
  const n = runs.length, mean = runs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(runs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  return { mean, se: sd / Math.sqrt(n), ...t };
}

const f2 = x => x.toFixed(2), f3 = x => x.toFixed(3), sg = x => (x >= 0 ? '+' : '') + f3(x);

function line(kind, label, m, base, games) {
  const perG = x => f2(x / games);
  const d = m.mean - base.mean, se = Math.sqrt(m.se ** 2 + base.se ** 2);
  const better = kind === 'bat' ? d : -d;   /* runs scored up = good for a batter set; runs allowed down = good for a pitcher set */
  const rates = kind === 'bat'
    ? `SB ${perG(m.sbOk)} CS ${perG(m.sbTry - m.sbOk)} SH ${perG(m.sh)} K ${perG(m.k)} BB ${perG(m.bb)}`
    : `FB ${f3(m.fb / Math.max(1, m.pitches))} K ${perG(m.k)} BB ${perG(m.bb)} PO ${perG(m.po)} SBtry ${perG(m.sbTry)} BK ${perG(m.bk)}`;
  console.log(`  ${label.padEnd(26)} R/G ${f3(m.mean)} (${sg(d)} +-${f3(se)})  ${rates}`);
  return { label, better, se };
}

function main() {
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const games = Number(arg('--games', GAMES));
const kinds = arg('--kind', null) ? [arg('--kind')] : A.KINDS;
const dominant = [];
for (const kind of kinds) {
  const freqs = A.FREQS[kind];
  console.log(`\n${kind === 'bat' ? 'batter' : 'pitcher'} sets on every ${kind === 'bat' ? 'batter' : 'pitcher'} of teams[0], ${games} games; R/G = runs ${kind === 'bat' ? 'scored' : 'allowed'}`);
  const base = measure(kind, null, games);
  line(kind, 'neutral', base, { mean: base.mean, se: 0 }, games);
  console.log(' single frequency (levels above 2 alone are over the pool):');
  for (const f of freqs) for (let lv = A.LEVEL_MIN; lv <= A.LEVEL_MAX; lv++) {
    if (lv === A.LEVEL_NEUTRAL) continue;
    const r = line(kind, `${f} ${lv}`, measure(kind, { [f]: lv }, games), base, games);
    if (lv < A.LEVEL_NEUTRAL && r.better > DOMINANT_RUNS && r.better > DOMINANT_SE * r.se) dominant.push(`${kind} ${r.label}`);
  }
  console.log(' legal trades (one up, one down, pool spent exactly):');
  for (const { label, row } of trades(kind)) {
    const r = line(kind, label, measure(kind, row, games), base, games);
    if (r.better > DOMINANT_RUNS && r.better > DOMINANT_SE * r.se) dominant.push(`${kind} ${r.label}`);
  }
}
console.log(dominant.length
  ? `\nDOMINANT (better than neutral by > ${DOMINANT_RUNS} R/G and > ${DOMINANT_SE} SE): ${dominant.join('; ')}`
  : `\nno setting dominates (no legal set beats neutral by > ${DOMINANT_RUNS} R/G and > ${DOMINANT_SE} SE)`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
