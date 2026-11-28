/* 試跑 season panel check (#743 part 1, plain Node). Fails when
 *   - two runs of `season_run.mjs --site` (same seed, start date, commit) differ by a byte, or the file's scores differ
 *     from runSeason() (the engine plays every game, rule 10),
 *   - seasonAt() on a hand-made two-night file gives other standings, day, pairings or last-night scores than worked by hand,
 *     or shows tonight's score before the night is over,
 *   - the 首頁 does not show 賽季尚未開始 when the file is missing, or misses day N / pairings / standings when it exists.
 * Usage: node tests/season_site.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = p => import(pathToFileURL(path.join(ROOT, p)));
const { siteFile, seasonAt, dayIndex } = await imp('league/season_site.js');
const { runSeason, siteSerialize } = await imp('league/tools/season_run.mjs');
const { combine } = await imp('ui/site/shared.js');
const { view } = await imp('ui/site/home.js');
const problems = [], bad = s => problems.push(s), eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) bad(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };

/* determinism: the tool twice, byte for byte, and equal to the in-process run */
const args = [path.join(ROOT, 'league/tools/season_run.mjs'), '--site', '--start', '2026-11-28', '--seed', '3', '--commit', 'abc'];
const out1 = execFileSync(process.execPath, args, { encoding: 'utf8' }), out2 = execFileSync(process.execPath, args, { encoding: 'utf8' });
if (out1 !== out2) bad('season_run --site: two runs differ');
const run = runSeason(3), file = siteFile(run, { start: '2026-11-28', commit: 'abc', version: JSON.parse(out1).engine.version });
if (siteSerialize(file) !== out1) bad('season_run --site output differs from siteFile(runSeason(3))');
eq(file.nights.flatMap(n => n.games.map(g => g.score)), run.log.map(x => [x.awayRuns, x.homeRuns]), 'file scores = engine scores');
eq(file.nights.length, run.log.reduce((m, x) => Math.max(m, x.day), 0) + 1, 'one entry per night');

/* hand-made file: A,B,C,D, two nights + nothing else */
const hand = { trial: true, seed: 0, start: '2026-12-01', engine: { commit: 'x', version: 'y' }, champion: 'A', nights: [
  { day: 0, phase: 'season', games: [{ home: 'A', away: 'B', starters: ['b1', 'a1'], score: [2, 5] }, { home: 'C', away: 'D', starters: ['d1', 'c1'], score: [4, 1] }] },
  { day: 1, phase: 'season', games: [{ home: 'B', away: 'C', starters: ['c2', 'b2'], score: [3, 0] }, { home: 'D', away: 'A', starters: ['a2', 'd2'], score: [6, 2] }] },
] };
eq(dayIndex('2026-12-01', '2026-12-03'), 2, 'dayIndex across days');
eq(dayIndex('2026-12-01', 'nope'), null, 'dayIndex bad date');
const d1 = seasonAt(hand, '2026-12-02');   /* night 1 tonight, night 0 is last night */
eq([d1.state, d1.day, d1.total], ['on', 1, 2], 'day 2 of 2');
eq(d1.tonight, [{ home: 'B', away: 'C', starters: ['c2', 'b2'] }, { home: 'D', away: 'A', starters: ['a2', 'd2'] }], 'tonight: pairings + starters, no score');
eq(d1.last.map(g => g.score), [[2, 5], [4, 1]], 'last night scores');
/* score is [away, home]. By hand after night 0: A beat B 5-2, D beat C 4-1. A and D 1-0, no head-to-head, run diff +3 each:
 * table order (first seen: B, A, D, C) puts A before D; B and C 0-1, -3 each: B before C. */
eq(d1.standings, [{ id: 'A', w: 1, l: 0, rf: 5, ra: 2 }, { id: 'D', w: 1, l: 0, rf: 4, ra: 1 }, { id: 'B', w: 0, l: 1, rf: 2, ra: 5 }, { id: 'C', w: 0, l: 1, rf: 1, ra: 4 }], 'standings after night 1');
const over = seasonAt(hand, '2026-12-05');  /* night 1: C won at B 3-0, A won at D 6-2. A 2-0 (11-4); D and C 1-1, D beat C head to head; B 0-2 */
eq([over.state, over.champion, over.tonight], ['over', 'A', []], 'season over');
eq(over.standings.map(t => `${t.id} ${t.w}-${t.l} ${t.rf}-${t.ra}`), ['A 2-0 11-4', 'D 1-1 6-7', 'C 1-1 4-4', 'B 0-2 2-8'], 'final standings');
const before = seasonAt(hand, '2026-11-30');
eq([before.state, before.tonight, before.last, before.standings.every(t => t.w + t.l === 0)], ['before', [], [], true], 'before the start');
eq(seasonAt(null, '2026-12-02'), null, 'missing file');
eq(seasonAt({ ...hand, trial: false }, '2026-12-02'), null, 'not a trial file');

/* the 首頁 */
const teams = { season: '0', teams: ['A', 'B', 'C', 'D'].map(id => ({ id, name: id + '隊' })) };
const none = view({ ...combine({ teams }), today: '2026-12-02' });
if (!none.includes('賽季尚未開始') || !none.includes('試跑')) bad('home: no season file shows 賽季尚未開始 under 試跑');
const page = view({ ...combine({ teams, trial: hand }), today: '2026-12-02' });
for (const want of ['第 2 天，共 2 天', 'C隊 <span class="at">對</span> B隊', '先發 c2・b2', '昨晚', '>2 : 5<', '試跑・非正式'])
  if (!page.includes(want)) bad(`home with a season file: missing ${want}`);
if (page.includes('>3 : 0<')) bad('home: tonight\'s score must stay hidden');
const real = view({ ...combine({ teams, trial: file }), today: '2026-11-28' });
if (!real.includes('第 1 天') || real.includes('昨晚')) bad('home on opening day: day 1, no last night');

if (problems.length) { console.error('season_site check FAILED:\n  ' + problems.join('\n  ')); process.exit(1); }
console.log('season_site check ok');
