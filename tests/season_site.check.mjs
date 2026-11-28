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
const { siteFile, seasonAt, dayIndex, healthAt, STALE_DAYS } = await imp('league/season_site.js');
const { runSeason, runSeasons, siteSerialize, PLAYERS_IN, MIN_SITE_DAYS } = await imp('league/tools/season_run.mjs');
const { readFileSync } = await import('node:fs');
const { combine } = await imp('ui/site/shared.js');
const { view } = await imp('ui/site/home.js');
const problems = [], bad = s => problems.push(s), eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) bad(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };

/* determinism: the tool twice, byte for byte, and equal to the in-process run */
const args = [path.join(ROOT, 'league/tools/season_run.mjs'), '--site', '--start', '2026-11-28', '--seed', '3', '--commit', 'abc'];
const out1 = execFileSync(process.execPath, args, { encoding: 'utf8' }), out2 = execFileSync(process.execPath, args, { encoding: 'utf8' });
if (out1 !== out2) bad('season_run --site: two runs differ');
const runs = runSeasons(3, { players: JSON.parse(readFileSync(PLAYERS_IN, 'utf8')) }), file = siteFile(runs, { start: '2026-11-28', commit: 'abc', version: JSON.parse(out1).engine.version });
if (siteSerialize(file) !== out1) bad('season_run --site output differs from siteFile(runSeasons(3))');
eq(file.nights.flatMap(n => n.games.map(g => g.score)), runs.flatMap(r => r.log.map(x => [x.awayRuns, x.homeRuns])), 'file scores = engine scores, all seasons');
eq(file.nights.map(n => n.day), file.nights.map((_, i) => i), 'nights count on without a gap across seasons');
if (file.nights.length < MIN_SITE_DAYS) bad(`default file covers ${file.nights.length} nights, want >= ${MIN_SITE_DAYS}`);
eq(file.seasons.map(x => x.nights).reduce((a, b) => a + b, 0), file.nights.length, 'seasons add up to the nights');
eq(file.seasons.map(x => !!x.turnover), file.seasons.map((_, i) => i < file.seasons.length - 1), 'turnover between seasons, none after the last');
eq(JSON.stringify(file.seasons[0].champion), JSON.stringify(runSeason(3).champion), 'season 1 = the single-season run of the same seed');
const two = JSON.parse(execFileSync(process.execPath, [...args, '--seasons', '2'], { encoding: 'utf8' }));
eq([two.seasons.length, two.nights.length, two.nights[two.seasons[0].nights].season, two.nights[two.seasons[0].nights].day], [2, two.seasons[0].nights + two.seasons[1].nights, 2, two.seasons[0].nights], '--seasons 2: season 2 opens the night after the final');
if (file.champion !== file.seasons[file.seasons.length - 1].champion) bad('file champion is the last season\'s');
if (file.nights.length > 200 || Buffer.byteLength(out1) > 60000) bad(`file too large for Pages: ${Buffer.byteLength(out1)} bytes`);

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

/* two seasons by hand (#749): A,B,C,D; season 1 = nights 0-1 (night 1 is its final), season 2 = nights 2-3 */
const g2 = (h, a, sc) => ({ home: h, away: a, starters: ['x', 'y'], score: sc });
const hand2 = { trial: true, seed: 0, start: '2026-12-01', engine: { commit: 'x', version: 'y' }, champion: 'C', nights: [
  { season: 1, day: 0, phase: 'season', games: [g2('A', 'B', [2, 5]), g2('C', 'D', [4, 1])] },
  { season: 1, day: 1, phase: 'final', games: [g2('A', 'D', [0, 1])] },
  { season: 2, day: 2, phase: 'season', games: [g2('B', 'A', [3, 1]), g2('D', 'C', [0, 2])] },
  { season: 2, day: 3, phase: 'final', games: [g2('B', 'C', [1, 0])] },
] };
const lastOne = seasonAt(hand2, '2026-12-02');   /* night 1 = the last night of season 1's schedule: tonight is its final */
eq([lastOne.season, lastOne.seasonDay, lastOne.seasonTotal, lastOne.phase, lastOne.lastSeason], [1, 1, 2, 'final', 1], 'last night of season 1');
eq(lastOne.standings.map(t => `${t.id} ${t.w}-${t.l} ${t.rf}-${t.ra}`), ['A 1-0 5-2', 'D 1-0 4-1', 'B 0-1 2-5', 'C 0-1 1-4'], 'standings of season 1 after night 0')
const openNo2 = seasonAt(hand2, '2026-12-03');   /* first night of season 2: standings from zero, last night is season 1's final with its score */
eq([openNo2.season, openNo2.seasonDay, openNo2.seasonTotal, openNo2.lastSeason, openNo2.phase], [2, 0, 2, 1, 'season'], 'first night of season 2');
eq(openNo2.standings.every(t => t.w + t.l === 0 && t.rf === 0), true, 'season 2 standings start from zero');
eq(openNo2.last.map(g => [g.score, g.phase]), [[[0, 1], 'final']], 'last night = season 1 final, score shown');
eq(openNo2.tonight.map(g => g.score), [undefined, undefined], 'season 2 opening night: no score');
const mid2 = seasonAt(hand2, '2026-12-04');
eq(mid2.standings.map(t => `${t.id} ${t.w}-${t.l} ${t.rf}-${t.ra}`).sort(), ['A 1-0 3-1', 'B 0-1 1-3', 'C 0-1 0-2', 'D 1-0 2-0'], 'season 2 table only counts season 2');
const over2 = seasonAt(hand2, '2026-12-05');
eq([over2.state, over2.season, over2.champion], ['over', 2, 'C'], 'two seasons over');
eq([seasonAt(hand2, '2026-11-30').season, seasonAt(hand2, '2026-11-30').state], [1, 'before'], 'before the start: season 1');

/* the 首頁 */
const teams = { season: '0', teams: ['A', 'B', 'C', 'D'].map(id => ({ id, name: id + '隊' })) };
const none = view({ ...combine({ teams }), today: '2026-12-02' });
if (!none.includes('賽季尚未開始') || !none.includes('試跑')) bad('home: no season file shows 賽季尚未開始 under 試跑');
const page = view({ ...combine({ teams, trial: hand }), today: '2026-12-02' });
for (const want of ['第 1 季（試跑）', '第 2 天，共 2 天', 'C隊 <span class="at">對</span> B隊', '先發 c2・b2', '昨晚', '>2 : 5<', '試跑・非正式'])
  if (!page.includes(want)) bad(`home with a season file: missing ${want}`);
if (page.includes('>3 : 0<')) bad('home: tonight\'s score must stay hidden');
const p2 = view({ ...combine({ teams, trial: hand2 }), today: '2026-12-03' });
for (const want of ['第 2 季（試跑）', '第 1 天，共 2 天', '昨晚']) if (!p2.includes(want)) bad(`home on season 2 night 1: missing ${want}`);
const real = view({ ...combine({ teams, trial: file }), today: '2026-11-28' });
if (!real.includes('第 1 天') || real.includes('昨晚')) bad('home on opening day: day 1, no last night');

/* #743 part 2: last night's pairing links to its 二軍 record on the same night, only when teams and night match */
const farmRec = (id, day, teams) => ({ id, tier: 2, day, seed: 1, engine: { commit: 'abc1234', version: 'y' }, teams, decisions: {}, result: { score: [1, 0], line_score: [[1], [0]] } });
const { TEAMS } = await imp('league/teams.js');
const T = TEAMS.map(t => t.id), ht = { ...hand, nights: [{ ...hand.nights[0], games: [{ home: T[1], away: T[0], starters: ['a', 'b'], score: [2, 5] }, { home: T[3], away: T[2], starters: ['c', 'd'], score: [4, 1] }] }, { day: 1, phase: 'season', games: [] }] };
const tTeams = { season: '0', teams: T.map(id => ({ id, name: id })) };
const linked = view({ ...combine({ teams: tTeams, trial: ht, farm: [farmRec('f-7', 0, [0, 1]), farmRec('f-8', 1, [2, 3]), farmRec('f-9', 0, [3, 2])] }), today: '2026-12-02' });
if (!linked.includes('href="play.html?f=f-7"')) bad('home: last night game 1 should link to f-7');
if (linked.includes('f-8') || linked.includes('f-9')) bad('home: a record of another night or with swapped teams must not link');
if (linked.split('二軍重播').length !== 2) bad('home: exactly one 二軍重播 link expected');
if (view({ ...combine({ teams: tTeams, trial: ht }), today: '2026-12-02' }).includes('二軍重播')) bad('home: no farm file -> no replay link');

/* #743 part 3: health tag on a hand-made file (nights day 0 and 1, 2 + 1 games, engine commit 'abcdef0123') */
const hf = { trial: true, seed: 1, start: '2026-12-01', engine: { commit: 'abcdef0123' }, nights: [{ day: 0, phase: 'season', games: [{ home: 'A', away: 'B', score: [1, 2] }, { home: 'C', away: 'D', score: [3, 0] }] }, { day: 1, phase: 'season', games: [{ home: 'B', away: 'A', score: [0, 1] }] }] };
eq(healthAt(hf, '2026-11-30'), { newest: null, games: 0, engine: 'abcdef0', staleDays: 0, stale: false }, 'health before the opening');
eq(healthAt(hf, '2026-12-01'), { newest: null, games: 0, engine: 'abcdef0', staleDays: 0, stale: false }, 'health on opening day');
eq(healthAt(hf, '2026-12-02'), { newest: '2026-12-01', games: 2, engine: 'abcdef0', staleDays: 0, stale: false }, 'health on night 2');
eq(healthAt(hf, '2026-12-03'), { newest: '2026-12-02', games: 3, engine: 'abcdef0', staleDays: 0, stale: false }, 'health the day after the last night');
eq(healthAt(hf, '2026-12-04'), { newest: '2026-12-02', games: 3, engine: 'abcdef0', staleDays: 1, stale: false }, 'health 1 day behind: fresh');
eq(healthAt(hf, '2026-12-05'), { newest: '2026-12-02', games: 3, engine: 'abcdef0', staleDays: 2, stale: true }, `health ${STALE_DAYS} days behind: stale`);
if (healthAt(null, '2026-12-02') !== null || healthAt(hf, 'x') !== null) bad('health: bad file or date must give null');
const hteams = { season: '0', teams: ['A', 'B', 'C', 'D'].map(id => ({ id, name: id + '隊' })) };
const hv = today => view({ ...combine({ teams: hteams, trial: hf }), today });
if (!hv('2026-12-03').includes('最新賽果 2026-12-02・引擎 abcdef0・3 場') || hv('2026-12-03').includes('class="health red"')) bad('home: fresh health line missing or red');
if (!hv('2026-12-05').includes('class="health red"') || !hv('2026-12-05').includes('資料過期')) bad('home: stale file must show the red health tag');
if (!hv('2026-12-01').includes('尚無賽果')) bad('home: opening day health line says no results yet');
/* the refill: --days N covers at least N nights and the first nights stay the same (same seed, start, commit) */
const small = JSON.parse(execFileSync(process.execPath, [...args, '--days', '10'], { encoding: 'utf8' })), big = JSON.parse(out1);
if (small.nights.length < 10 || small.nights.length >= big.nights.length) bad(`--days 10 gave ${small.nights.length} nights, want >= 10 and fewer than the default ${big.nights.length}`);
eq(small.nights, big.nights.slice(0, small.nights.length), '--days: the shared nights are identical');

if (problems.length) { console.error('season_site check FAILED:\n  ' + problems.join('\n  ')); process.exit(1); }
console.log('season_site check ok');
