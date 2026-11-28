/* Defensive replacement (#436 part 7): with opts.defSub the engine may put a better glove from the bench in late,
 * at the start of a half the leading team fields (engine/constants.js DEF_SUB_ON / DS_*; engine/sim/game.js). Fails when
 *   - the default game is not exactly the game with defSub = DEF_SUB_ON (the switch is the default),
 *   - with defSub on: two runs of a seed differ, no defensive replacement appears in GAMES games, a substitution is not
 *     announced by a 'D' decision picked 'ds' of the fielding team, comes before DS_MIN_INNING, after a pitch of the
 *     half, while that team does not lead, or the bench man's own position is not the position he takes,
 *   - the gain (def x arm, DS_OFF_POS for a man out of his own position) is below DS_EDGE,
 *   - after a substitution the lineup is not legal: the nine positions repeat, the replaced player bats again,
 *     a bench player comes in twice, or the next batter in that slot is not the new man,
 *   - deciding 'stay' on the first question still substitutes there,
 *   - batters and stats rows differ in length or PA totals do not add up,
 *   - runs/game, K%, BB%, AVG, OBP or SLG move more than DRIFT from the game without replacements.
 * Prints the rates before and after. static.mjs runs this file.
 * Usage: node tests/defsub.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { simGame, ROSTERS } = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const K = await import(pathToFileURL(path.join(ROOT, 'engine/constants.js')));
const GAMES = 1000;
const DRIFT = { 'runs/game': 0.4, 'K%': 0.01, 'BB%': 0.01, AVG: 0.008, OBP: 0.008, SLG: 0.015 };
const opts = (s, on) => ({ teams: [s % 4, (s + 1) % 4], defSub: on });
const problems = [], bad = s => problems.push(s);
const glove = b => (b.def || 1) * (b.arm || 1);

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
  if (JSON.stringify(base.stream) !== JSON.stringify(simGame(s, {}, opts(s, K.DEF_SUB_ON)).stream)) bad(`seed ${s}: default game differs from defSub = DEF_SUB_ON`);
  const base0 = simGame(s, {}, opts(s, false));
  const g = simGame(s, {}, opts(s, true));
  if (JSON.stringify(g.stream) !== JSON.stringify(simGame(s, {}, opts(s, true)).stream)) bad(`seed ${s}: not deterministic with defSub`);
  off.push(base0); on.push(g);
  if (g.batters.some((b, k) => b.length !== g.stats[k].length)) bad(`seed ${s}: batters and stats rows differ`);

  const T = g.teams.map(ti => ROSTERS[ti]);
  const pos = T.map(t => t.bat.map(b => b.pos)), slotName = T.map(t => t.bat.map(b => b.name));
  const byName = T.map(t => new Map([...t.bat, ...(t.bench || [])].map(b => [b.name, b])));
  const used = [new Set(), new Set()], gone = [new Set(), new Set()], expect = [null, null];
  let inning = 1, half = 0, sc = [0, 0], pitched = false, lastDecision = null;
  for (const x of g.stream) {
    if (x.type === 'half_start') { inning = x.inning; half = x.half; pitched = false; }
    if (x.type === 'pitch' || x.type === 'pickoff' || x.type === 'balk' || x.type === 'intentional_walk') pitched = true;
    if (x.type === 'run_scored') sc[x.team] = x.runs;
    if (x.type === 'decision') lastDecision = x;
    if (x.type === 'substitution' && x.role !== 'pitcher') {
      const k = x.team;
      if (!T[k].bench.some(b => b.name === x.in) || used[k].has(x.in)) bad(`seed ${s}: ${x.in} is not a fresh bench player`);
      if (slotName[k][x.lineup] !== x.out) bad(`seed ${s}: replaced ${x.out} is not in slot ${x.lineup}`);
      if (x.pos !== pos[k][x.lineup]) bad(`seed ${s}: ${x.in} does not take the position`);
      if (x.role === 'defensive') {
        subs++;
        if (!lastDecision || lastDecision.kind !== 'D' || lastDecision.pick !== 'ds' || lastDecision.team !== k) bad(`seed ${s}: defensive replacement without a 'D' decision picked 'ds'`);
        if (k === half) bad(`seed ${s}: defensive replacement by the batting team`);
        if (inning < K.DS_MIN_INNING) bad(`seed ${s}: defensive replacement in inning ${inning}`);
        if (pitched) bad(`seed ${s}: defensive replacement after a pitch of the half`);
        if (sc[k] <= sc[1 - k]) bad(`seed ${s}: defensive replacement without a lead`);
        const ds = byName[k].get(x.in), cur = byName[k].get(x.out);
        if (ds.pos !== x.pos) bad(`seed ${s}: ${x.in} (${ds.pos}) put at ${x.pos}`);
        const held = glove(cur) * (cur.pos === x.pos ? 1 : K.DS_OFF_POS);
        if (glove(ds) - held < K.DS_EDGE - 1e-9) bad(`seed ${s}: ${x.in} is not DS_EDGE better`);
      }
      used[k].add(x.in); gone[k].add(x.out); slotName[k][x.lineup] = x.in; expect[k] = [x.lineup, x.in];
      if (new Set(pos[k]).size !== K.LINEUP_SIZE) bad(`seed ${s}: positions repeat`);
    }
    if (x.type === 'pa_end') {
      const k = x.team;
      if (gone[k].has(x.batter)) bad(`seed ${s}: ${x.batter} bats after being replaced`);
      if (slotName[k][x.lineup] !== x.batter) bad(`seed ${s}: slot ${x.lineup} batter ${x.batter}, want ${slotName[k][x.lineup]}`);
      if (expect[k] && expect[k][0] === x.lineup) { if (expect[k][1] !== x.batter) bad(`seed ${s}: the next batter in the slot is not the new man`); expect[k] = null; }
    }
  }
  const paEnds = g.stream.filter(x => x.type === 'pa_end').length;
  const paRows = g.stats.flat().reduce((n, b) => n + b.ab + b.bb, 0) + g.stream.filter(x => x.type === 'pa_end' && /^sac_|^catcher_interference$/.test(x.result)).length;
  if (paEnds !== paRows) bad(`seed ${s}: ${paEnds} PA in the stream, ${paRows} in the stats`);

  const first = g.stream.find(x => x.type === 'decision' && x.kind === 'D');
  if (first && first.pick === 'ds') {
    const st = simGame(s, { [first.id]: 'stay' }, opts(s, true));
    const after = st.stream.findIndex(x => x.type === 'decision' && x.id === first.id);
    const sub = st.stream[after + 1];
    if (after < 0 || (sub && sub.type === 'substitution' && sub.role === 'defensive')) bad(`seed ${s}: 'stay' still makes the replacement`);
  }
}
if (!subs) bad(`no defensive replacement in ${GAMES} games`);

const a = rates(off), b = rates(on), fmt = (n, v) => n === 'runs/game' ? v.toFixed(2) : n.endsWith('%') ? (v * 100).toFixed(1) + '%' : v.toFixed(3).replace(/^0/, '');
for (const n of Object.keys(DRIFT)) if (Math.abs(a[n] - b[n]) > DRIFT[n]) bad(`${n} moves ${fmt(n, a[n])} -> ${fmt(n, b[n])}`);
console.log(`defensive replacement: ${GAMES} games, ${subs} replacements (${(subs / GAMES).toFixed(2)}/game)`);
console.log('off: ' + Object.keys(DRIFT).map(n => `${n} ${fmt(n, a[n])}`).join('  '));
console.log('on:  ' + Object.keys(DRIFT).map(n => `${n} ${fmt(n, b[n])}`).join('  '));
if (problems.length) { console.error(`FAILED: ${problems.length} defensive-replacement problem(s)`); for (const p of problems.slice(0, 20)) console.error('  ' + p); process.exit(1); }
console.log('OK: default = the switch, deterministic, legal lineups, the vote decides, rates within drift.');
