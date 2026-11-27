/* Pinch hit (#436 part 2): with opts.pinchHit the engine may send a bench batter up late with a runner in scoring
 * position (engine/constants.js PINCH_HIT_ON / PH_*; engine/sim/game.js). Fails when
 *   - the default game is not exactly the game with pinchHit = PINCH_HIT_ON (the switch is the default),
 *   - with pinchHit on: two runs of a seed differ, no pinch hitter appears in GAMES games, a substitution is not
 *     announced by an 'H' decision picked 'ph', comes before PH_MIN_INNING or without a runner on second or third,
 *   - after a substitution the lineup is not legal: the nine positions repeat, the replaced player bats again,
 *     a bench player comes in twice, or the next batter in that slot is not the pinch hitter,
 *   - deciding 'stay' on the first pinch-hit question still substitutes there,
 *   - a stats row is missing for a pinch hitter (batters and stats differ in length) or PA totals do not add up (ab + bb, hit by pitch inside bb, + sacrifices),
 *   - runs/game, K%, BB%, AVG, OBP or SLG move more than DRIFT from the game without pinch hits.
 * Prints the rates before and after. static.mjs runs this file.
 * Usage: node tests/pinchhit.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { simGame, ROSTERS } = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const K = await import(pathToFileURL(path.join(ROOT, 'engine/constants.js')));
const GAMES = 1000;
const DRIFT = { 'runs/game': 0.4, 'K%': 0.01, 'BB%': 0.01, AVG: 0.008, OBP: 0.008, SLG: 0.015 };
const opts = (s, on) => ({ teams: [s % 4, (s + 1) % 4], pinchHit: on, pinchRun: false, defSub: false });   /* other substitutions off: this check follows pinch hitters only (#436 part 8) */
const problems = [], bad = s => problems.push(s);

const rates = games => {
  let runs = 0, pa = 0, k = 0, bb = 0, ab = 0, h = 0, tb = 0, hbp = 0, sf = 0;
  for (const g of games) {
    runs += g.final.sc[0] + g.final.sc[1];
    for (const x of g.stream) {
      if (x.type !== 'pa_end') continue;
      pa++; const r = x.result;
      if (r === 'strikeout') k++;
      if (r === 'walk' || r === 'intentional_walk') bb++;
      if (r === 'hit_by_pitch') hbp++;
      if (r === 'sac_fly') sf++;
    }
    for (const side of g.stats) for (const b of side) { ab += b.ab; h += b.h; tb += b.h + b.d + 2 * b.t + 3 * b.hr; }
  }
  return { 'runs/game': runs / games.length, 'K%': k / pa, 'BB%': bb / pa, AVG: h / ab, OBP: (h + bb + hbp) / (ab + bb + hbp + sf), SLG: tb / ab };
};

const off = [], on = [];
let subs = 0;
for (let s = 1; s <= GAMES; s++) {
  const base = simGame(s, {}, opts(s));
  if (JSON.stringify(base.stream) !== JSON.stringify(simGame(s, {}, opts(s, K.PINCH_HIT_ON)).stream)) bad(`seed ${s}: default game differs from pinchHit = PINCH_HIT_ON`);
  const base0 = simGame(s, {}, opts(s, false));
  const g = simGame(s, {}, opts(s, true));
  if (JSON.stringify(g.stream) !== JSON.stringify(simGame(s, {}, opts(s, true)).stream)) bad(`seed ${s}: not deterministic with pinchHit`);
  off.push(base0); on.push(g);
  if (g.batters.some((b, k) => b.length !== g.stats[k].length)) bad(`seed ${s}: batters and stats rows differ`);

  /* walk the stream: positions per slot, who is out of the game, the decision before each substitution */
  const T = g.teams.map(ti => ROSTERS[ti]);
  const pos = T.map(t => t.bat.map(b => b.pos)), slotName = T.map(t => t.bat.map(b => b.name));
  const gone = [new Set(), new Set()], used = [new Set(), new Set()], expect = [null, null];
  let inning = 1, bases = [null, null, null], lastDecision = null;
  for (const x of g.stream) {
    if (x.type === 'half_start') { inning = x.inning; bases = [null, null, null]; }
    if (x.type === 'runner_placed') bases[x.base - 1] = x.runner;
    if (x.type === 'decision') lastDecision = x;
    if (x.type === 'runner_advance') { if (x.from > 0 && bases[x.from - 1] === x.runner) bases[x.from - 1] = null; if (x.to < 4) bases[x.to - 1] = x.runner; }
    if (x.type === 'out' && x.runner) bases = bases.map(r => r === x.runner ? null : r);
    if (x.type === 'pickoff' && !x.safe) bases[0] = null;
    if (x.type === 'substitution' && x.role === 'pinch_hitter') {
      subs++; const k = x.team;
      if (!lastDecision || lastDecision.kind !== 'H' || lastDecision.pick !== 'ph' || lastDecision.team !== k) bad(`seed ${s}: pinch hit without an 'H' decision picked 'ph'`);
      if (inning < K.PH_MIN_INNING) bad(`seed ${s}: pinch hit in inning ${inning}`);
      if (!bases[1] && !bases[2]) bad(`seed ${s}: pinch hit with nobody on second or third`);
      if (slotName[k][x.lineup] !== x.out) bad(`seed ${s}: replaced ${x.out} is not in slot ${x.lineup}`);
      if (!T[k].bench.some(b => b.name === x.in) || used[k].has(x.in)) bad(`seed ${s}: ${x.in} is not a fresh bench player`);
      if (x.pos !== pos[k][x.lineup]) bad(`seed ${s}: pinch hitter does not take the position`);
      used[k].add(x.in); gone[k].add(x.out); slotName[k][x.lineup] = x.in; expect[k] = [x.lineup, x.in];
      if (new Set(pos[k]).size !== K.LINEUP_SIZE) bad(`seed ${s}: positions repeat`);
    }
    if (x.type === 'pa_end') {
      const k = x.team;
      if (gone[k].has(x.batter)) bad(`seed ${s}: ${x.batter} bats after being replaced`);
      if (slotName[k][x.lineup] !== x.batter) bad(`seed ${s}: slot ${x.lineup} batter ${x.batter}, want ${slotName[k][x.lineup]}`);
      if (expect[k]) { if (expect[k][0] !== x.lineup || expect[k][1] !== x.batter) bad(`seed ${s}: the next batter is not the pinch hitter`); expect[k] = null; }
    }
  }
  const paEnds = g.stream.filter(x => x.type === 'pa_end').length;
  const paRows = g.stats.flat().reduce((n, b) => n + b.ab + b.bb, 0) + g.stream.filter(x => x.type === 'pa_end' && /^sac_/.test(x.result)).length;
  if (paEnds !== paRows) bad(`seed ${s}: ${paEnds} PA in the stream, ${paRows} in the stats`);

  /* 'stay' on the first pinch-hit question keeps the batter */
  const first = g.stream.find(x => x.type === 'decision' && x.kind === 'H');
  if (first && first.pick === 'ph') {
    const st = simGame(s, { [first.id]: 'stay' }, opts(s, true));
    const sub = st.stream.find(x => x.type === 'substitution' && x.role === 'pinch_hitter');
    const after = st.stream.findIndex(x => x.type === 'decision' && x.id === first.id);
    if (after < 0 || (sub && sub.i === after + 1)) bad(`seed ${s}: 'stay' still sends the pinch hitter`);
  }
}
if (!subs) bad(`no pinch hitter in ${GAMES} games`);

const a = rates(off), b = rates(on), fmt = (n, v) => n === 'runs/game' ? v.toFixed(2) : n.endsWith('%') ? (v * 100).toFixed(1) + '%' : v.toFixed(3).replace(/^0/, '');
for (const n of Object.keys(DRIFT)) if (Math.abs(a[n] - b[n]) > DRIFT[n]) bad(`${n} moves ${fmt(n, a[n])} -> ${fmt(n, b[n])}`);
console.log(`pinch hit: ${GAMES} games, ${subs} pinch hitters (${(subs / GAMES).toFixed(2)}/game)`);
console.log('off: ' + Object.keys(DRIFT).map(n => `${n} ${fmt(n, a[n])}`).join('  '));
console.log('on:  ' + Object.keys(DRIFT).map(n => `${n} ${fmt(n, b[n])}`).join('  '));
if (problems.length) { console.error(`FAILED: ${problems.length} pinch-hit problem(s)`); for (const p of problems.slice(0, 20)) console.error('  ' + p); process.exit(1); }
console.log('OK: default = the switch, deterministic, legal lineups, the vote decides, rates within drift.');
