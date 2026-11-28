/* Rivalries (#379 part 13): league/rivals.js and runSeason's `rivals` with feud on. Fails when
 *   - recordGrudges changes its input, keeps a zero-score row, or a game with no rows changes the book,
 *   - topGrudges is not most-first (ties by id) or ignores n, nemesisOf picks the wrong opponent, labels a pair under
 *     NEMESIS_MIN, or breaks a tie to the higher index,
 *   - runSeason with no feud returns `rivals`,
 *   - with feud on: two runs of one seed differ (rule 11), or the run's `rivals` is not the sum of the `grudges` rows of its
 *     logged games replayed from seed + sp + owedIn (the engine's figures, nothing else),
 *   - no season in SEASONS has a 宿敵 (the label is never reachable with the engine's constants).
 * static.mjs runs this file. Usage: node tests/rivals.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const V = await import(pathToFileURL(path.join(ROOT, 'league/rivals.js')));
const { runSeason } = await import(pathToFileURL(path.join(ROOT, 'league/tools/season_run.mjs')));
const { simGame, ROSTERS, TEAMS } = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const SEASONS = 20;
const FEUD = { grudge: true, retaliate: true };
const errs = [], bad = m => { if (errs.length < 20) errs.push(m); };
const J = JSON.stringify, sortKeys = o => (o && typeof o === 'object' ? Object.fromEntries(Object.keys(o).sort().map(k => [k, sortKeys(o[k])])) : o);

/* pure helpers */
const b0 = V.emptyRivals();
const b1 = V.recordGrudges(b0, [3, 1], [{ from: 'x', to: 'p', score: 1.5 }, { from: 'x', to: 'q', score: 0 }, { from: 'y', to: 'p', score: 1 }]);
if (J(b0) !== J(V.emptyRivals())) bad('recordGrudges changed its input');
if (J(sortKeys(b1)) !== J(sortKeys({ players: { x: { p: 1.5 }, y: { p: 1 } }, teams: { '1-3': 2.5 } }))) bad(`recordGrudges: ${J(b1)}`);
if (V.recordGrudges(b1, [0, 1], []) !== b1 || V.recordGrudges(b1, [0, 1], undefined) !== b1) bad('a game with no rows changed the book');
const b2 = V.recordGrudges(b1, [1, 3], [{ from: 'x', to: 'r', score: 1.5 }, { from: 'x', to: 'a', score: 0.5 }]);
if (J(V.topGrudges(b2, 'x')) !== J([{ id: 'p', points: 1.5 }, { id: 'r', points: 1.5 }, { id: 'a', points: 0.5 }])) bad(`topGrudges order: ${J(V.topGrudges(b2, 'x'))}`);
if (V.topGrudges(b2, 'x', 1).length !== 1 || V.topGrudges(b2, 'nobody').length !== 0) bad('topGrudges ignores n or an unknown id');
const tb = { players: {}, teams: { '0-1': 3, '1-2': 3, '2-3': 1, '0-3': V.NEMESIS_MIN - 0.5 } };
if (V.nemesisOf(tb, 1) !== 0) bad(`nemesisOf tie: ${V.nemesisOf(tb, 1)} (want the lower index 0)`);
if (V.nemesisOf(tb, 2) !== 1) bad(`nemesisOf(2): ${V.nemesisOf(tb, 2)}`);
if (V.nemesisOf(tb, 3) !== undefined) bad('nemesisOf labels a pair under NEMESIS_MIN');
if (V.nemesisOf(V.emptyRivals(), 0) !== undefined || V.nemesisOf(undefined, 0) !== undefined) bad('nemesisOf of an empty book');
if (V.nemesisLabel('雉雞') !== '宿敵：雉雞') bad('nemesisLabel text');

/* off = as before */
if ('rivals' in runSeason(1)) bad('feud off returns rivals');

const ix = Object.fromEntries(TEAMS.map((t, i) => [t.id, i]));
let withNemesis = 0, rows = 0;
for (let seed = 1; seed <= SEASONS; seed++) {
  const run = runSeason(seed, { feud: FEUD });
  if (J(run.rivals) !== J(runSeason(seed, { feud: FEUD }).rivals)) bad(`seed ${seed}: two runs differ`);
  let want = V.emptyRivals();
  for (const x of run.log) {
    const teams = [ix[x.away], ix[x.home]];
    const g = simGame(x.seed, {}, { teams, starters: x.sp, rosters: ROSTERS, ...FEUD, ...(x.owedIn ? { owed: x.owedIn } : {}) });
    rows += (g.grudges || []).length;
    want = V.recordGrudges(want, teams, g.grudges);
  }
  if (J(sortKeys(want)) !== J(sortKeys(run.rivals))) bad(`seed ${seed}: rivals ${J(run.rivals)} != replayed grudges ${J(want)}`);
  if (TEAMS.some((_, t) => V.nemesisOf(run.rivals, t) !== undefined)) withNemesis++;
}
if (!withNemesis) bad(`no 宿敵 in ${SEASONS} seasons`);
if (errs.length) { console.error('rivals.check FAIL\n- ' + errs.join('\n- ')); process.exit(1); }
console.log(`rivals.check ok: helpers, feud off = unchanged, ${SEASONS} seasons sum ${rows} grudge rows, ${withNemesis} with a 宿敵`);
