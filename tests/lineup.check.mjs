/* Viewer lineup after pinch substitutions (#436 part 4: render/lineup.js, commentary/player.js). With the engine's pinch hit and
 * pinch run on (simGame opts), fails when
 *   - no pinch hitter or no pinch runner appears in GAMES games (the check saw nothing),
 *   - a pitch frame's batter as the viewer finds him (batterOf) is not the batter the stream names for that pitch,
 *   - a runner on base in a frame is not a player of his team (lineup, bench or staff) the viewer can look up,
 *   - a fielding side's lineup at a frame repeats a position or holds a replaced player,
 *   - a frame before a substitution already shows the new man (the lineup changed too early),
 *   - with substitutions off, batterOf differs from the roster's own `bat` slot (factory games draw as before),
 *   - the booth speaks a pitching-change line on a pinch hitter or pinch runner.
 * Usage: node tests/lineup.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { simGame, ROSTERS, TEAMS } = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const { lineupsByFrame } = await import(pathToFileURL(path.join(ROOT, 'render/lineup.js')));
const { createBooth } = await import(pathToFileURL(path.join(ROOT, 'commentary/player.js')));
const bank = JSON.parse(readFileSync(path.join(ROOT, 'commentary/lines.json'), 'utf8'));
const GAMES = 300;
const problems = [], bad = s => problems.push(s);
let ph = 0, pr = 0, pitches = 0;

for (let seed = 1; seed <= GAMES; seed++) {
  const on = simGame(seed, {}, { pinchHit: true, pinchRun: true });
  const L = lineupsByFrame(on.ev, on.stream, ROSTERS);
  const subs = on.stream.filter(x => x.type === 'substitution' && x.role !== 'pitcher');
  const out = [0, 1].map(() => new Set());
  for (const x of subs) { if (x.role === 'pinch_hitter') ph++; if (x.role === 'pinch_runner') pr++; }
  for (const x of on.stream) {
    if (x.type !== 'pitch') continue;
    pitches++;
    const b = L.batterOf(on.ev[x.f]);
    if (!b || b.name !== x.batter) bad(`seed ${seed} frame ${x.f}: viewer batter ${b && b.name} but the stream says ${x.batter}`);
  }
  on.ev.forEach((e, i) => {
    for (const x of subs) if (x.f === i) out[x.team].add(x.out);
    for (const x of subs) if (x.f > i && (L.lineupAt(e, x.team) || []).some(p => p.name === x.in)) bad(`seed ${seed} frame ${i}: ${x.in} shown before his substitution at frame ${x.f}`);
    if (!e.s0) return;
    const off = e.s0.half, def = 1 - off;
    for (const n of e.s0.b) if (n && !L.playerOf(off, n)) bad(`seed ${seed} frame ${i}: runner ${n} is nobody the viewer can look up`);
    const D = L.lineupAt(e, def) || [], pos = D.map(p => p.pos);
    if (new Set(pos).size !== pos.length) bad(`seed ${seed} frame ${i}: positions repeat in the fielding lineup (${pos.join(',')})`);
    for (const p of D) if (out[def].has(p.name)) bad(`seed ${seed} frame ${i}: replaced player ${p.name} still in the fielding lineup`);
  });
  const lines = createBooth({ stream: on.stream, seed, bank, teams: on.teams.map(t => TEAMS[t]), describe: x => on.ev[x.f].desc }).lines;
  /* #606 part 4: a pinch hitter / runner / defensive change has its own calls now; what it must never get is a pitching-change line */
  const esc = t => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{[\w:]+\\\}/g, '.+');
  const pcRes = bank.triggers.pitching_change.exchanges.flatMap(e => [e.call, e.response, ...(e.alt || [])]).filter(Boolean).map(t => new RegExp('^' + esc(t) + '$'));
  for (const x of subs) if (x.role !== 'pitcher' && lines.some(l => l.at === x.i && pcRes.some(r => r.test(l.text)))) bad(`seed ${seed} @${x.i}: the booth talks on a ${x.role} as if it were a pitching change`);
  if (seed <= 50) {
    const off = simGame(seed, {}, { pinchHit: false, pinchRun: false, defSub: false }), Lo = lineupsByFrame(off.ev, off.stream, ROSTERS);
    for (const e of off.ev) if (e.bat) for (const k of [0, 1]) {
      const R = ROSTERS[e.bat[0]].bat;
      if (Lo.batterOf(e, k) !== R[(e.bat[1] + k) % R.length]) { bad(`seed ${seed}: factory game batterOf differs from the roster slot`); break; }
    }
  }
}
if (!ph) bad(`no pinch hitter in ${GAMES} games: the check saw nothing`);
if (!pr) bad(`no pinch runner in ${GAMES} games: the check saw nothing`);
console.log(`lineup.check: ${GAMES} games, ${pitches} pitches, ${ph} pinch hitters, ${pr} pinch runners`);
if (problems.length) { console.error(problems.slice(0, 20).join('\n')); console.error(`lineup.check FAILED (${problems.length})`); process.exit(1); }
console.log('lineup.check OK');
