/* Rundowns on a pickoff (#614 part 8): RD_OF_PO_P of the pickoffs at first catch the runner leaning; he breaks for second,
 * 1B throws to SS covering second, the runner turns back, SS runs him back and tosses to 1B up the line, 1B tags him in the
 * base path before he gets back. A label from the looks RNG: the same runner is out. Runs GAMES seeds and fails when
 *   - rundowns are not RD_OF_PO_P of the pickoffs (within TOL), or there are fewer than MIN_RD,
 *   - a `pickoff` with `rundown: true` is not followed by exactly one tag out of that runner, by 1B, base 1, with the tag time (`at`)
 *     after 1B holds the ball and before the runner gets back (`runnerAt`),
 *   - the ball does not go P -> 1B -> SS (receives at second) -> 1B (receives) -> tag, in that order,
 *   - the shortstop is not on second (`ssAt`) when the throw gets there, the runner turns before second, or the 1B meets him
 *     farther than RD_TAG_REACH away,
 *   - its play-by-play line does not say 夾殺, or a non-rundown pickoff carries `rundown`,
 *   - a game's pickoffs and pickoff outs do not match one to one, or a throw-over that misses carries `rundown`,
 *   - the same seed does not give the same stream twice (rule 11).
 * static.mjs runs this file. Usage: node tests/rundown.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const GAMES = 1500, TOL = 0.12, MIN_RD = 30, EPS = 1e-6;
const errs = [], bad = m => { if (errs.length < 20) errs.push(m); };
if (typeof K.RD_OF_PO_P !== 'number') bad('RD_OF_PO_P is missing from engine/constants.js');

let po = 0, rd = 0;
for (let s = 1; s <= GAMES; s++) {
  const g = K.simGame(s, {}, { teams: [s % 4, (s + 1) % 4] }), S = g.stream;
  for (const e of g.ev) {
    if (e.k !== 'P' || !e.po || e.pof) continue;
    po++;
    const at = `seed ${s} t ${e.t}`;
    if (!!e.rd !== !!(e.plan && e.plan.rundown)) bad(`${at}: frame rd flag and plan.rundown disagree`);
    if (!e.rd) { if (String(e.desc).includes('夾殺')) bad(`${at}: plain pickoff line says 夾殺`); continue; }
    rd++;
    const p = e.plan, R = p.rd, o = e.outs[0];
    if (e.outs.length !== 1 || o.reason !== 'tag' || o.fielder !== '1B' || o.base !== 1 || o.from !== 1 || o.runner !== e.s0.b[0]) bad(`${at}: rundown out ${JSON.stringify(o)}`);
    if (!(o.at >= o.ballAt - EPS && o.at < o.runnerAt && Math.abs(o.at - p.rd.tagAt) < EPS)) bad(`${at}: tag at ${o.at} not between the ball (${o.ballAt}) and the runner back (${o.runnerAt})`);
    const seq = p.actions.map(a => `${a.a}:${a.f}${a.to ? '>' + a.to : ''}`).join(' ');
    if (seq !== 'throw:P>1B receive:1B throw:1B>SS receive:SS throw:SS>1B receive:1B tag:1B') bad(`${at}: ball path ${seq}`);
    for (let i = 1; i < p.actions.length; i++) if (p.actions[i].t < p.actions[i - 1].t - EPS) bad(`${at}: actions out of order`);
    if (!(R.ssAt <= R.r2 + EPS)) bad(`${at}: shortstop on second at ${R.ssAt}, throw there at ${R.r2}`);
    if (!(R.turn < K.BASE_PATH)) bad(`${at}: runner turns at ${R.turn} m, past second`);
    if (!(R.tagPos > 0 && R.tagPos < R.turn)) bad(`${at}: tag ${R.tagPos} m up the line, not between first and the turn`);
    if (!String(e.desc).includes('夾殺')) bad(`${at}: rundown line "${e.desc}"`);
  }
  const pk = S.filter(x => x.type === 'pickoff' && !x.safe), pkRd = pk.filter(x => x.rundown).length;
  const outsPk = S.filter(x => x.type === 'out' && x.pickoff).length;
  if (outsPk !== pk.length) bad(`seed ${s}: ${pk.length} pickoffs but ${outsPk} pickoff outs`);
  if (S.some(x => x.type === 'pickoff' && x.safe && x.rundown)) bad(`seed ${s}: a throw-over that misses carries rundown`);
  if (pkRd !== g.ev.filter(e => e.rd).length) bad(`seed ${s}: stream rundowns ${pkRd} != frames`);
}
const again = JSON.stringify(K.simGame(7, {}).stream) === JSON.stringify(K.simGame(7, {}).stream);
if (!again) bad('seed 7 gives two different streams');
const share = rd / (po || 1);
if (Math.abs(share - K.RD_OF_PO_P) > TOL) bad(`${rd} of ${po} pickoffs are rundowns (${share.toFixed(3)}), want ${K.RD_OF_PO_P} +- ${TOL}`);
if (rd < MIN_RD) bad(`only ${rd} rundowns in ${GAMES} games, want >= ${MIN_RD}`);
if (errs.length) { console.error('rundown check FAILED:\n  ' + errs.join('\n  ')); process.exit(1); }
console.log(`rundown check ok: ${rd} rundowns of ${po} pickoffs in ${GAMES} games (${share.toFixed(3)})`);
