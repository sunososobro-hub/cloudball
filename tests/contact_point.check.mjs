/* #649: a swung-at ball leaves the bat where the pitch is. Runs render/game.js's own contactPt, pitchArc, arc and flyPath
 * (sliced out of the file, as render/tools/phys_audit.mjs does) and render/gb_path.js over SEEDS seeds, and fails when
 *   - the pitch path of a foul or a ball in play does not end on the contact point (pitchArc at t = 1),
 *   - the batted ball (air ball, grounder, foul) does not start there (jump at contact >= TOL m),
 *   - the contact point is not CONTACT_Z out in front of the plate spot or does not follow the pitch location (height, side).
 * static.mjs runs this file. Usage: node tests/contact_point.check.mjs */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { simGame } from '../engine/index.js';
import { gbPlan, gbPath } from '../render/gb_path.js';
import { onDirt } from '../render/dust.js';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEEDS = 40, TOL = .01, REL = [0, 1.8, -16.8];
const src = readFileSync(path.join(ROOT, 'render/game.js'), 'utf8');
const lerp = (x, y, t) => x + (y - x) * t, clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const slice = (from, to) => { const a = src.indexOf(from), b = to(a); if (a < 0 || b < a) { console.error(`contact_point: ${from} not found in render/game.js`); process.exit(2) } return src.slice(a, b) };
const { CONTACT_Z, contactPt } = new Function(slice('const CONTACT_Z=', a => src.indexOf('\n', a)) + ';return{CONTACT_Z,contactPt}')();
const { arc, pitchArc, pitchBreak } = new Function('lerp', slice('function arc(', () => src.indexOf('/* ---------- Fielding')) + ';return{arc,pitchArc,pitchBreak}')(lerp);
const flyPath = new Function('lerp', 'clamp', slice('const AIR_K=', a => src.indexOf('\n', src.indexOf('return t=>', a))) + ';return flyPath')(lerp, clamp);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const errs = [], bad = m => { if (errs.length < 20) errs.push(m) };
let n = 0, worst = 0; const spots = new Set();
for (let seed = 1; seed <= SEEDS; seed++) for (const e of simGame(seed, {}).ev) {
  if (e.k !== 'P' || e.bunt || !((e.r === 'inplay' && !e.play.bunt) || e.r === 'foul')) continue;
  const tag = `seed ${seed} t ${e.t}`, cp = contactPt(e), plate = [e.zx, .45 + e.zy * .75, .6];
  if (Math.abs(cp[0] - plate[0]) > 1e-9 || Math.abs(cp[1] - plate[1]) > 1e-9 || Math.abs(plate[2] - cp[2] - (.6 - CONTACT_Z)) > 1e-9) bad(`${tag}: contact point ${cp} is not in front of the plate spot ${plate}`);
  spots.add(cp.map(v => v.toFixed(2)).join());
  const end = pitchArc(REL, cp, .3, 1, pitchBreak(e.pt, [1, REL[1], REL[2]]));
  let start;
  if (e.r === 'foul') start = arc(cp, [e.foulDir * 24, 9, 22], 12, 0);
  else { const p = e.play, T = p.hang;
    if (p.type === 'GB') { const land = [p.lx, .15, p.lz], dirt = onDirt(p.lx, p.lz); start = gbPath(cp, land, T, 0, dirt, gbPlan(cp, land, T, dirt)) }
    else start = flyPath({ t: seed * 1e5 + e.t }, cp, [p.lx, 1.5, p.lz], T)(0) }
  const j = Math.max(dist(end, cp), dist(start, cp)); worst = Math.max(worst, j); n++;
  if (!(j < TOL)) bad(`${tag} (${e.r}): jump at contact ${j.toFixed(3)} m`);
}
if (n < 100) bad(`only ${n} swung-at balls in ${SEEDS} seeds`);
if (spots.size < n / 4) bad(`contact point barely follows the pitch: ${spots.size} distinct spots for ${n} balls`);
if (errs.length) { console.error('contact_point: FAIL\n  ' + errs.join('\n  ')); process.exit(1) }
console.log(`contact_point: ok (${n} fouls and balls in play, worst jump ${worst.toFixed(4)} m, ${spots.size} distinct contact spots)`);
