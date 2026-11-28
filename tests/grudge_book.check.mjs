/* League grudge book (#379 part 9): league/grudges.js and runSeason's `feud` option. Fails when
 *   - pairKey is not order-free, owedFor of an empty book or an unmet pair is not undefined, recordOwed changes its input,
 *     keeps zero points, or a game with no `owed` changes the book,
 *   - runSeason with no feud logs an `owedIn` or returns `grudges`, or differs from runSeason with feud undefined,
 *   - with feud on: two runs of one seed differ (rule 11), a logged game does not replay from its seed + sp + owedIn
 *     to the logged score, a game's owedIn is not the `owed` its pair's previous counted game returned, or the final book
 *     is not the last meeting's `owed` of every pair,
 *   - no game in SEASONS seasons carries a grudge in (the book is never read).
 * static.mjs runs this file. Usage: node tests/grudge_book.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const G = await import(pathToFileURL(path.join(ROOT, 'league/grudges.js')));
const { runSeason } = await import(pathToFileURL(path.join(ROOT, 'league/tools/season_run.mjs')));
const { simGame, ROSTERS, TEAMS } = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const SEASONS = 20;
const FEUD = { grudge: true, retaliate: true };
const errs = [], bad = m => { if (errs.length < 20) errs.push(m); };
const J = JSON.stringify;

/* pure helpers */
if (G.pairKey(2, 0) !== G.pairKey(0, 2) || G.pairKey(0, 2) !== '0-2') bad('pairKey is not order-free');
if (G.owedFor({}, [1, 3]) !== undefined || G.owedFor(undefined, [1, 3]) !== undefined) bad('owedFor of an empty book');
const b0 = {}, b1 = G.recordOwed(b0, [3, 1], { 3: 2, 1: 0 });
if (J(b0) !== '{}') bad('recordOwed changed its input');
if (J(b1) !== J({ '1-3': { 3: 2 } })) bad(`recordOwed kept zero points or the wrong key: ${J(b1)}`);
if (J(G.owedFor(b1, [1, 3])) !== J({ 3: 2 })) bad('owedFor does not read the pair back');
if (G.recordOwed(b1, [1, 3], undefined) !== b1) bad('a game with no owed changed the book');
if ('1-3' in G.recordOwed(b1, [1, 3], { 1: 0, 3: 0 })) bad('an all-zero owed kept the pair');
if (G.owedFor({ '0-1': { 0: 0 } }, [0, 1]) !== undefined) bad('owedFor of zero points is not undefined');

/* off = as before */
const off = runSeason(1), off2 = runSeason(1, { feud: undefined });
if ('grudges' in off || off.log.some(x => 'owedIn' in x)) bad('feud off logs owedIn or returns grudges');
if (J(off.log) !== J(off2.log)) bad('feud undefined changes the season');

const ix = Object.fromEntries(TEAMS.map((t, i) => [t.id, i]));
let carried = 0;
for (let seed = 1; seed <= SEASONS; seed++) {
  const run = runSeason(seed, { feud: FEUD });
  if (J(run) !== J(runSeason(seed, { feud: FEUD }))) bad(`seed ${seed}: two runs differ`);
  const last = {};
  for (const x of run.log) {
    const teams = [ix[x.away], ix[x.home]], key = G.pairKey(teams[0], teams[1]);
    const g = simGame(x.seed, {}, { teams, starters: x.sp, rosters: ROSTERS, ...FEUD, ...(x.owedIn ? { owed: x.owedIn } : {}) });
    if (g.final.sc[0] !== x.awayRuns || g.final.sc[1] !== x.homeRuns) bad(`seed ${seed} day ${x.day}: replay ${g.final.sc} != log ${x.awayRuns}-${x.homeRuns}`);
    const want = G.owedFor(G.recordOwed({}, teams, last[key] || {}), teams);
    if (J(want) !== J(x.owedIn)) bad(`seed ${seed} day ${x.day}: owedIn ${J(x.owedIn)}, last meeting owed ${J(want)}`);
    if (x.owedIn) carried++;
    last[key] = g.owed;
  }
  let book = {};
  for (const [key, owed] of Object.entries(last)) book = G.recordOwed(book, key.split('-').map(Number), owed);
  const sorted = o => J(Object.keys(o || {}).sort().map(k => [k, o[k]]));
  if (sorted(book) !== sorted(run.grudges)) bad(`seed ${seed}: final book ${J(run.grudges)}, last meetings ${J(book)}`);
}
if (!carried) bad(`no game in ${SEASONS} seasons carried a grudge in`);
if (errs.length) { console.error('grudge_book.check FAIL\n- ' + errs.join('\n- ')); process.exit(1); }
console.log(`grudge_book.check ok: helpers, feud off = unchanged, ${SEASONS} seasons replay with ${carried} carried-in games`);
