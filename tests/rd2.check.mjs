/* Rundown off second (#614 part 17): a groundout to 3B, SS or P with the runner on second alone, < 2 outs and the runner
 * held; in RD2_OF_GB_HOLD_P of them (own RNG, RD2_SALT) he broke for third on contact, the fielder throws to third and he is
 * run down between second and third (`resolveRundownThird`). Fails when
 *   - a seed in SEEDS (found at engine 0.4.41) has none, or the rate over GAMES seeds is outside RATE,
 *   - the out is not a tag on the runner from second by the man covering second (SS, 2B when SS is in the play), or not
 *     before he gets back,
 *   - the ball does not go fielder -> third-base cover (3B, SS when 3B fielded) -> second-base cover,
 *   - the tag is not in the base path between second and third,
 *   - the batter is not on first after the play, second or third is occupied, a run scores, the result is not
 *     fielders_choice or the line lacks 夾,
 *   - the same seed does not give the same stream twice (rule 11).
 * static.mjs runs this file. Usage: node tests/rd2.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const KK = await import(pathToFileURL(path.join(ROOT, 'engine/constants.js')));
const GAMES = 1500, SEEDS = [66, 145], RATE = [0.004, 0.025];
const BASE_PATH = 27.43;
const errs = [], bad = m => { if (errs.length < 20) errs.push(m); };

let found = 0;
const look = (s, pinned) => {
  const g = K.simGame(s, {}, { teams: [s % 4, (s + 1) % 4] }), S = g.stream;
  let here = 0;
  g.ev.forEach((e, f) => {
    if (!e.play || !e.play.rd2) return;
    here++; found++;
    const at = `seed ${s} frame ${f}`, p = e.plan, rd = p.rd2, F = S.filter(y => y.f === f), fl = e.play.fielder;
    const outs = F.filter(y => y.type === 'out'), pa = F.find(y => y.type === 'pa_end');
    if (e.s0.outs > 1) bad(`${at}: ${e.s0.outs} outs before the play`);
    if (!e.s0.b[1] || e.s0.b[0] || e.s0.b[2]) bad(`${at}: bases ${e.s0.b}`);
    if (!['3B', 'SS', 'P'].includes(fl)) bad(`${at}: fielded by ${fl}`);
    if (outs.length !== 1) { bad(`${at}: ${outs.length} outs`); return; }
    const x = outs[0], c3 = fl === '3B' ? 'SS' : '3B', c2 = fl === 'SS' || c3 === 'SS' ? '2B' : 'SS';
    if (x.reason !== 'tag' || x.from !== 2 || x.base !== 2 || x.runner !== e.s0.b[1] || x.fielder !== c2) bad(`${at}: out ${x.reason} ${x.from}->${x.base} by ${x.fielder}`);
    if (!(x.t < x.runnerAt)) bad(`${at}: runner back first`);
    const thr = p.actions.filter(a => a.a === 'throw').map(a => `${a.f}>${a.to}`).join(',');
    if (thr !== `${fl}>${c3},${c3}>${c2}`) bad(`${at}: throws ${thr}`);
    if (!(rd.tagPos > rd.up && rd.tagPos < BASE_PATH - KK.RD2_MIN_GAP)) bad(`${at}: tag ${rd.tagPos.toFixed(2)} m from second`);
    const c = F.find(y => y.type === 'contact');
    if (!c || c.ball !== 'GB' || c.bunt || e.s1.b[0] !== c.batter) bad(`${at}: not a grounder with the batter safe on first`);
    if (e.s1.b[1] || e.s1.b[2]) bad(`${at}: second or third occupied`);
    if (e.s1.sc.join() !== e.s0.sc.join()) bad(`${at}: a run scores`);
    if (!pa || pa.result !== 'fielders_choice') bad(`${at}: result ${pa && pa.result}`);
    if (!String(e.desc).includes('夾')) bad(`${at}: line "${e.desc}"`);
  });
  if (pinned && !here) bad(`seed ${s}: no rundown off second`);
};
for (const s of SEEDS) look(s, true);
for (let s = 1; s <= GAMES; s++) look(s, false);
const rate = found / (GAMES + SEEDS.length);
if (rate < RATE[0] || rate > RATE[1]) bad(`rate ${rate.toFixed(4)} a game outside ${RATE}`);
const again = JSON.stringify(K.simGame(SEEDS[0], {}, { teams: [SEEDS[0] % 4, (SEEDS[0] + 1) % 4] }).stream);
if (again !== JSON.stringify(K.simGame(SEEDS[0], {}, { teams: [SEEDS[0] % 4, (SEEDS[0] + 1) % 4] }).stream)) bad(`seed ${SEEDS[0]} gives two different streams`);
console.log(`rd2: ${found} rundowns off second (${SEEDS.length} pinned seeds + ${GAMES} games, ${rate.toFixed(4)} a game)`);
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
console.log('OK');
