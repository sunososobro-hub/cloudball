/* Infield fly (#614 part 10, OBR 5.09(a)(5)): a fair pop-up or fly (not a liner or bunt) to an infielder, runners on first and
 * second, fewer than two outs, is declared (contact `infieldFly: true`) and the batter is out caught or not. A dropped one
 * (contact `dropped: true`, the ERROR_P draw) is an `infield_fly` out, not an error. Runs GAMES seeds and fails when
 *   - an in-play frame in that situation lacks the flag, or a flagged one is not in that situation,
 *   - fewer than MIN_DECLARED declared infield flies a game, or no dropped one at all over GAMES seeds,
 *   - a declared one is not one out of the batter (`fly_catch` when caught, `infield_fly` when dropped),
 *   - a dropped one has a `catch` action, no `drop` then `field` by its fielder IFF_DROP_PICKUP later, a runner moving,
 *     an error charged, a result other than popout / flyout, or a line without 內野高飛必死球,
 *   - the same seed does not give the same stream twice (rule 11).
 * static.mjs runs this file. Usage: node tests/iff.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const GAMES = 1500, MIN_DECLARED = 0.1, EPS = 1e-6;
const INF = ['P', 'C', '1B', '2B', '3B', 'SS'];
const errs = [], bad = m => { if (errs.length < 20) errs.push(m); };
if (typeof K.IFF_DROP_PICKUP !== 'number') bad('IFF_DROP_PICKUP is missing from engine/constants.js');

let declared = 0, drops = 0;
for (let s = 1; s <= GAMES; s++) {
  const g = K.simGame(s, {}, { teams: [s % 4, (s + 1) % 4] }), S = g.stream;
  for (const e of g.ev) {
    if (e.k !== 'P' || e.r !== 'inplay' || !e.play || !e.s0) continue;
    const p = e.play, at = `seed ${s} frame ${g.ev.indexOf(e)}`;
    const situation = (p.type === 'PU' || p.type === 'FB') && !p.foul && !p.bunt && p.res === 'out' && INF.includes(p.fielder)
      && e.s0.outs < 2 && !!e.s0.b[0] && !!e.s0.b[1];
    if (situation !== !!p.infieldFly) bad(`${at}: infieldFly ${!!p.infieldFly}, situation ${situation} (${p.type} ${p.res} ${p.fielder}, ${e.s0.outs} out)`);
    if (!p.infieldFly) continue;
    declared++;
    const frame = S.filter(x => x.f === g.ev.indexOf(e)), contact = frame.find(x => x.type === 'contact');
    const outs = frame.filter(x => x.type === 'out');
    if (!contact || !contact.infieldFly) bad(`${at}: contact not flagged infieldFly`);
    if (outs.length !== 1 || outs[0].runner !== contact?.batter) bad(`${at}: ${outs.length} outs, not one out of the batter`);
    const acts = frame.filter(x => x.type === 'fielder_action');
    if (!p.iffDrop) { if (outs[0]?.reason !== 'fly_catch') bad(`${at}: caught infield fly out ${outs[0]?.reason}`); continue; }
    drops++;
    if (!contact.dropped) bad(`${at}: contact not flagged dropped`);
    if (outs[0]?.reason !== 'infield_fly') bad(`${at}: dropped infield fly out ${outs[0]?.reason}`);
    if (outs[0] && outs[0].t + EPS < contact.t + contact.hang) bad(`${at}: out before the ball came down`);
    if (acts.some(a => a.action === 'catch')) bad(`${at}: a dropped ball is caught`);
    const drop = acts.find(a => a.action === 'drop' && a.fielder === p.fielder), pick = acts.find(a => a.action === 'field' && a.fielder === p.fielder);
    if (!drop || !pick || Math.abs(pick.t - drop.t - K.IFF_DROP_PICKUP) > 1e-3) bad(`${at}: no drop then pick-up ${K.IFF_DROP_PICKUP} s later`);
    if (frame.some(x => x.type === 'runner_advance' && x.from > 0)) bad(`${at}: a runner moves on a dropped infield fly`);
    if (e.s1 && e.s1.E && e.s1.E.join() !== e.s0.E.join()) bad(`${at}: an error is charged`);
    if (!frame.some(x => x.type === 'pa_end' && ['popout', 'flyout'].includes(x.result))) bad(`${at}: result is not popout / flyout`);
    if (!String(e.desc).includes('內野高飛必死球')) bad(`${at}: line "${e.desc}"`);
  }
}
if (declared / GAMES < MIN_DECLARED) bad(`${declared} declared infield flies in ${GAMES} games (${(declared / GAMES).toFixed(3)}/game < ${MIN_DECLARED})`);
if (!drops) bad(`no dropped infield fly in ${GAMES} games`);
const again = JSON.stringify(K.simGame(55, {}).stream) === JSON.stringify(K.simGame(55, {}).stream);
if (!again) bad('seed 55 gives two different streams');
console.log(`iff: ${declared} declared infield flies in ${GAMES} games (${(declared / GAMES).toFixed(3)}/game), ${drops} dropped`);
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
console.log('OK');
