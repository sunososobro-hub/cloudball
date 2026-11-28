/* Season-run check (#599 part 3, plain Node). Fails when
 *   - the final is not first-to-2 (2 or 3 games), the better seed does not host games 1 and 3, a wrong host / a tie /
 *     a game after the title is accepted, or the finalists are not the top two of rank(),
 *   - over SEASONS seeded seasons of league/tools/season_run.mjs (factory teams only, no fan file) a season has no champion,
 *     is not 12 games + a final of 2 or 3, a team plays twice in a night, a starter is on fewer than MIN_REST_DAYS, a team
 *     does not use its whole rotation, a champion is not a finalist, or the same seed gives a different season byte for byte.
 * Usage: node tests/season_run.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = await import(pathToFileURL(path.join(ROOT, 'league/season.js')));
const { runSeason, farmGames, FARM_SEED_BASE } = await import(pathToFileURL(path.join(ROOT, 'league/tools/season_run.mjs')));
const E = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const F = await import(pathToFileURL(path.join(ROOT, 'league/farm.js')));
const { ROSTERS } = await import(pathToFileURL(path.join(ROOT, 'league/players.js')));
const problems = [], bad = s => problems.push(s), eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) bad(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };
const SEASONS = 20;

/* hand-made final: A and B are the top two of this table */
const A = 'A', B = 'B', C = 'C', D = 'D', t = S.newStandings([A, B, C, D]);
for (const [home, away, homeRuns, awayRuns] of [[A,B,5,3],[C,D,4,2],[A,C,1,2],[B,D,6,0],[A,D,7,1],[B,C,2,3],[B,A,4,2],[D,C,3,5],[C,A,6,1],[D,B,2,1],[D,A,0,3],[C,B,2,4]]) S.applyResult(t, { home, away, homeRuns, awayRuns });
const f = S.newFinal(t);
eq(f.seeds, [C, B], 'finalists are the top two of rank()');
eq([S.FINAL_WINS, S.FINAL_MAX_GAMES], [2, 3], 'constants');
eq(S.nextFinalGame(f), { home: C, away: B }, 'game 1 at the better seed');
try { S.applyFinalResult(f, { home: B, away: C, homeRuns: 1, awayRuns: 0 }); bad('wrong host accepted'); } catch {}
try { S.applyFinalResult(f, { home: C, away: B, homeRuns: 2, awayRuns: 2 }); bad('tie accepted'); } catch {}
S.applyFinalResult(f, { home: C, away: B, homeRuns: 3, awayRuns: 1 });
eq(S.champion(f), null, 'open after 1-0');
eq(S.nextFinalGame(f), { home: B, away: C }, 'game 2 at the other seed');
S.applyFinalResult(f, { home: B, away: C, homeRuns: 2, awayRuns: 4 });
eq([S.nextFinalGame(f), S.champion(f), f.games.length], [null, C, 2], 'a 2-0 sweep ends in 2 games');
try { S.applyFinalResult(f, { home: C, away: B, homeRuns: 1, awayRuns: 0 }); bad('game after the title accepted'); } catch {}
const g3 = S.newFinal(t);
S.applyFinalResult(g3, { home: C, away: B, homeRuns: 1, awayRuns: 3 });
S.applyFinalResult(g3, { home: B, away: C, homeRuns: 2, awayRuns: 4 });
eq(S.nextFinalGame(g3), { home: C, away: B }, 'game 3 at the better seed');
S.applyFinalResult(g3, { home: C, away: B, homeRuns: 9, awayRuns: 8 });
eq([S.nextFinalGame(g3), S.champion(g3), g3.games.length], [null, C, 3], '1-1 goes to game 3');

/* seeded seasons, factory teams only (no fan file exists anywhere in this run) */
const before = JSON.stringify(ROSTERS), json = r => JSON.stringify({ ...r, rot: undefined });
for (let seed = 1; seed <= SEASONS; seed++) {
  const r = runSeason(seed), tag = `seed ${seed}`;
  if (!r.champion) { bad(`${tag}: no champion`); continue; }
  const season = r.log.filter(x => x.phase === 'season'), fin = r.log.filter(x => x.phase === 'final');
  eq(season.length, 12, `${tag}: season games`);
  if (fin.length < 2 || fin.length > 3) bad(`${tag}: final of ${fin.length} games`);
  if (!r.final.seeds.includes(r.champion)) bad(`${tag}: champion not a finalist`);
  const byDay = {};
  for (const x of r.log) (byDay[x.day] ||= []).push(x.home, x.away);
  for (const [d, teams] of Object.entries(byDay)) if (new Set(teams).size !== teams.length) bad(`${tag} day ${d}: a team plays twice`);
  for (const [id, last] of Object.entries(r.rot.last)) {
    eq(Object.keys(last).length, S.ROTATION_SIZE, `${tag}: ${id} uses its whole rotation`);
    const days = r.log.filter(x => x.home === id || x.away === id).map(x => ({ day: x.day, sp: x.starters[x.home === id ? 1 : 0] }));
    const seen = {};
    for (const { day, sp } of days) { if (sp in seen && day - seen[sp] - 1 < S.MIN_REST_DAYS) bad(`${tag}: ${id} ${sp} started on day ${seen[sp]} and day ${day}`); seen[sp] = day; }
  }
  if (seed <= 2) eq(json(runSeason(seed)), json(r), `${tag}: same seed, same season`);
}
/* 二軍 records written by the season loop (#600 part 4): one per 一軍 pairing, valid, replay byte for byte, same seed = same records */
for (const seed of [1, 2]) {
  const recs = farmGames(seed, { commit: 'abcdef1', startId: 10 }), tag = `farm seed ${seed}`;
  eq(recs.length, 12, `${tag}: one 二軍 game per 一軍 game`);
  eq(recs.map(r => r.id), recs.map((_, i) => `f-${10 + i}`), `${tag}: ids continue`);
  eq(JSON.stringify(farmGames(seed, { commit: 'abcdef1', startId: 10 })), JSON.stringify(recs), `${tag}: deterministic`);
  if (new Set(recs.map(r => r.seed)).size !== recs.length || recs.some(r => r.seed < FARM_SEED_BASE)) bad(`${tag}: seeds not distinct / not in the 二軍 block`);
  for (const r of recs) {
    const why = F.farmProblem(r); if (why) bad(`${tag} ${r.id}: ${why}`);
    const rep = await F.replayFarm(recs, r.id, async () => E);
    if (rep.status !== 'ok') bad(`${tag} ${r.id}: replay ${rep.status} ${rep.reason}`);
  }
}
eq(JSON.stringify(ROSTERS), before, 'ROSTERS unchanged by a season');

console.log(`season_run: final rules by hand + ${SEASONS} seeded seasons with no fan file, each to a champion`);
if (problems.length) { console.error(`FAILED: ${problems.length} season_run problem(s)`); for (const p of problems.slice(0, 20)) console.error('  ' + p); process.exit(1); }
console.log('OK: 12 games + final of 2 or 3, rest days kept, whole rotation used, deterministic.');
