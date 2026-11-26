/* The 放養 numbers of the 我的球員 training screen (#429): days a hands-off and an active created player take to reach the
 * 一軍 median, taken from league/tools/train_sim.mjs (#369), never typed in. Writes league/site/train_days.json.
 *
 *   node league/tools/train_days.mjs           print
 *   node league/tools/train_days.mjs --write   write league/site/train_days.json
 *
 * Shape: { seed, players, horizon, target (一軍 median overall), hands | active: { share (of players who reach it within
 * the horizon), p25, median, p75 (days, among those who reach it) } }. Deterministic; rerun it whenever train_sim's model changes. */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { simulate, PLAYERS, SIM_SEED, HORIZON } from './train_sim.mjs';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../site/train_days.json');
const rank = (sorted, q) => sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)];
export function table() {
  const { t, res } = simulate();
  const row = list => { const ok = list.filter(x => x !== Infinity).sort((a, b) => a - b);
    return { share: Math.round(1000 * ok.length / list.length) / 1000, p25: rank(ok, 0.25), median: rank(ok, 0.5), p75: rank(ok, 0.75) }; };
  return { seed: SIM_SEED, players: PLAYERS, horizon: HORIZON, target: t.median, hands: row(res.hands[0]), active: row(res.active[0]) };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = JSON.stringify(table(), null, 1) + '\n';
  if (process.argv.includes('--write')) { writeFileSync(OUT, text); console.log('wrote league/site/train_days.json'); } else process.stdout.write(text);
}
