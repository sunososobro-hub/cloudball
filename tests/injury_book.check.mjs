/* League injured list (#379 part 11): league/injuries.js and runSeason's `injury` option. Fails when
 *   - recordInjuries changes its input, gets `back` wrong (day + days + 1) or shortens a longer stay; outOn misses a man or
 *     keeps him on his `back` day; healthyRoster keeps an injured batter while a healthy bench man exists, does not move a
 *     bench man of the same position in first, or leaves an injured reliever in `pit`; pickHealthyStarter starts an injured
 *     man while a healthy starter exists, or differs from pickStarter with nobody out,
 *   - runSeason with injury off logs an `out` or returns `injured`, or differs from runSeason with injury undefined,
 *   - with injury on: two runs of one seed differ (rule 11), a logged game does not replay (healthyGame + seed) to its
 *     score, a game's `out` is not the list rebuilt from the earlier games' engine injuries, an out man bats or pitches,
 *   - no player in SEASONS seasons misses a game, or none comes back after his `back` day.
 * static.mjs runs this file. Usage: node tests/injury_book.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const I = await import(pathToFileURL(path.join(ROOT, 'league/injuries.js')));
const S = await import(pathToFileURL(path.join(ROOT, 'league/season.js')));
const { runSeason, healthyGame } = await import(pathToFileURL(path.join(ROOT, 'league/tools/season_run.mjs')));
const { simGame, ROSTERS, TEAMS } = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const SEASONS = 20;
const errs = [], bad = m => { if (errs.length < 20) errs.push(m); };
const J = JSON.stringify;

/* pure helpers */
const l0 = [], l1 = I.recordInjuries(l0, [{ team: 2, name: 'A', days: 3 }], 5);
if (J(l0) !== '[]') bad('recordInjuries changed its input');
if (J(l1) !== J([{ team: 2, name: 'A', back: 9 }])) bad(`recordInjuries back: ${J(l1)}`);
if (I.recordInjuries(l1, undefined, 6) !== l1 || I.recordInjuries(l1, [], 6) !== l1) bad('no injuries changed the list');
if (I.recordInjuries(l1, [{ team: 2, name: 'A', days: 1 }], 6)[0].back !== 9) bad('a shorter new injury shortened the stay');
if (J(I.outOn(l1, 2, 8)) !== '["A"]' || I.outOn(l1, 2, 9).length || I.outOn(l1, 1, 8).length) bad('outOn wrong day or team');
const R = ROSTERS[0], b0 = R.bat[0], bp = R.bench.find(b => b.pos === b0.pos);
const h = I.healthyRoster(R, [b0.name]);
if (h.bat.some(p => p.name === b0.name)) bad('healthyRoster kept an injured batter with a healthy bench');
if (bp && h.bat[0].name !== bp.name) bad('healthyRoster did not take the bench man of the same position');
if (h.bat[0].pos !== b0.pos) bad('the stand-in does not take the seat position');
if (h.bench.some(p => p.name === h.bat[0].name)) bad('the stand-in is still on the bench');
if (I.healthyRoster(R, []) !== R) bad('healthyRoster with nobody out is not the same roster');
const rp = R.pit.find(p => p.role !== 'SP');
if (I.healthyRoster(R, [rp.name]).pit.some(p => p.name === rp.name)) bad('an injured reliever stayed in pit');
const rot = S.newRotation(TEAMS.map(t => t.id)), id = TEAMS[0].id;
for (let d = 0; d < 7; d++) {
  const want = S.pickStarter(rot, id, R.pit, d);
  if (I.pickHealthyStarter(rot, id, R.pit, d, []) !== want) bad(`day ${d}: pickHealthyStarter with nobody out != pickStarter`);
  const alt = I.pickHealthyStarter(rot, id, R.pit, d, [R.pit[want].name]);
  if (alt === want) bad(`day ${d}: an injured starter started`);
  S.recordStart(rot, id, want, d);
}

/* off = as before */
const off = runSeason(1), off2 = runSeason(1, { injury: undefined });
if ('injured' in off || off.log.some(x => 'out' in x)) bad('injury off logs out or returns injured');
if (J(off.log) !== J(off2.log)) bad('injury undefined changes the season');

const ix = Object.fromEntries(TEAMS.map((t, i) => [t.id, i]));
let missed = 0, returned = 0;
for (let seed = 1; seed <= SEASONS; seed++) {
  const run = runSeason(seed, { injury: true });
  if (J(run) !== J(runSeason(seed, { injury: true }))) bad(`seed ${seed}: two runs differ`);
  let list = [];
  const wasOut = new Map();
  for (const x of run.log) {
    const teams = [ix[x.away], ix[x.home]];
    const want = Object.fromEntries(teams.map(t => [t, I.outOn(list, t, x.day)]).filter(e => e[1].length));
    if (J(want) !== J(x.out || {})) bad(`seed ${seed} day ${x.day}: out ${J(x.out)}, rebuilt ${J(want)}`);
    const hg = healthyGame(ROSTERS, teams, x.sp, x.out);
    const g = simGame(x.seed, {}, { teams, starters: hg.starters, rosters: hg.rosters, injury: true });
    if (g.final.sc[0] !== x.awayRuns || g.final.sc[1] !== x.homeRuns) bad(`seed ${seed} day ${x.day}: replay ${g.final.sc} != log ${x.awayRuns}-${x.homeRuns}`);
    teams.forEach((t, k) => {
      for (const n of (x.out || {})[t] || []) {
        missed++; wasOut.set(`${t}:${n}`, x.day);
        if (g.batters[k].includes(n)) bad(`seed ${seed} day ${x.day}: out man ${n} batted`);
        if (g.staff[k].some((p, i) => p.name === n && g.pst[k][i].bf > 0)) bad(`seed ${seed} day ${x.day}: out man ${n} pitched`);
      }
      for (const n of g.batters[k]) if (wasOut.has(`${t}:${n}`) && wasOut.get(`${t}:${n}`) < x.day) { returned++; wasOut.delete(`${t}:${n}`); }
    });
    list = I.recordInjuries(list, g.injuries, x.day);
  }
  if (J(list) !== J(run.injured)) bad(`seed ${seed}: final list ${J(run.injured)}, rebuilt ${J(list)}`);
}
if (!missed) bad(`no player missed a game in ${SEASONS} seasons`);
if (!returned) bad(`no injured batter came back in ${SEASONS} seasons`);
if (errs.length) { console.error('injury_book.check FAIL\n- ' + errs.join('\n- ')); process.exit(1); }
console.log(`injury_book.check ok: helpers, injury off = unchanged, ${SEASONS} seasons replay, ${missed} games missed, ${returned} returns`);
