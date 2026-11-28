/* 我的球員 season line (#804 part 1). Fails when
 *   - tally() / seasonLine() break their own arithmetic on a hand-made table (AVG, OBP, SLG, HR, games; only the asked season, only nights before today),
 *   - the 我的球員 page of a batter or pitcher does not show the 試跑 line, a visitor before the season gets one, or tonight's night is counted,
 *   - a player without rows does not read STAT_NONE, or a missing file leaves a broken page,
 *   - the shipped league/site/player_stats.json has a bad row, a player not in players.json or the trial rosters, or its batting totals
 *     differ from the 一軍 scores in trial_games.json (all teams' hits are not checked here: the tool replays every game with the engine and
 *     stops on a score mismatch; this check only reads the file),
 *   - league/player_stats.js uses Math.random, Date or an import.
 * static.mjs runs this file. Usage: node tests/player_stats.check.mjs */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { COLS, PCOLS, tally, seasonLine, rate, lineText, pitchTally, pitchLine, pitchText, inningsText, batLog, pitLog, batGameText, pitGameText, careerRows, careerText } from '../league/player_stats.js';
import { myPlayerView, combine } from '../ui/site-data.js';
import { STAT_NONE, LOG_TITLE, CAREER_TITLE } from '../ui/site/me.js';
import { nightDate } from '../league/season_site.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bad = [], fail = m => bad.push(m), eq = (a, b, m) => { if (a !== b) fail(`${m}: got ${a}, want ${b}`); };
const rd = f => JSON.parse(readFileSync(path.join(ROOT, f), 'utf8'));

/* hand-made rows: [season, day, pa, ab, h, d, t, hr, bb, hbp, sf] */
const rows = [[1, 0, 5, 4, 2, 1, 0, 0, 1, 0, 0], [1, 1, 4, 4, 1, 0, 0, 1, 0, 0, 0], [1, 2, 5, 3, 0, 0, 0, 0, 1, 1, 0], [2, 9, 4, 4, 4, 0, 0, 4, 0, 0, 0]];
const t = tally(rows.slice(0, 3));
eq(t.g, 3, 'games'); eq(t.pa, 14, 'pa'); eq(t.ab, 11, 'ab'); eq(t.h, 3, 'h'); eq(t.hr, 1, 'hr'); eq(t.tb, 7, 'tb (a single and a double = 3, a homer = 4)');
eq(rate(t.avg), '.273', 'avg'); eq(rate(t.obp), '.429', 'obp'); eq(rate(t.slg), '.636', 'slg');
eq(rate(tally([[1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0]]).avg), '—', 'no at-bat gives a dash');
eq(rate(1), '1.000', 'rate 1');
/* pitchers: [season, day, bf, outs, k, bb, r] */
const prow = [[1, 0, 27, 21, 7, 2, 3], [1, 1, 20, 14, 3, 1, 1], [2, 5, 10, 6, 1, 0, 0]];
const pt = pitchTally(prow.slice(0, 2));
eq(pt.g, 2, 'p games'); eq(pt.bf, 47, 'bf'); eq(pt.outs, 35, 'outs'); eq(pt.k, 10, 'k'); eq(pt.bb, 3, 'bb'); eq(pt.r, 4, 'r');
eq(pt.ra9.toFixed(2), '3.09', 'ra9 = runs * 27 / outs'); eq(pt.k9.toFixed(2), '7.71', 'k9'); eq(pt.bb9.toFixed(2), '2.31', 'bb9');
eq(inningsText(35), '11.2', 'innings text'); eq(inningsText(6), '2', 'whole innings');
eq(pitchTally([[1, 0, 3, 0, 0, 0, 2]]).ra9, null, 'no out gives no rate');
if (!pitchText(pt).includes('RA9 3.09')) fail('pitchText lacks RA9');
const stats = { trial: true, cols: COLS, pcols: PCOLS, players: { a1: rows, bad: [[1, 0, 'x']] }, pitchers: { p1: prow, pbad: [[1, 0, 'x']] } };
eq(pitchLine(stats, 'p1', 1, 1).g, 1, 'only nights before idx (pitcher)');
eq(pitchLine(stats, 'p1', 2, 99).outs, 6, 'only the asked season (pitcher)');
eq(pitchLine(stats, 'pbad', 1, 99), null, 'a bad pitcher row is skipped');
eq(pitchLine(stats, 'a1', 1, 99), null, 'a batter has no pitching rows');
eq(seasonLine(stats, 'a1', 1, 2).g, 2, 'only nights before idx');
eq(seasonLine(stats, 'a1', 1, 0), null, 'night 0 is not before day 0');
eq(seasonLine(stats, 'a1', 2, 99).h, 4, 'only the asked season');
eq(seasonLine(stats, 'bad', 1, 99), null, 'a bad row is skipped');
eq(seasonLine(null, 'a1', 1, 99), null, 'no file');
eq(seasonLine({ trial: false, players: { a1: rows } }, 'a1', 1, 99), null, 'not a trial file');

/* the page: a two-night season starting 2026-12-01 */
const game = { home: 'owls', away: 'macaques', starters: ['x', 'y'], score: [1, 2] };
const trial = { trial: true, seed: 1, start: '2026-12-01', engine: { commit: 'abc1234', version: '0' }, seasons: [{ n: 1, firstDay: 0, nights: 3 }], nights: [0, 1, 2].map(day => ({ season: 1, day, phase: 'season', games: [game] })) };
const players = { a1: { name: '甲', role: 'B', pos: 'SS', age: 24, overall: 60, tier: 2, team: 0 }, p1: { name: '乙', role: 'P', pos: 'SP', age: 24, overall: 60, tier: 2, team: 0 }, z1: { name: '丙', role: 'B', pos: '1B', age: 24, overall: 60, tier: 2, team: 0 } };
const page = (id, today, extra = {}) => myPlayerView({ ...combine({ teams: [], players, games: [], trial, stats }), today, ...extra }, id);
const on = page('a1', '2026-12-03');
if (!on.includes('試跑 第 1 季成績') || !on.includes(esc(lineText(seasonLine(stats, 'a1', 1, 2))))) fail('batter page lacks the season line');
if (!on.includes('2 場')) fail('two nights before 12-03 must read 2 games');
if (page('a1', '2026-12-02').includes('2 場')) fail('tonight (12-02) leaked into the line');
if (!page('p1', '2026-12-03').includes(esc(pitchText(pitchLine(stats, 'p1', 1, 2))))) fail('pitcher page lacks the pitching line');
if (page('p1', '2026-12-03').includes('打擊率')) fail('a pitcher got a batting line');
if (page('p1', '2026-12-02').includes('2 場')) fail('tonight leaked into the pitching line');
if (page('a1', '2026-11-30').includes('season-line')) fail('a line before the season starts');
if (!page('z1', '2026-12-03').includes(STAT_NONE)) fail('a player without rows must read STAT_NONE');
if (myPlayerView({ ...combine({ teams: [], players, games: [], trial }), today: '2026-12-03' }, 'a1').includes('season-line')) fail('missing stats file must show no line');
/* #804 part 3: the game log */
eq(batLog(stats, 'a1', 1, 99).map(x => x.day).join(), '2,1,0', 'batter log: newest night first');
eq(batLog(stats, 'a1', 1, 2).map(x => x.day).join(), '1,0', 'batter log: only nights before idx');
eq(batLog(stats, 'a1', 1, 99, 2).length, 2, 'batter log: n caps the rows');
eq(batLog(stats, 'a1', 2, 99).length, 1, 'batter log: only the asked season'); eq(batLog(stats, 'bad', 1, 99).length, 0, 'batter log: bad row skipped');
eq(pitLog(stats, 'p1', 1, 99).length, 2, 'pitcher log'); eq(pitLog(null, 'p1', 1, 99).length, 0, 'pitcher log: no file');
eq(batGameText(rows[1]), '4 打數 1 安打　全壘打 1', 'batter game text'); eq(pitGameText(prow[0]), '7 局　面對 27 人　失 3 分　K 7　BB 2', 'pitcher game text');
eq(nightDate('2026-12-01', 2), '12-03', 'night date'); eq(nightDate('x', 2), '', 'bad start gives no date');
{ const on3 = page('a1', '2026-12-03'), li = (on3.match(/<section class="game-log">[\s\S]*?<\/section>/) || [''])[0];
  if (!li.includes(LOG_TITLE)) fail('batter page lacks the game log'); eq((li.match(/<li>/g) || []).length, 2, 'log rows = nights before today');
  if (!li.includes('12-02') || !li.includes('12-01')) fail('log rows lack their dates'); if (li.includes('12-03')) fail('tonight leaked into the log');
  if (page('a1', '2026-12-02').match(/<li>12-02/)) fail('log shows tonight');
  const pl = (page('p1', '2026-12-03').match(/<section class="game-log">[\s\S]*?<\/section>/) || [''])[0];
  if (!pl.includes('面對')) fail('pitcher log lacks the pitching text'); if (pl.includes('打數')) fail('pitcher log has batting text');
  if (page('z1', '2026-12-03').includes('game-log')) fail('a player without rows gets a log');
  if (page('a1', '2026-11-30').includes('game-log')) fail('a log before the season starts'); }
/* #804 part 6: career by season = finished seasons only, oldest first, whole-season lines */
eq(careerRows(stats, 'a1', 'B', 2).map(x => x.season).join(), '1', 'career: only seasons before the current one');
eq(careerRows(stats, 'a1', 'B', 3).map(x => x.season).join(), '1,2', 'career: oldest first');
eq(careerRows(stats, 'a1', 'B', 2)[0].line.g, 3, 'career: a whole season, not cut at a night');
eq(careerRows(stats, 'p1', 'P', 3).map(x => x.season).join(), '1,2', 'career: pitcher rows'); eq(careerRows(stats, 'p1', 'B', 3).length, 0, 'career: a batter has no pitching rows');
eq(careerRows(stats, 'bad', 'B', 9).length, 0, 'career: bad row skipped'); eq(careerRows(null, 'a1', 'B', 9).length, 0, 'career: no file'); eq(careerRows({ trial: false, players: { a1: rows } }, 'a1', 'B', 9).length, 0, 'career: not a trial file');
eq(careerText(careerRows(stats, 'a1', 'B', 2)[0].line, false), lineText(seasonLine(stats, 'a1', 1, 99)), 'career text = season line text');
{ const trial2 = { ...trial, seasons: [{ n: 1, firstDay: 0, nights: 3 }, { n: 2, firstDay: 3, nights: 3 }], nights: [0, 1, 2, 3, 4, 5].map(day => ({ season: day < 3 ? 1 : 2, day, phase: 'season', games: [game] })) };
  const pg = (id, today) => myPlayerView({ ...combine({ teams: [], players, games: [], trial: trial2, stats }), today }, id);
  const cb = (pg('a1', '2026-12-05').match(/<section class="career">[\s\S]*?<\/section>/) || [''])[0];
  if (!cb.includes(CAREER_TITLE) || !cb.includes('第 1 季') || cb.includes('第 2 季')) fail('batter page: career lists season 1 only while season 2 runs');
  if (!pg('p1', '2026-12-05').includes('class="career"')) fail('pitcher page lacks the career');
  if (pg('a1', '2026-12-03').includes('class="career"') && !pg('a1', '2026-12-03').includes('第 1 季')) fail('career box without a row');
  if (page('a1', '2026-12-03').includes('class="career"')) fail('one season only: no career rows yet');
  if (pg('z1', '2026-12-05').includes('class="career"')) fail('a player without rows gets a career');
  if (pg('a1', '2026-11-30').includes('class="career"')) fail('career before the season starts'); }
/* log links: a 一軍 player links to play.html?t=<night>-<slot> with the opponent, a 二軍 player to ?f=<id> only when the record holds him */
{ const pl2 = { a1: { ...players.a1, tier: 1, team: 'pheasants' } }, tr = { ...trial, nights: [0, 1, 2].map(day => ({ season: 1, day, phase: 'season', games: [{ home: 'macaques', away: 'x', score: [0, 1] }, { home: 'owls', away: 'pheasants', score: [1, 2] }] })) };
  const html = myPlayerView({ ...combine({ teams: [], players: pl2, games: [], trial: tr, stats }), today: '2026-12-03' }, 'a1');
  if (!html.includes('play.html?t=1-1')) fail('一軍 log row lacks play.html?t=<night>-<slot>'); if (!html.includes('play.html?t=0-1')) fail('一軍 log row of night 0 lacks its link');
  if (!html.includes('對 新竹爆肝貓頭鷹')) fail('一軍 log row lacks the opponent');
  const rec = rd('league/site/farm_games.json').find(r => r.trial === true && r.opts && r.opts.rosters), pid = rec.opts.rosters[0].bat[0].id, tix = rec.teams[0];
  const mine2 = { name: '丁', role: 'B', pos: 'SS', age: 24, overall: 60, tier: 2, team: ['pheasants', 'owls', 'macaques', 'x'][0] };
  const { TEAMS } = await import('../league/teams.js'); mine2.team = TEAMS[tix].id;
  const st2 = { trial: true, cols: COLS, players: { [pid]: [[1, rec.day, 4, 4, 1, 0, 0, 0, 0, 0, 0]] }, pitchers: {} }, tr2 = { ...trial, nights: [0, 1, 2, 3, 4, 5].map(day => ({ season: 1, day, phase: 'season', games: [game] })) };
  const t2 = '2026-12-0' + (rec.day + 2), h2 = myPlayerView({ ...combine({ teams: [], players: { [pid]: mine2 }, games: [], trial: tr2, stats: st2, farm: rd('league/site/farm_games.json') }), today: t2 }, pid);
  if (!h2.includes(`play.html?f=${rec.id}`)) fail('二軍 log row lacks play.html?f=<id>'); if (h2.includes('play.html?t=')) fail('a 二軍 player got a 一軍 link');
  const h3 = myPlayerView({ ...combine({ teams: [], players: { [pid]: mine2 }, games: [], trial: tr2, stats: st2, farm: [{ ...rec, opts: { rosters: [{ bat: [], pit: [] }, { bat: [], pit: [] }] } }] }), today: t2 }, pid);
  if (h3.includes('play.html?f=')) fail('a 二軍 record that does not hold him must not link'); }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

/* the shipped file */
const ship = rd('league/site/player_stats.json'), tg = rd('league/site/trial_games.json'), farm = rd('league/site/farm_games.json');
if (ship.trial !== true || JSON.stringify(ship.cols) !== JSON.stringify(COLS)) fail('shipped file: trial / cols');
if (JSON.stringify(ship.engine) !== JSON.stringify(tg.engine)) fail('shipped file engine differs from trial_games.json');
const ofRoster = r => (r ? [...r.bat, ...(r.bench || [])].map(p => p.id) : []);
const known = new Set([...tg.seasons.flatMap(s => s.rosters.flatMap(ofRoster)), ...farm.flatMap(r => ((r.opts && r.opts.rosters) || []).flatMap(ofRoster))]);
for (const [id, list] of Object.entries(ship.players)) {
  if (!known.has(id)) fail(`shipped file: ${id} is in no roster`);
  list.forEach(r => { if (r.length !== COLS.length || !r.every(Number.isInteger) || r.some(x => x < 0)) fail(`shipped ${id}: bad row ${JSON.stringify(r)}`); else if (r[4] > r[3] || r[3] > r[2] || r[7] > r[4] || r[5] + r[6] + r[7] > r[4]) fail(`shipped ${id}: a row breaks its own arithmetic ${JSON.stringify(r)}`); });
}
/* runs in the box score = runs in the record: every 一軍 game has at least one batter row per side (hits >= 0), and all PA of a night's team games are positive */
const pitIds = new Set([...tg.seasons.flatMap(s => Object.values(s.rosters)), ...farm.flatMap(r => Object.values((r.opts && r.opts.rosters) || {}))].filter(Boolean).flatMap(r => r.pit.map(p => p.id)));
for (const [id, list] of Object.entries(ship.pitchers || {})) {
  if (!pitIds.has(id)) fail(`shipped file: pitcher ${id} is in no roster`);
  list.forEach(r => { if (r.length !== PCOLS.length || !r.every(Number.isInteger) || r.some(x => x < 0)) fail(`shipped ${id}: bad pitching row ${JSON.stringify(r)}`); else if (r[4] + r[5] > r[2] || r[3] > 3 * 30) fail(`shipped ${id}: a pitching row breaks its own arithmetic ${JSON.stringify(r)}`); });
}
if (!Object.keys(ship.pitchers || {}).length) fail('shipped file has no pitchers');
/* every 一軍 game: runs allowed by the pitchers on a night add up to the recorded score (all runs, home and away) */
const runsByDay = {}; for (const l of Object.values(ship.pitchers || {})) for (const r of l) runsByDay[r[1]] = (runsByDay[r[1]] || 0) + r[6];
const recByDay = {}; for (const g of tg.games) recByDay[g.day] = (recByDay[g.day] || 0) + g.score[0] + g.score[1];
const farmByDay = {}; for (const r of farm) if (r.trial === true && r.opts && r.opts.rosters) farmByDay[r.day] = (farmByDay[r.day] || 0) + r.result.score[0] + r.result.score[1];
for (const day of Object.keys(recByDay)) if (runsByDay[day] !== recByDay[day] + (farmByDay[day] || 0)) { fail(`night ${day}: pitchers allowed ${runsByDay[day]} runs, records say ${recByDay[day] + (farmByDay[day] || 0)}`); break; }
const nightsWithRows = new Set(Object.values(ship.players).flatMap(l => l.map(r => r[1])));
for (const g of tg.games) if (!nightsWithRows.has(g.day)) { fail(`night ${g.day} has no player row`); break; }

const src = readFileSync(path.join(ROOT, 'league/player_stats.js'), 'utf8');
if (/Math\.random|Date\b|^import /m.test(src.replace(/\/\*[\s\S]*?\*\//g, ''))) fail('league/player_stats.js uses Math.random, Date or an import');

if (bad.length) { console.error(bad.join('\n')); process.exit(1); }
console.log(`player_stats: ${Object.keys(ship.players).length} players in the shipped file, season line ok`);
