/* 一軍 試跑 replay check (#743 part 4, plain Node). Fails when
 *   - a game of trialFile() (two chained seasons) does not replay `ok` with the engine, or its score differs from the
 *     season.json game at the same night and slot, or two builds differ by a byte,
 *   - the shipped league/site/trial_games.json does not cover every season.json game (same night, slot, teams, score, engine),
 *   - a bad `t`, a missing game or a changed score is not refused,
 *   - the 首頁 last-night rows do not link each game to play.html?t=<night>-<slot>.
 * The shipped file is not replayed here: its engine is the commit season.json names (jsDelivr), not this checkout.
 * Usage: node tests/trial_games.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = p => import(pathToFileURL(path.join(ROOT, p)));
const E = await imp('engine/index.js');
const { runSeasons, trialFile, trialSerialize, PLAYERS_IN } = await imp('league/tools/season_run.mjs');
const { siteFile } = await imp('league/season_site.js');
const TG = await imp('league/trial_games.js');
const { combine } = await imp('ui/site/shared.js');
const { view } = await imp('ui/site/home.js');
const { TEAMS } = await imp('league/teams.js');
const problems = [], bad = s => problems.push(s);
const local = async () => E;
const gameAt = (site, day, slot) => { const n = site.nights.find(x => x.day === day); return n && n.games[slot]; };
const ix = id => TEAMS.findIndex(t => t.id === id);

/* a fresh two-season build replays game by game */
const players = JSON.parse(readFileSync(PLAYERS_IN, 'utf8'));
const runs = runSeasons(3, { seasons: 2, players }), site = siteFile(runs, { start: '2026-11-28', commit: 'abc1234', version: E.ENGINE_VERSION });
const tf = trialFile(runs, { commit: 'abc1234' });
if (trialSerialize(tf) !== trialSerialize(trialFile(runSeasons(3, { seasons: 2, players }), { commit: 'abc1234' }))) bad('trialFile: two builds differ');
const total = site.nights.reduce((a, n) => a + n.games.length, 0);
if (tf.games.length !== total) bad(`trialFile: ${tf.games.length} games, season file has ${total}`);
if (new Set(tf.games.map(g => g.season)).size !== 2) bad('trialFile: both seasons expected');
for (const g of tf.games) {
  const s = gameAt(site, g.day, g.slot);
  if (!s || s.score.join() !== g.score.join() || ix(s.away) !== g.teams[0] || ix(s.home) !== g.teams[1]) { bad(`night ${g.day} slot ${g.slot}: not the season.json game`); continue; }
  const r = await TG.trialOpening(tf, TG.trialParam(g.day, g.slot), local);
  if (r.status !== 'ok' || !r.opening || r.opening.game.final.sc.join() !== g.score.join()) bad(`night ${g.day} slot ${g.slot}: replay ${r.status} ${r.reason}`);
}

/* refusals */
for (const t of ['', 'x', '1-', '-1', '1-2-3', null, 5]) if (TG.parseTrial(t)) bad(`parseTrial(${JSON.stringify(t)}) should be null`);
if ((await TG.trialOpening(tf, '9999-0', local)).status !== 'unknown') bad('missing game must be unknown');
if ((await TG.trialOpening(null, '0-0', local)).status !== 'unknown') bad('no file must be unknown');
const g0 = tf.games[0], forged = { ...tf, games: [{ ...g0, score: [g0.score[0] + 1, g0.score[1]] }] };
if ((await TG.trialOpening(forged, TG.trialParam(g0.day, g0.slot), local)).status !== 'mismatch') bad('a changed score must be a mismatch');

/* the shipped file covers the shipped season */
const shipSite = JSON.parse(readFileSync(path.join(ROOT, 'league/site/season.json'), 'utf8'));
const ship = JSON.parse(readFileSync(path.join(ROOT, TG.TRIAL_GAMES_FILE), 'utf8'));
if (JSON.stringify(ship.engine) !== JSON.stringify(shipSite.engine)) bad('trial_games.json engine differs from season.json');
if (ship.seasons.length !== shipSite.seasons.length) bad('trial_games.json seasons differ from season.json');
for (const n of shipSite.nights) n.games.forEach((s, slot) => {
  const rec = TG.trialRecord(ship, TG.trialParam(n.day, slot));
  if (!rec || rec.result.score.join() !== s.score.join() || rec.teams[0] !== ix(s.away) || rec.teams[1] !== ix(s.home)) bad(`shipped: night ${n.day} slot ${slot} missing or not the season.json game`);
});

/* 首頁: each last-night game links to its 一軍 replay */
const T = TEAMS.map(t => t.id);
const hand = { trial: true, seed: 1, start: '2026-12-01', engine: { commit: 'x', version: 'y' }, nights: [
  { day: 0, phase: 'season', games: [{ home: T[1], away: T[0], starters: ['a', 'b'], score: [2, 5] }, { home: T[3], away: T[2], starters: ['c', 'd'], score: [4, 1] }] },
  { day: 1, phase: 'season', games: [{ home: T[0], away: T[2], starters: ['e', 'f'], score: [3, 2] }] }] };
const teams = { season: '0', teams: T.map(id => ({ id, name: id })) };
const h = view({ ...combine({ teams, trial: hand }), today: '2026-12-02' });
if (!h.includes('href="play.html?t=0-0"') || !h.includes('href="play.html?t=0-1"') || h.split('一軍重播').length !== 3) bad('home: last night needs one 一軍重播 link per game (t=0-0, t=0-1)');
if (view({ ...combine({ teams, trial: hand }), today: '2026-12-01' }).includes('一軍重播')) bad('home: opening day has no last night, no link');

if (problems.length) { console.error('trial_games check FAILED:\n- ' + problems.join('\n- ')); process.exit(1); }
console.log(`trial_games: ${tf.games.length} fresh games replay ok; shipped file covers ${shipSite.nights.length} nights, engine ${String(ship.engine.commit).slice(0, 7)}`);
