/* 二軍 daily text report (league/minors_report.js, #586). Fails when
 *   - the same id + day gives a different line in two calls, or lines never change from day to day (determinism),
 *   - a line breaks its own arithmetic (H > AB, HR > H, RBI < HR, K > outs, ER > H + BB, negatives),
 *   - over 30 days the batters of league/site/players.json (stand-in for the 二軍 until it is filled) bat outside
 *     BAT_BAND, or the top quarter by overall does not average more than the bottom quarter,
 *   - the 我的球員 page of a tier-2 player does not show 7 report days, or a tier-3 player gets one,
 *   - league/minors_report.js uses Math.random or Date,
 *   - (#600 part 3) a report day whose team played a 二軍 game of league/site/farm_games.json (report day N = night N - 1) has no
 *     play.html?f=<id> link to that game, a day without one has a link, or a record of another team links.
 * static.mjs runs this file (every tests/*.check.mjs). Usage: node tests/minors_report.check.mjs */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { minorsLine, minorsDays, REPORT_DAYS } from '../league/minors_report.js';
import { myPlayerView, combine } from '../ui/site-data.js';
import { farmGameOn } from '../league/farm.js';

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
/* #600 part 3/5: replay links from the real farm file (season_run --farm, seed 1): every team plays exactly one 二軍 game a night,
 * so each night of the file links once per team and the report day after the last night stays plain text */
const farm = JSON.parse(readFileSync(path.join(ROOT, 'league/site/farm_games.json'), 'utf8'));
const links = (team, day) => { const h = myPlayerView({ ...combine({ farm }), players: { m: { ...players['pheasants-b1'], tier: 2, team } }, day }, 'm');
  return [...h.matchAll(/<li>第 (\d+) 天[^<]*(?:<a class="farm-replay" href="play\.html\?f=([^"]+)">看重播<\/a>)?<\/li>/g)].map(m => `${m[1]}:${m[2] || ''}`).join(); };
for (const [team, idx] of [['pheasants', 0], ['owls', 1], ['macaques', 2], ['muntjacs', 3]]) {
  const want = Array.from({ length: REPORT_DAYS }, (_, i) => REPORT_DAYS - i).map(d => `${d}:${(farmGameOn(farm, idx, d - 1) || {}).id || ''}`).join();
  const got = links(team, REPORT_DAYS);
  if (got !== want) fail(`replay links for ${team}: got ${got}, want ${want}`);
}
const nights = [...new Set(farm.map(r => r.day))], lastNight = Math.max(...nights);
for (const n of nights) for (const team of [0, 1, 2, 3]) {
  const n2 = farm.filter(r => r.day === n && r.teams.includes(team)).length;
  if (n2 !== 1) fail(`team ${team} has ${n2} 二軍 records on night ${n} (want exactly 1)`);
}
if (!links('owls', REPORT_DAYS).includes(`1:${farmGameOn(farm, 1, 0).id}`)) fail('owls must link day 1 to its night-0 game');
if (lastNight + 2 <= REPORT_DAYS && links('owls', REPORT_DAYS).includes(`${lastNight + 2}:f-`)) fail('the day after the last recorded night must stay plain text');
if (links('owls', 30).includes('f-')) fail('days with no recorded game must stay plain text');
if (farmGameOn(farm, 1, lastNight + 1) || farmGameOn(farm, -1, 0) || farmGameOn([{ ...farm[0], tier: 1 }], 0, 0)) fail('farmGameOn: no game that night, no team or a non-二軍 record must give null');
const src = readFileSync(path.join(ROOT, 'league/minors_report.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
if (/Math\.random|Date\b/.test(src)) fail('league/minors_report.js uses Math.random or Date');
if (minorsDays('x', all[0][1], 3).length !== 3) fail('minorsDays must stop at day 1');
if (bad.length) { console.error(bad.slice(0, 10).join('\n')); process.exit(1); }
console.log(`minors_report ok: batting average ${ba.toFixed(3)} (band ${BAT_BAND.join('-')}), top quarter ${hi.toFixed(3)} vs bottom ${lo.toFixed(3)} over ${DAYS} days, ${bats.length} batters`);
