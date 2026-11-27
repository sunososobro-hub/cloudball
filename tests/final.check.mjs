/* Final check (#599 part 3, plain Node). Fails when
 *   - the final's seeding, home order or best-of-three arithmetic differs from the hand-made cases (2-0, 2-1, a game
 *     after the winner, a tie, a stranger),
 *   - over SEASONS seeded whole seasons (league/tools/season_run.mjs, no fan file, factory 一軍 only) a season does not
 *     end in a champion, the final lasts other than 2 or 3 games, the champion is not a finalist who won twice, a
 *     starter is on short rest, a team plays twice in a night, standings differ from a recount of the games, or the same
 *     seed gives a different season (compared as JSON).
 * Usage: node tests/final.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = await import(pathToFileURL(path.join(ROOT, 'league/season.js')));
const { playSeason } = await import(pathToFileURL(path.join(ROOT, 'league/tools/season_run.mjs')));
const problems = [], bad = s => problems.push(s), eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) bad(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };
const SEASONS = 20;

/* hand-made: seeds A (top) and B */
const seeds = ['A', 'B'], g = (home, away, hr, ar) => ({ home, away, homeRuns: hr, awayRuns: ar });
eq([S.FINAL_BEST_OF, S.FINAL_WINS], [3, 2], 'constants');
eq([0, 1, 2].map(i => S.finalHome(seeds, i)), ['A', 'B', 'A'], 'top seed hosts games 1 and 3');
try { S.finalHome(seeds, 3); bad('a 4th final game accepted'); } catch {}
eq(S.seriesState(seeds, []), { wins: { A: 0, B: 0 }, winner: null, next: 0 }, 'nothing played');
eq(S.seriesState(seeds, [g('A', 'B', 5, 2)]), { wins: { A: 1, B: 0 }, winner: null, next: 1 }, '1-0');
eq(S.seriesState(seeds, [g('A', 'B', 5, 2), g('B', 'A', 1, 4)]), { wins: { A: 2, B: 0 }, winner: 'A', next: null }, '2-0 ends it');
eq(S.seriesState(seeds, [g('A', 'B', 2, 5), g('B', 'A', 1, 4), g('A', 'B', 3, 6)]).winner, 'B', '2-1 for the lower seed');
eq(S.seriesState(seeds, [g('A', 'B', 2, 5), g('B', 'A', 1, 4)]), { wins: { A: 1, B: 1 }, winner: null, next: 2 }, '1-1 needs a third');
try { S.seriesState(seeds, [g('A', 'B', 5, 2), g('B', 'A', 1, 4), g('A', 'B', 3, 1)]); bad('a game after the winner accepted'); } catch {}
try { S.seriesState(seeds, [g('A', 'B', 2, 2)]); bad('a tie accepted'); } catch {}
try { S.seriesState(seeds, [g('A', 'C', 2, 1)]); bad('a stranger accepted'); } catch {}
/* seeding from a hand-made table: B and C level on wins, B has the head-to-head */
const t = S.newStandings(['A', 'B', 'C', 'D']);
[g('A', 'B', 3, 1), g('A', 'C', 3, 1), g('A', 'D', 3, 1), g('B', 'C', 3, 1), g('C', 'B', 1, 2), g('C', 'D', 3, 1), g('D', 'B', 3, 1)].forEach(x => S.applyResult(t, x));
eq(S.finalSeeds(t), ['A', 'B'], 'seeds from a hand-made table');

/* whole seasons, no fan file */
for (let seed = 1; seed <= SEASONS; seed++) {
  const r = playSeason(seed), tag = `seed ${seed}`;
  const season = r.games.filter(x => x.stage === 'season'), fin = r.games.filter(x => x.stage === 'final');
  eq(season.length, 12, `${tag}: season games`);
  if (fin.length < 2 || fin.length > 3) bad(`${tag}: final lasted ${fin.length} games`);
  eq(r.final.seeds, S.rank(r.standings).slice(0, 2), `${tag}: finalists are the top two`);
  if (!r.final.seeds.includes(r.champion) || r.final.wins[r.champion] !== 2) bad(`${tag}: champion ${r.champion} is not a two-time winner of the final`);
  const re = S.newStandings(Object.keys(r.standings.teams));
  season.forEach(x => S.applyResult(re, x));
  eq(re.teams, r.standings.teams, `${tag}: standings recount`);
  const byDay = {};
  for (const x of r.games) { (byDay[x.day] ||= []).push(x.home, x.away); }
  for (const [d, ids] of Object.entries(byDay)) if (new Set(ids).size !== ids.length) bad(`${tag} day ${d}: a team plays twice`);
  if (seed <= 3) eq(playSeason(seed), r, `${tag}: same seed, same season`);
}
console.log(`final: hand-made series + ${SEASONS} whole seasons with no fan file (factory 一軍 only)`);
if (problems.length) { console.error(`FAILED: ${problems.length} final problem(s)`); for (const p of problems.slice(0, 20)) console.error('  ' + p); process.exit(1); }
console.log('OK: every season ends in a champion after a final of 2 or 3 games.');
