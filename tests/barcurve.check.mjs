/* Player bar curve and dots (#121, plain Node). render/barcurve.js on the frozen game (seed 704) and 40 simulated games:
 *   - one point per play, values 0..1, the game's own maximum is 1, deterministic, no later event changes an earlier point
 *   - one dot per scoring play, bigger (hr) for a home run, labels like `10 上・2 分砲`
 *   - seed 704: the curve is highest in innings 10 to 12; dots at the 1st-inning solo homer, both 2-run homers of the 10th, the 12th-inning sac fly
 * static.mjs runs this file. Usage: node tests/barcurve.check.mjs */
import { readFileSync } from 'node:fs';
import { simGame } from '../engine/index.js';
import { tensionTrack } from '../commentary/tension.js';
import { parseRecording } from '../league/recording.js';
import { barCurve, CV_FLOOR } from '../render/barcurve.js';

const problems = [], bad = m => { if (problems.length < 30) problems.push(m); };
const plays = g => g.ev.filter(e => e.k === 'P');
function checkGame(name, g) {
  const c = barCurve(g, tensionTrack), P = plays(g);
  if (JSON.stringify(c) !== JSON.stringify(barCurve(g, tensionTrack))) bad(`${name}: not deterministic`);
  if (c.pts.length !== P.length) bad(`${name}: ${c.pts.length} points for ${P.length} plays`);
  if (c.pts.some(p => !(p.v >= CV_FLOOR && p.v <= 1))) bad(`${name}: a value outside ${CV_FLOOR}..1`);
  if (Math.max(...c.pts.map(p => p.v)) !== 1) bad(`${name}: the maximum is not 1`);
  const scoring = P.filter(e => e.runs > 0);
  if (c.dots.length !== scoring.length) bad(`${name}: ${c.dots.length} dots for ${scoring.length} scoring plays`);
  c.dots.forEach((d, k) => { if (d.t !== scoring[k].t || d.hr !== (scoring[k].play?.res === 'HR') || !d.label.includes('・')) bad(`${name}: dot ${k} wrong`); });
  return c;
}
for (let seed = 1; seed <= 40; seed++) checkGame(`seed ${seed}`, simGame(seed, {}));

const g = parseRecording(readFileSync(new URL('../league/preseason/opening.json', import.meta.url), 'utf8')).game;
const c = checkGame('opening', g), P = plays(g);
const best = new Map();
c.pts.forEach((p, k) => { const inn = P[k].s0.inn; best.set(inn, Math.max(best.get(inn) || 0, p.v)); });
const peak = [...best].sort((a, b) => b[1] - a[1])[0][0];
if (peak < 10 || peak > 12) bad(`opening: the curve peaks in inning ${peak}, wanted 10 to 12`);
const labels = c.dots.map(d => (d.hr ? 'HR ' : '') + d.label);
for (const want of ['HR 1 上・陽春砲', 'HR 10 上・2 分砲', 'HR 10 下・2 分砲', '12 上・得 1 分']) if (!labels.includes(want)) bad(`opening: no dot "${want}" in ${labels.join(', ')}`);
if (c.dots.filter(d => d.hr).length !== 4) bad('opening: expected 4 home-run dots');

if (problems.length) { console.error('barcurve check FAILED:\n' + problems.join('\n')); process.exit(1); }
console.log(`barcurve check ok: 41 games, opening ${c.pts.length} points, ${c.dots.length} dots, peak inning ${peak}`);
