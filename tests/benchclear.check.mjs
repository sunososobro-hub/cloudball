/* Bench-clearing after a retaliation (#379 part 5). Runs simGame over GAMES seeds with grudges + retaliation on, bench-clearing
 * off and on; fails when
 *   - BENCH_CLEAR_ON is not false, or BENCH_CLEAR_P / BENCH_CLEAR_MAX_P / BENCH_CLEAR_DUR are out of range,
 *   - bench-clearing acts without retaliation (opts.benchClear alone changes a factory game),
 *   - turning it on changes any stream event other than `bench_clearing` (times left out) or the box scores,
 *   - a BENCH frame does not follow the retaliation pitch frame of the same half, changes state, lasts other than
 *     BENCH_CLEAR_DUR, or has no single `bench_clearing` stream event naming that batter, pitcher and batting team,
 *   - two games for one seed differ, or no bench-clearing happens at all (the check saw nothing).
 * static.mjs runs this file. Usage: node tests/benchclear.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const GAMES = 1500;
const errs = [], bad = m => { if (errs.length < 20) errs.push(m); };

if (K.BENCH_CLEAR_ON !== false) bad('BENCH_CLEAR_ON must stay false in this part');
if (!(K.BENCH_CLEAR_P > 0 && K.BENCH_CLEAR_P <= K.BENCH_CLEAR_MAX_P && K.BENCH_CLEAR_MAX_P <= 1)) bad('BENCH_CLEAR_P / BENCH_CLEAR_MAX_P out of range');
if (!(K.BENCH_CLEAR_DUR > 0)) bad('BENCH_CLEAR_DUR must be positive');

/* times left out: t, frame and stream indexes, and absolute times inside an event (ballAt, fielderAt, runnerAt, ...) */
const noTime = g => g.stream.filter(x => x.type !== 'bench_clearing').map(x => { const { t, i, f, ...rest } = x; return JSON.stringify(rest, (k, v) => (/At$/.test(k) ? undefined : v)); }).join('\n');
const FEUD = { grudge: true, retaliate: true };
let retal = 0, clears = 0;
for (let s = 1; s <= GAMES; s++) {
  if (s <= 200 && JSON.stringify(K.simGame(s).stream) !== JSON.stringify(K.simGame(s, null, { benchClear: true }).stream)) bad(`seed ${s}: bench-clearing acts without retaliation`);
  const a = K.simGame(s, null, FEUD), b = K.simGame(s, null, { ...FEUD, benchClear: true });
  if (noTime(a) !== noTime(b)) bad(`seed ${s}: bench-clearing changed the game, not only its times`);
  if (JSON.stringify(a.stats) !== JSON.stringify(b.stats) || JSON.stringify(a.final.sc) !== JSON.stringify(b.final.sc)) bad(`seed ${s}: box score moved`);
  if (JSON.stringify(b.stream) !== JSON.stringify(K.simGame(s, null, { ...FEUD, benchClear: true }).stream)) bad(`seed ${s}: two games for one seed`);
  if ('bench_clearing' in Object.fromEntries(a.stream.map(x => [x.type, 1]))) bad(`seed ${s}: bench_clearing with the switch off`);
  retal += b.stream.filter(x => x.type === 'pa_end' && x.retaliation).length;
  const ev = b.stream.filter(x => x.type === 'bench_clearing');
  b.ev.forEach((e, fi) => {
    if (e.k !== 'BENCH') return;
    clears++;
    const p = b.ev[fi - 1], tag = `seed ${s} BENCH at ${e.t}`;
    if (!p || p.k !== 'P' || p.r !== 'hbp' || !p.retal || p.s1.half !== e.s0.half) bad(`${tag}: not right after a retaliation pitch of the same half`);
    if (JSON.stringify(e.s0) !== JSON.stringify(e.s1)) bad(`${tag}: state changed`);
    if (e.d !== K.BENCH_CLEAR_DUR) bad(`${tag}: d ${e.d}`);
    if (e.off !== e.s0.half || e.def !== 1 - e.s0.half) bad(`${tag}: teams ${e.off}/${e.def} at half ${e.s0.half}`);
    const mine = ev.filter(x => x.f === fi);
    const pa = b.stream.find(x => x.type === 'pa_end' && x.retaliation && x.f === fi - 1);
    if (mine.length !== 1) bad(`${tag}: ${mine.length} bench_clearing events`);
    else if (!pa || mine[0].batter !== pa.batter || mine[0].pitcher !== pa.pitcher || mine[0].team !== e.off) bad(`${tag}: event ${JSON.stringify(mine[0])} does not match the hit`);
  });
  if (ev.length !== b.ev.filter(e => e.k === 'BENCH').length) bad(`seed ${s}: ${ev.length} events for the BENCH frames`);
}
if (!clears) bad(`no bench-clearing in ${GAMES} games with it on: the check saw nothing`);
if (errs.length) { console.error('benchclear.check FAIL\n- ' + errs.join('\n- ')); process.exit(1); }
console.log(`benchclear.check ok: ${GAMES} games, ${retal} retaliations, ${clears} bench-clearings; off = same game, on = only times move`);
