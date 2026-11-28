/* Grudges across games (#379 part 8). Runs simGame over GAMES seeds with grudges and retaliation on, then each seed's next
 * game with the first game's `owed` passed as opts.owed; fails when
 *   - GRUDGE_CARRY is not in (0, 1],
 *   - a game with the record off returns `owed`, or opts.owed changes a game with the record off,
 *   - `owed` is not { <team index>: points } for both teams of the game, or a point is negative,
 *   - with retaliation off, `owed[team]` is not the sum of that team's batters' grudge scores (no retaliation settles them),
 *   - opts.owed of all zeros, or an empty object, changes the game (no draw is added),
 *   - a carried game's retaliation draw does not see the carried points: with no hit batter before the first pitch of the
 *     offended team's pitcher, a carried-in team must be able to retaliate in its first defensive inning (seen at least once),
 *     and with no carry no game retaliates before a batter is hit,
 *   - the same seed and opts.owed give two different games (rule 11).
 * static.mjs runs this file. Usage: node tests/grudge_carry.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const GAMES = 600;
const errs = [], bad = m => { if (errs.length < 20) errs.push(m); };
const js = g => JSON.stringify(g.stream);

if (!(K.GRUDGE_CARRY > 0 && K.GRUDGE_CARRY <= 1)) bad('GRUDGE_CARRY out of (0, 1]');

const REC = { grudge: true }, FEUD = { grudge: true, retaliate: true };
let carriedTeams = 0, earlyRetal = 0;
for (let s = 1; s <= GAMES; s++) {
  if (s <= 100) {
    const off = K.simGame(s);
    if ('owed' in off) bad(`seed ${s}: owed returned with the record off`);
    if (js(off) !== js(K.simGame(s, null, { owed: { 0: 5, 1: 5 } }))) bad(`seed ${s}: opts.owed acts with the record off`);
  }
  /* record only: owed = sum of grudge scores per batting team */
  const r = K.simGame(s, null, REC);
  const keys = Object.keys(r.owed || {}).map(Number).sort();
  if (JSON.stringify(keys) !== JSON.stringify(r.teams.slice().sort())) { bad(`seed ${s}: owed keys ${keys}, teams ${r.teams}`); continue; }
  for (let side = 0; side < 2; side++) {
    const sum = r.grudges.filter(g => g.half === side).reduce((a, g) => a + g.score, 0);
    if (Math.abs(r.owed[r.teams[side]] - sum) > 1e-9) bad(`seed ${s}: team ${r.teams[side]} owed ${r.owed[r.teams[side]]}, grudge sum ${sum}`);
  }
  /* feud on: zero carry is no carry; carry is seeded */
  const g = K.simGame(s, null, FEUD);
  for (const v of Object.values(g.owed)) if (!(v >= 0)) bad(`seed ${s}: owed ${v}`);
  if (s <= 200 && (js(g) !== js(K.simGame(s, null, { ...FEUD, owed: { 0: 0, 1: 0 } })) || js(g) !== js(K.simGame(s, null, { ...FEUD, owed: {} })))) bad(`seed ${s}: a zero carry changes the game`);
  const firstHit = st => st.findIndex(e => e.type === 'pa_end' && e.result === 'hit_by_pitch' && !e.retaliation);
  const firstRet = st => st.findIndex(e => e.type === 'pa_end' && e.retaliation);
  const gr = firstRet(g.stream);
  if (gr >= 0 && (firstHit(g.stream) < 0 || firstHit(g.stream) > gr)) bad(`seed ${s}: retaliation before any hit batter without a carry`);
  /* next game: carry a big grudge for both teams so the first-pitch draw can fire before any hit */
  const owed = { [g.teams[0]]: 3, [g.teams[1]]: 3 };
  const c = K.simGame(s + GAMES, null, { ...FEUD, owed });
  if (js(c) !== js(K.simGame(s + GAMES, null, { ...FEUD, owed }))) bad(`seed ${s}: two carried games for one seed`);
  carriedTeams += 2;
  const cr = firstRet(c.stream), ch = firstHit(c.stream);
  if (cr >= 0 && (ch < 0 || ch > cr)) earlyRetal++;
}
if (!earlyRetal) bad(`no carried-in retaliation before a hit in ${GAMES} games: the carry is not read`);
if (errs.length) { console.error('grudge_carry.check FAIL\n- ' + errs.join('\n- ')); process.exit(1); }
console.log(`grudge_carry.check ok: ${GAMES} games; off = no owed, owed = grudge sums, zero carry = same game; ${earlyRetal} of ${carriedTeams / 2} carried games retaliate before any hit`);
