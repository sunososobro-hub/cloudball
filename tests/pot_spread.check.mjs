/* Spread of the hidden potential (#794 part 4, league/tools/pot_spread.mjs). Runs the tool on a small sample and fails when
 *   - two runs differ (determinism),
 *   - deciles are out of order, or an overall ends above the potential's top decile + 1,
 *   - more training (later season, active fan) gives a lower median than less,
 *   - the lowest decile of a fully grown even build (6 seasons, hands-off) is under the weakest 一軍 quartile
 *     (owner 2026-11-28: the bottom must not be hopeless), the grown p90 - p10 is wider than POT_BAND + 1 (#794 part 6),
 *     or the top decile does not pass the 一軍 median (stars reachable),
 *   - `--lineup` (part 8): a low-tier player has a higher potential than the mid-tier one of the same build and team, a grown
 *     engine player differs from the creation in anything but the ability keys / age / avg, a run is not seeded, or a
 *     pure build is missing.
 * Usage: node tests/pot_spread.check.mjs */
import { simulate, SEASONS_AT } from '../league/tools/pot_spread.mjs';
import { POT_BAND, CREATE, makePlayer } from '../league/freeagents.js';
import { lineupValues, grownEngine, LINEUP_TIERS } from '../league/tools/pot_spread.mjs';
import { buildChoice } from '../league/tools/season_sim.mjs';
import { KEYS } from '../league/training.js';

const N = 80, problems = [], bad = m => problems.push(m);
const a = simulate(N), b = simulate(N);
if (JSON.stringify(a.out) !== JSON.stringify(b.out)) bad('two runs differ');
const last = SEASONS_AT.length - 1;
for (const [kind, o] of Object.entries(a.out)) {
  for (const [mode, rows] of Object.entries(o.rows)) rows.forEach((r, j) => {
    const tag = `${kind} ${mode} season ${SEASONS_AT[j]}`;
    if (!(r.p10 <= r.med && r.med <= r.p90)) bad(`${tag}: deciles out of order ${r.p10}/${r.med}/${r.p90}`);
    if (r.p90 > o.pot.p90 + 1) bad(`${tag}: top decile ${r.p90} above the potential's ${o.pot.p90}`);
    if (j && r.med < rows[j - 1].med) bad(`${tag}: median fell with more training`);
    if (mode === 'active' && r.med < o.rows.hands[j].med) bad(`${tag}: active median under hands-off`);
  });
  const grown = o.rows.hands[last];
  if (grown.p10 < a.t.bottom) bad(`${kind}: lowest decile grown ${grown.p10} under the 一軍 bottom quartile ${a.t.bottom}`);
  if (grown.p90 - grown.p10 > POT_BAND + 1) bad(`${kind}: grown p90 - p10 ${grown.p90 - grown.p10} wider than POT_BAND ${POT_BAND} + 1`);
  if (grown.p90 <= a.t.median) bad(`${kind}: top decile grown ${grown.p90} does not pass the 一軍 median ${a.t.median}`);
}
const lv = () => lineupValues({ games: 1, draws: 9, seasons: 1 }), l1 = lv();
if (JSON.stringify(lv()) !== JSON.stringify(l1)) bad('--lineup: two runs differ');
if (JSON.stringify(Object.keys(l1)) !== JSON.stringify(Object.keys(LINEUP_TIERS))) bad('--lineup: tiers missing');
const builds = CREATE.kinds.flatMap(k => CREATE.keys[k].map(m => `${k}:${m}`));
if (JSON.stringify(Object.keys(l1.low)) !== JSON.stringify(builds)) bad(`--lineup: builds ${Object.keys(l1.low)} != ${builds}`);
for (const k of builds) l1.low[k].pot.forEach((p, t) => { if (p > l1.mid[k].pot[t]) bad(`--lineup ${k} team ${t}: low potential ${p} above mid ${l1.mid[k].pot[t]}`); });
for (const kind of CREATE.kinds) {
  const made = makePlayer(794, buildChoice(kind, CREATE.keys[kind][0])), g = grownEngine(made, 0).player, keep = new Set([...KEYS[kind], 'age', 'avg']);
  for (const f of Object.keys(made.player)) if (!keep.has(f) && JSON.stringify(g[f]) !== JSON.stringify(made.player[f])) bad(`grownEngine ${kind}: field ${f} changed`);
  for (const k of KEYS[kind]) if (Math.abs(g[k] - made.player[k]) > 0.02) bad(`grownEngine ${kind}: day 0 ${k} ${g[k]} != creation ${made.player[k]}`);
}
if (problems.length) { console.error(problems.map(p => '  ' + p).join('\n')); console.error(`pot_spread.check: ${problems.length} problem(s)`); process.exit(1); }
console.log(`pot_spread.check ok (${N} per kind, deterministic, deciles ordered, bottom decile >= 一軍 bottom quartile ${a.t.bottom})`);
