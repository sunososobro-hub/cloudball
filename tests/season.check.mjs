/* Season check (#599 part 1, plain Node). Fails when
 *   - the schedule is not 6 nights x 2 games, a team plays twice in a night, a pairing does not meet exactly twice
 *     (once home, once away) or the schedule differs between two calls,
 *   - the standings of a hand-made 12-game table (below) differ from the hand-worked numbers or ranking,
 *   - a tie score or an unknown team is accepted.
 * Usage: node tests/season.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = await import(pathToFileURL(path.join(ROOT, 'league/season.js')));
const { TEAMS } = await import(pathToFileURL(path.join(ROOT, 'league/teams.js')));
const problems = [], bad = s => problems.push(s), eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) bad(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };

const ids = TEAMS.map(t => t.id);
const sch = S.makeSchedule(ids);
eq(sch.length, S.SEASON_NIGHTS, 'nights');
eq(S.SEASON_NIGHTS, 6, 'SEASON_NIGHTS');
eq(S.makeSchedule(ids), sch, 'schedule is deterministic');
const meet = {};
sch.forEach((night, d) => {
  eq(night.length, 2, `games on night ${d}`);
  const seen = night.flatMap(g => [g.home, g.away]);
  if (new Set(seen).size !== seen.length || seen.length !== 4) bad(`night ${d}: a team plays twice or not at all`);
  for (const g of night) { const k = [g.home, g.away].sort().join('|'); (meet[k] ||= []).push(g.home); }
});
eq(Object.keys(meet).length, 6, 'pairings');
for (const [k, homes] of Object.entries(meet)) if (homes.length !== 2 || homes[0] === homes[1]) bad(`pairing ${k}: want 2 meetings, one home each, got ${homes}`);
eq(S.tonight(sch, 99), [], 'tonight past the end');
try { S.makeSchedule(ids.slice(0, 3)); bad('3 teams accepted'); } catch {}

/* hand-made table: A,B,C,D. Home team first. */
const A = 'A', B = 'B', C = 'C', D = 'D', t = S.newStandings([A, B, C, D]);
const G = [[A,B,5,3],[C,D,4,2],[A,C,1,2],[B,D,6,0],[A,D,7,1],[B,C,2,3],
           [B,A,4,2],[D,C,3,5],[C,A,6,1],[D,B,2,1],[D,A,0,3],[C,B,2,4]];
for (const [home, away, homeRuns, awayRuns] of G) S.applyResult(t, { home, away, homeRuns, awayRuns });
/* by hand, runs for-against over each team's six games:
 * A 3-3: for 5+1+7+2+1+3 = 19, against 3+2+1+4+6+0 = 16     B 3-3: for 3+6+2+4+1+4 = 20, against 5+0+3+2+2+2 = 14
 * C 5-1: for 4+2+3+5+6+2 = 22, against 2+1+2+3+1+4 = 13     D 1-5: for 2+0+1+3+2+0 = 8,  against 4+6+7+5+1+3 = 26 */
const want = { A: { w: 3, l: 3, rf: 19, ra: 16 }, B: { w: 3, l: 3, rf: 20, ra: 14 }, C: { w: 5, l: 1, rf: 22, ra: 13 }, D: { w: 1, l: 5, rf: 8, ra: 26 } };
for (const id of [A, B, C, D]) eq(t.teams[id], want[id], `standings ${id}`);
/* A and B level on 3 wins: head-to-head A 1 (home win), B 1 (home win) -> level, run difference B +6 over A +3 */
eq(S.rank(t), [C, B, A, D], 'ranking');
/* head-to-head beats run difference: A and B both win 2; A beat B twice (1-0), B won by 20-0 twice over D */
const u = S.newStandings([A, B, C, D]);
for (const [home, away, homeRuns, awayRuns] of [[A,B,1,0],[B,A,0,1],[A,C,0,1],[C,A,1,0],[B,D,20,0],[D,B,0,20],[C,D,1,0],[D,C,0,1]]) S.applyResult(u, { home, away, homeRuns, awayRuns });
eq(S.rank(u), [C, A, B, D], 'tie on wins: head-to-head (A 2-0 over B) beats run difference (B far better)');
for (const bady of [{ home: A, away: B, homeRuns: 3, awayRuns: 3 }, { home: A, away: 'X', homeRuns: 3, awayRuns: 1 }, { home: A, away: A, homeRuns: 3, awayRuns: 1 }]) {
  try { S.applyResult(S.newStandings([A, B]), bady); bad(`accepted ${JSON.stringify(bady)}`); } catch {}
}

console.log('season: schedule 6 nights x 2 games, standings against a 12-game table');
if (problems.length) { console.error(`FAILED: ${problems.length} season problem(s)`); for (const p of problems) console.error('  ' + p); process.exit(1); }
console.log('OK: schedule and standings.');
