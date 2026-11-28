/* Spread of the hidden potential (#794 part 4, league/tools/pot_spread.mjs). Runs the tool on a small sample and fails when
 *   - two runs differ (determinism),
 *   - deciles are out of order, or an overall ends above the potential's top decile + 1,
 *   - more training (later season, active fan) gives a lower median than less,
 *   - the lowest decile of a fully grown even build (6 seasons, hands-off) is under the weakest 一軍 quartile
 *     (owner 2026-11-28: the bottom must not be hopeless), the grown p90 - p10 is wider than POT_BAND + 1 (#794 part 6),
 *     or the top decile does not pass the 一軍 median (stars reachable).
 * Usage: node tests/pot_spread.check.mjs */
import { simulate, SEASONS_AT } from '../league/tools/pot_spread.mjs';
import { POT_BAND } from '../league/freeagents.js';

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
if (problems.length) { console.error(problems.map(p => '  ' + p).join('\n')); console.error(`pot_spread.check: ${problems.length} problem(s)`); process.exit(1); }
console.log(`pot_spread.check ok (${N} per kind, deterministic, deciles ordered, bottom decile >= 一軍 bottom quartile ${a.t.bottom})`);
