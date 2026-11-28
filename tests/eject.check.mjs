/* Pitcher ejection after a bench-clearing (#379 part 6). Runs simGame over GAMES seeds with grudges, retaliation and
 * bench-clearing on, ejection off and on; fails when
 *   - EJECT_ON is not false or EJECT_PITCHER_P is out of range,
 *   - ejection acts without bench-clearing (opts.eject alone changes a game with only retaliation on),
 *   - with ejection on but none happening, the game differs from the bench-clearing game,
 *   - an `ejection` event is not emitted right after a BENCH frame (f = the frame after it, t = its end), or does not name
 *     that BENCH's retaliation pitcher and fielding team,
 *   - after an ejection with a reliever left, the next frame is not an ejected CHG of that team bringing in the next pitcher
 *     (stream `substitution` role `pitcher`, `ejected: true`, out = the ejected pitcher), or the ejected pitcher throws another pitch,
 *   - two games for one seed differ, or no ejection happens at all (the check saw nothing).
 * static.mjs runs this file. Usage: node tests/eject.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const GAMES = 2000;
const errs = [], bad = m => { if (errs.length < 20) errs.push(m); };

if (K.EJECT_ON !== false) bad('EJECT_ON must stay false in this part');
if (!(K.EJECT_PITCHER_P > 0 && K.EJECT_PITCHER_P <= 1)) bad('EJECT_PITCHER_P out of range');

const FEUD = { grudge: true, retaliate: true, benchClear: true };
const js = g => JSON.stringify(g.stream);
let ejects = 0, changes = 0;
for (let s = 1; s <= GAMES; s++) {
  if (s <= 200 && js(K.simGame(s, null, { grudge: true, retaliate: true })) !== js(K.simGame(s, null, { grudge: true, retaliate: true, eject: true }))) bad(`seed ${s}: ejection acts without bench-clearing`);
  const a = K.simGame(s, null, FEUD), b = K.simGame(s, null, { ...FEUD, eject: true });
  if (js(b) !== js(K.simGame(s, null, { ...FEUD, eject: true }))) bad(`seed ${s}: two games for one seed`);
  if (a.stream.some(x => x.type === 'ejection')) bad(`seed ${s}: ejection with the switch off`);
  const ej = b.stream.filter(x => x.type === 'ejection');
  if (!ej.length) { if (js(a) !== js(b)) bad(`seed ${s}: no ejection, yet the game changed`); continue; }
  for (const x of ej) {
    ejects++;
    const tag = `seed ${s} ejection at ${x.t}`;
    const bi = x.f - 1, bench = b.ev[bi];
    if (!bench || bench.k !== 'BENCH') { bad(`${tag}: frame before is not BENCH`); continue; }
    if (Math.abs(x.t - (bench.t + bench.d)) > 0.002) bad(`${tag}: not at the end of the BENCH frame`);
    if (x.team !== bench.def || x.role !== 'pitcher') bad(`${tag}: team ${x.team} role ${x.role}, BENCH def ${bench.def}`);
    const pa = b.stream.find(y => y.type === 'pa_end' && y.retaliation && y.f === bi - 1);
    if (!pa || pa.pitcher !== x.player) bad(`${tag}: player ${x.player} is not the retaliation pitcher`);
    const nx = b.ev[bi + 1];
    const sub = b.stream.find(y => y.type === 'substitution' && y.ejected && y.f === bi + 1);
    const later = b.ev.slice(bi + 1).filter(e => e.k === 'P' && e.def === undefined && e.pit && e.pit[0] === x.team);
    if (nx && nx.k === 'CHG') {
      changes++;
      if (!nx.ejected || nx.def !== x.team) bad(`${tag}: next CHG not an ejected change of team ${x.team}`);
      if (!sub || sub.out !== x.player || sub.team !== x.team || sub.role !== 'pitcher') bad(`${tag}: substitution ${JSON.stringify(sub)}`);
      const pitName = e => b.stream.find(y => y.type === 'pitch' && y.f === b.ev.indexOf(e));
      for (const e of later) { const p = pitName(e); if (p && p.pitcher === x.player) { bad(`${tag}: ejected pitcher threw again`); break; } }
    } else if (nx && nx.k === 'P' && nx.pit[0] === x.team) bad(`${tag}: a pitch follows without the change (${nx.k})`);
  }
}
if (!ejects) bad(`no ejection in ${GAMES} games with it on: the check saw nothing`);
if (!changes) bad('no ejected pitching change seen');
if (errs.length) { console.error('eject.check FAIL\n- ' + errs.join('\n- ')); process.exit(1); }
console.log(`eject.check ok: ${GAMES} games, ${ejects} ejections, ${changes} forced changes; off = same game`);
