/* Bat let go when the batter sets off (#43 items 2-3, plain Node). render/batdrop.js is run, not read:
 *   - kinds over real engine games: every home run is a 'flip', other balls in play a 'toss', walks / HBP a 'lay', strikeouts and
 *     non-PA pitches null; release = the batter's engine st0
 *   - the flight starts at the release point, ends lying on the dirt on the landing spot, never goes under the dirt, peaks at
 *     release height + peak, and turns a whole number of times (lands flat)
 *   - the lying bat (handle to barrel) keeps >= .5 m from the catcher, the plate umpire's give-way spot and BAT_FROM, both sides
 *   - same input = same output (pure in time: a seek shows what playing there shows)
 * static.mjs runs this file. Usage: node tests/batdrop.check.mjs */
import { simGame } from '../engine/index.js';
import { BAT_KINDS, BAT_REST_Y, BAT_LEN, batKind, batRelease, batLand, batFlight, batFlightT } from '../render/batdrop.js';

const problems = [], bad = m => { if (problems.length < 30) problems.push(m); };
const count = { flip: 0, toss: 0, lay: 0, none: 0 };
for (let seed = 1; seed <= 30; seed++) for (const e of simGame(seed, {}, {}).ev) {
  const k = batKind(e), runs = e.k === 'P' && (e.moves || []).some(m => m[0] === 0);
  count[k || 'none']++;
  if (!runs) { if (k) bad(`seed ${seed}: kind ${k} for an event where the batter does not run`); continue; }
  const want = e.r === 'inplay' ? (e.play.res === 'HR' ? 'flip' : 'toss') : 'lay';
  if (k !== want) bad(`seed ${seed}: ${e.r}/${e.play && e.play.res} gave ${k}, want ${want}`);
  if (batRelease(e) !== e.moves.find(m => m[0] === 0)[3].st0) bad(`seed ${seed}: release is not the engine st0`);
  if (e.d !== undefined && batRelease(e) + batFlightT(k, 1.6) > e.d) bad(`seed ${seed}: the bat is still in the air when the event ends`);
}
if (!count.flip || !count.toss || !count.lay || !count.none) bad(`a kind never happens in 30 games: ${JSON.stringify(count)}`);

const AVOID = [[0, 1.3, 'catcher'], [2, 2.1, 'umpire give-way'], [2.6, 1, 'BAT_FROM']];
for (const k of Object.keys(BAT_KINDS)) for (const side of [-1, 1]) for (const p0 of [[side * .6, 1.0, .3], [side * .3, 1.6, -.2], [side * 1.1, .7, .5]]) {
  const T = batFlightT(k, p0[1]), L = batLand(k, side), a = batFlight(k, p0, side, 0), z = batFlight(k, p0, side, T + 3);
  if (Math.hypot(a.p[0] - p0[0], a.p[1] - p0[1], a.p[2] - p0[2]) > 1e-9) bad(`${k}: does not start at the release point`);
  if (!z.done || z.s !== 1 || Math.abs(z.p[1] - BAT_REST_Y) > 1e-9 || Math.abs(z.p[0] - L.x) > 1e-9 || Math.abs(z.p[2] - L.z) > 1e-9) bad(`${k} side ${side}: does not end lying on its spot`);
  if (Math.abs(z.spin / (2 * Math.PI) - Math.round(z.spin / (2 * Math.PI))) > 1e-9) bad(`${k}: lands mid-turn`);
  let top = -1;
  for (let t = 0; t <= T + .5; t += .01) { const f = batFlight(k, p0, side, t); if (f.p[1] < BAT_REST_Y - 1e-9) bad(`${k}: under the dirt at ${t}`); top = Math.max(top, f.p[1]);
    if (JSON.stringify(f) !== JSON.stringify(batFlight(k, p0, side, t))) bad(`${k}: not pure in time`); }
  if (Math.abs(top - (p0[1] + BAT_KINDS[k].peak)) > .02) bad(`${k}: peak ${top.toFixed(2)}, want ${(p0[1] + BAT_KINDS[k].peak).toFixed(2)}`);
  for (const [ax, az, who] of AVOID) for (let s = 0; s <= 1; s += .1) {
    const bx = L.x + Math.sin(L.head) * BAT_LEN * s, bz = L.z + Math.cos(L.head) * BAT_LEN * s, d = Math.hypot(bx - side * ax, bz - az);
    if (d < .5) { bad(`${k} side ${side}: lying bat ${d.toFixed(2)} m from the ${who}`); break; }
  }
  if (Math.sign(L.x) !== side || Math.abs(L.x) <= .9) bad(`${k} side ${side}: lands on the plate side of the box`);
}
if (problems.length) { console.log('batdrop FAIL\n' + problems.join('\n')); process.exit(1); }
console.log(`batdrop ok: 30 games, ${count.flip} flips, ${count.toss} tosses, ${count.lay} lays, ${count.none} without; flight HR from 1.6 m ${batFlightT('flip', 1.6).toFixed(2)} s`);
