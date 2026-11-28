/* Batter ejection after a bench-clearing (#379 part 7). Runs simGame over GAMES seeds with grudges, retaliation and
 * bench-clearing on (pitcher ejection off and on), batter ejection off and on; fails when
 *   - EJECT_BATTER_ON is not false or EJECT_BATTER_P / EJECT_BATTER_MAX_P are out of range,
 *   - batter ejection acts without bench-clearing (opts.ejectBatter alone changes a game with only retaliation on),
 *   - with it on but no batter ejected, the game differs from the game with it off (also with pitcher ejection on),
 *   - a batter `ejection` is not emitted at the end of a BENCH frame, or does not name that BENCH's hit batter and batting team,
 *   - after a batter ejection with a bench man left, the next frame of that team is not an ejected SUB putting a bench man
 *     on his base and in his lineup slot (stream `substitution` role `pinch_runner`, `ejected: true`, out = the ejected batter),
 *     or the ejected batter bats or runs again,
 *   - two games for one seed differ, or no batter ejection / forced runner happens at all (the check saw nothing).
 * static.mjs runs this file. Usage: node tests/eject_batter.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const GAMES = 1500;
const errs = [], bad = m => { if (errs.length < 20) errs.push(m); };

if (K.EJECT_BATTER_ON !== false) bad('EJECT_BATTER_ON must stay false in this part');
if (!(K.EJECT_BATTER_P > 0 && K.EJECT_BATTER_P <= K.EJECT_BATTER_MAX_P && K.EJECT_BATTER_MAX_P <= 1)) bad('EJECT_BATTER_P / EJECT_BATTER_MAX_P out of range');

const FEUD = { grudge: true, retaliate: true, benchClear: true };
const js = g => JSON.stringify(g.stream);
let ejects = 0, runners = 0, both = 0;
for (let s = 1; s <= GAMES; s++) {
  if (s <= 200 && js(K.simGame(s, null, { grudge: true, retaliate: true })) !== js(K.simGame(s, null, { grudge: true, retaliate: true, ejectBatter: true }))) bad(`seed ${s}: batter ejection acts without bench-clearing`);
  for (const pe of [false, true]) {
    const base = { ...FEUD, eject: pe };
    const a = K.simGame(s, null, base), b = K.simGame(s, null, { ...base, ejectBatter: true });
    if (pe && js(b) !== js(K.simGame(s, null, { ...base, ejectBatter: true }))) bad(`seed ${s}: two games for one seed`);
    if (a.stream.some(x => x.type === 'ejection' && x.role === 'batter')) bad(`seed ${s}: batter ejection with the switch off`);
    const ej = b.stream.filter(x => x.type === 'ejection' && x.role === 'batter');
    if (!ej.length) { if (js(a) !== js(b)) bad(`seed ${s}: no batter ejection, yet the game changed (eject ${pe})`); continue; }
    if (pe && b.stream.some(x => x.type === 'ejection' && x.role === 'pitcher')) both++;
    for (const x of ej) {
      if (pe) ejects++;
      const tag = `seed ${s} batter ejection at ${x.t}`;
      const bi = x.f - 1, bench = b.ev[bi];
      if (!bench || bench.k !== 'BENCH') { bad(`${tag}: frame before is not BENCH`); continue; }
      if (Math.abs(x.t - (bench.t + bench.d)) > 0.002) bad(`${tag}: not at the end of the BENCH frame`);
      if (x.team !== bench.off) bad(`${tag}: team ${x.team}, BENCH off ${bench.off}`);
      const pa = b.stream.find(y => y.type === 'pa_end' && y.retaliation && y.f === bi - 1);
      if (!pa || pa.batter !== x.player) bad(`${tag}: player ${x.player} is not the hit batter (${pa && pa.batter})`);
      /* the first frame after the BENCH that is not the other team's ejected pitching change */
      let k = bi + 1;
      while (b.ev[k] && b.ev[k].k === 'CHG' && b.ev[k].ejected) k++;
      const nx = b.ev[k];
      if (nx && nx.k === 'SUB' && nx.ejected) {
        if (pe) runners++;
        const sub = b.stream.find(y => y.type === 'substitution' && y.ejected && y.role === 'pinch_runner' && y.f === k);
        if (nx.team !== x.team) bad(`${tag}: SUB team ${nx.team}`);
        if (!sub || sub.out !== x.player || sub.team !== x.team) { bad(`${tag}: substitution ${JSON.stringify(sub)}`); continue; }
        const onBase = nx.s1.b ? nx.s1.b : null;
        if (onBase && (onBase.includes(x.player) || !onBase.includes(sub.in))) bad(`${tag}: bases after SUB ${JSON.stringify(onBase)}`);
        const after = b.stream.slice(b.stream.indexOf(sub) + 1);
        if (after.some(y => (y.type === 'pa_start' || y.type === 'pa_end') && y.batter === x.player)) bad(`${tag}: ejected batter bats again`);
        if (after.some(y => y.type === 'runner_advance' && y.runner === x.player)) bad(`${tag}: ejected batter runs again`);
      }
    }
  }
}
if (!ejects) bad(`no batter ejection in ${GAMES} games with it on: the check saw nothing`);
if (!runners) bad('no forced pinch runner seen');
if (errs.length) { console.error('eject_batter.check FAIL\n- ' + errs.join('\n- ')); process.exit(1); }
console.log(`eject_batter.check ok: ${GAMES} games, ${ejects} batter ejections (${both} with the pitcher too), ${runners} forced runners; off = same game`);
