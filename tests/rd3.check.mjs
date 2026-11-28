/* Rundown off third (#614 part 16): a groundout to an infielder with a runner on third, first open, < 2 outs and the runner
 * held; in RD3_OF_GB_HOLD_P of them (own RNG, RD3_SALT) he broke on contact, the fielder throws home and he is run down
 * between third and home (`resolveRundownHome`). Fails when
 *   - a seed in SEEDS (found at engine 0.4.38) has none, or the rate over GAMES seeds is outside RATE,
 *   - the out is not a tag on the runner from third by 3B (SS when 3B fielded it), or not before he gets back,
 *   - the ball does not go fielder -> C -> cover, or the tag is not in the base path between third and home,
 *   - the batter is not on first after the play, a run scores, the result is not fielders_choice or the line lacks 夾,
 *   - the same seed does not give the same stream twice (rule 11).
 * static.mjs runs this file. Usage: node tests/rd3.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const KK = await import(pathToFileURL(path.join(ROOT, 'engine/constants.js')));
const GAMES = 1500, SEEDS = [29, 77], RATE = [0.004, 0.02];
const BASE_PATH = 27.43;
const errs = [], bad = m => { if (errs.length < 20) errs.push(m); };

let found = 0;
const look = (s, pinned) => {
  const g = K.simGame(s, {}, { teams: [s % 4, (s + 1) % 4] }), S = g.stream;
  let here = 0;
  g.ev.forEach((e, f) => {
    if (!e.play || !e.play.rd3) return;
    here++; found++;
    const at = `seed ${s} frame ${f}`, p = e.plan, rd = p.rd3, F = S.filter(y => y.f === f);
    const outs = F.filter(y => y.type === 'out'), pa = F.find(y => y.type === 'pa_end');
    if (e.s0.outs > 1) bad(`${at}: ${e.s0.outs} outs before the play`);
    if (!e.s0.b[2] || e.s0.b[0]) bad(`${at}: bases ${e.s0.b}`);
    if (outs.length !== 1) { bad(`${at}: ${outs.length} outs`); return; }
    const x = outs[0], want = e.play.fielder === '3B' ? 'SS' : '3B';
    if (x.reason !== 'tag' || x.from !== 3 || x.base !== 3 || x.runner !== e.s0.b[2] || x.fielder !== want) bad(`${at}: out ${x.reason} ${x.from}->${x.base} by ${x.fielder}`);
    if (!(x.t < x.runnerAt)) bad(`${at}: runner back first`);
    const thr = p.actions.filter(a => a.a === 'throw').map(a => `${a.f}>${a.to}`).join(',');
    if (thr !== `${e.play.fielder}>C,C>${want}`) bad(`${at}: throws ${thr}`);
    if (!(rd.tagPos > rd.up && rd.tagPos < BASE_PATH - KK.RD3_MIN_GAP)) bad(`${at}: tag ${rd.tagPos.toFixed(2)} m from third`);
    const c = F.find(y => y.type === 'contact');
    if (!c || c.ball !== 'GB' || c.bunt || e.s1.b[0] !== c.batter) bad(`${at}: not a grounder with the batter safe on first`);
    if (e.s1.b[2]) bad(`${at}: third still occupied`);
    if (e.s1.sc.join() !== e.s0.sc.join()) bad(`${at}: a run scores`);
    if (!pa || pa.result !== 'fielders_choice') bad(`${at}: result ${pa && pa.result}`);
    if (!String(e.desc).includes('夾')) bad(`${at}: line "${e.desc}"`);
  });
  if (pinned && !here) bad(`seed ${s}: no rundown off third`);
};
for (const s of SEEDS) look(s, true);
for (let s = 1; s <= GAMES; s++) look(s, false);
const rate = found / (GAMES + SEEDS.length);
if (rate < RATE[0] || rate > RATE[1]) bad(`rate ${rate.toFixed(4)} a game outside ${RATE}`);
const again = JSON.stringify(K.simGame(SEEDS[0], {}, { teams: [SEEDS[0] % 4, (SEEDS[0] + 1) % 4] }).stream);
if (again !== JSON.stringify(K.simGame(SEEDS[0], {}, { teams: [SEEDS[0] % 4, (SEEDS[0] + 1) % 4] }).stream)) bad(`seed ${SEEDS[0]} gives two different streams`);
console.log(`rd3: ${found} rundowns off third (${SEEDS.length} pinned seeds + ${GAMES} games, ${rate.toFixed(4)} a game)`);
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
console.log('OK');
