/* 二軍 daily text report (league/minors_report.js, #586). Fails when
 *   - the same id + day gives a different line in two calls, or lines never change from day to day (determinism),
 *   - a line breaks its own arithmetic (H > AB, HR > H, RBI < HR, K > outs, ER > H + BB, negatives),
 *   - over 30 days the batters of league/site/players.json (stand-in for the 二軍 until it is filled) bat outside
 *     BAT_BAND, or the top quarter by overall does not average more than the bottom quarter,
 *   - the 我的球員 page of a tier-2 player does not show 7 report days, or a tier-3 player gets one,
 *   - league/minors_report.js uses Math.random or Date.
 * static.mjs runs this file (every tests/*.check.mjs). Usage: node tests/minors_report.check.mjs */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { minorsLine, minorsDays, REPORT_DAYS } from '../league/minors_report.js';
import { myPlayerView } from '../ui/site-data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BAT_BAND = [0.23, 0.29], DAYS = 30;
const bad = [], fail = m => bad.push(m);
const players = JSON.parse(readFileSync(path.join(ROOT, 'league/site/players.json'), 'utf8'));
const all = Object.entries(players);
let diffDay = 0;
for (const [id, p] of all) {
  for (let d = 1; d <= DAYS; d++) {
    const a = minorsLine(id, p, d), b = minorsLine(id, p, d), s = a.stat;
    if (JSON.stringify(a) !== JSON.stringify(b)) fail(`not deterministic: ${id} day ${d}`);
    if (a.kind === 'bat' && (s.h > s.ab || s.hr > s.h || s.rbi < s.hr || [s.ab, s.h, s.hr, s.rbi, s.bb, s.k].some(v => !(v >= 0)) || s.k > s.ab - s.h)) fail(`bad batter line ${id} day ${d}: ${a.text}`);
    if (a.kind === 'pit' && (s.k > s.outs || s.er > s.h + s.bb || [s.outs, s.h, s.er, s.bb, s.k].some(v => !(v >= 0)))) fail(`bad pitcher line ${id} day ${d}: ${a.text}`);
    if (d > 1 && minorsLine(id, p, d - 1).text !== a.text) diffDay++;
  }
}
if (!diffDay) fail('lines never change from one day to the next');
const bats = all.filter(([, p]) => p.role !== 'P').map(([id, p]) => {
  let h = 0, ab = 0; for (let d = 1; d <= DAYS; d++) { const s = minorsLine(id, p, d).stat; h += s.h; ab += s.ab; }
  return { ovr: p.overall, h, ab };
}).sort((x, y) => x.ovr - y.ovr);
const avg = l => l.reduce((s, x) => s + x.h, 0) / l.reduce((s, x) => s + x.ab, 0), q = bats.length >> 2;
const ba = avg(bats), lo = avg(bats.slice(0, q)), hi = avg(bats.slice(-q));
if (!(ba >= BAT_BAND[0] && ba <= BAT_BAND[1])) fail(`league batting average ${ba.toFixed(3)} outside ${BAT_BAND}`);
if (!(hi > lo)) fail(`top quarter ${hi.toFixed(3)} does not beat bottom quarter ${lo.toFixed(3)}`);
const d2 = { teams: [], players: { m2: { ...players['pheasants-b1'], tier: 2 }, m3: { ...players['pheasants-b1'], tier: 3, team: null } }, games: [], season: '' };
const v2 = myPlayerView(d2, 'm2'), v3 = myPlayerView(d2, 'm3');
if ((v2.match(/<li>第 /g) || []).length !== REPORT_DAYS) fail('tier-2 player page must show 7 report days');
if (v3.includes('二軍日報')) fail('tier-3 player page must not show the report');
const src = readFileSync(path.join(ROOT, 'league/minors_report.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
if (/Math\.random|Date\b/.test(src)) fail('league/minors_report.js uses Math.random or Date');
if (minorsDays('x', all[0][1], 3).length !== 3) fail('minorsDays must stop at day 1');
if (bad.length) { console.error(bad.slice(0, 10).join('\n')); process.exit(1); }
console.log(`minors_report ok: batting average ${ba.toFixed(3)} (band ${BAT_BAND.join('-')}), top quarter ${hi.toFixed(3)} vs bottom ${lo.toFixed(3)} over ${DAYS} days, ${bats.length} batters`);
