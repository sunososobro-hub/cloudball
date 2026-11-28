/* Grudge record (#379 part 3). Runs simGame over GAMES seeds with the grudge record off and on; fails when
 *   - GRUDGE_ON is not false (factory games keep their streams until retaliation is tuned),
 *   - a game with the record off returns a `grudges` field, or turning it on changes the stream, frames or box scores,
 *   - the record is not one row per hit_by_pitch result, in stream order, with the batter as `from` and the pitcher
 *     on the mound as `to`, his temperament from league/temper.js and score GRUDGE_HBP x GRUDGE_TEMPER_SCALE[temper],
 *   - GRUDGE_TEMPER_SCALE lacks a temperament or does not rank 火爆 > 平穩 > 溫和,
 *   - the same seed gives two different records (rule 11).
 * static.mjs runs this file. Usage: node tests/grudge.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const { TEMPERS, temperOf } = await import(pathToFileURL(path.join(ROOT, 'league/temper.js')));
const GAMES = 400;
const errs = [], bad = m => { if (errs.length < 20) errs.push(m); };

if (K.GRUDGE_ON !== false) bad('GRUDGE_ON must stay false in this part');
for (const t of TEMPERS) if (!(K.GRUDGE_TEMPER_SCALE[t] > 0)) bad(`GRUDGE_TEMPER_SCALE has no factor for ${t}`);
const sc = K.GRUDGE_TEMPER_SCALE;
if (!(sc['火爆'] > sc['平穩'] && sc['平穩'] > sc['溫和'])) bad('GRUDGE_TEMPER_SCALE does not rank 火爆 > 平穩 > 溫和');

const ids = new Map(K.ROSTERS.flatMap(t => [...t.bat, ...t.pit, ...(t.bench || [])]).map(p => [p.name, p]));
let hbp = 0, rows = 0;
for (let s = 1; s <= GAMES; s++) {
  const off = K.simGame(s), on = K.simGame(s, null, { grudge: true });
  if ('grudges' in off) bad(`seed ${s}: grudges returned with the record off`);
  if (JSON.stringify(off.stream) !== JSON.stringify(on.stream) || JSON.stringify(off.ev) !== JSON.stringify(on.ev)
    || JSON.stringify(off.stats) !== JSON.stringify(on.stats) || JSON.stringify(off.pst) !== JSON.stringify(on.pst)) bad(`seed ${s}: the record changes the game`);
  if (JSON.stringify(on.grudges) !== JSON.stringify(K.simGame(s, null, { grudge: true }).grudges)) bad(`seed ${s}: two records for one seed`);
  const hits = on.stream.filter(e => e.type === 'pa_end' && e.result === 'hit_by_pitch');
  hbp += hits.length; rows += on.grudges.length;
  if (hits.length !== on.grudges.length) { bad(`seed ${s}: ${hits.length} hit batters, ${on.grudges.length} grudge rows`); continue; }
  hits.forEach((h, i) => {
    const g = on.grudges[i], b = ids.get(h.batter), p = ids.get(h.pitcher);
    if (!b || g.from !== b.id) bad(`seed ${s}: row ${i} from ${g.from}, batter ${h.batter}`);
    if (p && g.to !== p.id) bad(`seed ${s}: row ${i} to ${g.to}, pitcher ${h.pitcher}`);
    const inn = on.ev[h.f] && on.ev[h.f].s0.inn;
    if (g.inning !== inn || g.half !== h.team) bad(`seed ${s}: row ${i} at ${g.inning}/${g.half}, hit at ${inn}/${h.team}`);
    if (b && g.temper !== temperOf(b)) bad(`seed ${s}: row ${i} temper ${g.temper}, temper.js says ${temperOf(b)}`);
    if (Math.abs(g.score - K.GRUDGE_HBP * sc[g.temper]) > 1e-12) bad(`seed ${s}: row ${i} score ${g.score}`);
  });
}
if (!hbp) bad(`no hit batter in ${GAMES} games: the check saw nothing`);

if (errs.length) { console.error('grudge.check FAIL\n- ' + errs.join('\n- ')); process.exit(1); }
console.log(`grudge.check ok: ${GAMES} games, ${hbp} hit batters = ${rows} grudge rows; off = no field, on = same game`);
