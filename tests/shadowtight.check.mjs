/* Tight key shadow on max (#211 item 2, plain Node). render/shadowtight.js is run, not read:
 *   - tightCenter stays on the field, is snapped to TIGHT_SNAP, is a pure function (same aim = same centre) and moves less than the aim does by one snap
 *   - the snapped centre never differs from the aim by more than half a snap inside the field
 *   - splitKey: on = the two parts add up to the key intensity; off = the wide light keeps all of it and the tight one is 0
 *   - the tight box has more texels per metre than the wide one (wide box 150 m on a 4096 map)
 * static.mjs runs this file. Usage: node tests/shadowtight.check.mjs */
import { TIGHT_HALF, TIGHT_SHARE, TIGHT_SNAP, FIELD_X, FIELD_Z, tightCenter, splitKey } from '../render/shadowtight.js';

const bad = []; const err = m => { if (bad.length < 30) bad.push(m); };
for (const [x, z] of [[0, -38], [-500, 900], [61.3, -131], [3.14159, -27.18], [-59.9, 19.9]]) {
  const [cx, cz] = tightCenter(x, z), [dx, dz] = tightCenter(x, z);
  if (cx !== dx || cz !== dz) err('tightCenter not deterministic');
  if (cx < FIELD_X[0] - 1e-9 || cx > FIELD_X[1] + 1e-9 || cz < FIELD_Z[0] - 1e-9 || cz > FIELD_Z[1] + 1e-9) err(`centre ${cx},${cz} off the field for aim ${x},${z}`);
  if (Math.abs(cx / TIGHT_SNAP - Math.round(cx / TIGHT_SNAP)) > 1e-9) err(`x ${cx} not on the snap grid`);
  const ix = Math.min(FIELD_X[1], Math.max(FIELD_X[0], x)); if (Math.abs(cx - ix) > TIGHT_SNAP / 2 + 1e-9) err(`snap moved x by ${Math.abs(cx - ix)}`);
}
if (tightCenter(10.01, -40.01)[0] !== tightCenter(10.02, -40.02)[0]) err('a 1 cm aim change moved the box (shimmer)');
const [w, t] = splitKey(3.5, true); if (Math.abs(w + t - 3.5) > 1e-9 || Math.abs(t - 3.5 * TIGHT_SHARE) > 1e-9) err(`split on ${w},${t}`);
const [w0, t0] = splitKey(3.5, false); if (w0 !== 3.5 || t0 !== 0) err(`split off ${w0},${t0}`);
if (2 * TIGHT_HALF * 3 > 150) err('tight box is not clearly tighter than the 150 m wide box (need >= 3x the texels per metre)');
if (bad.length) { console.log('shadowtight FAIL\n' + bad.join('\n')); process.exit(1); }
console.log(`shadowtight ok: box ${2 * TIGHT_HALF} m vs 150 m wide (${(150 / (2 * TIGHT_HALF)).toFixed(1)}x texels/m), share ${TIGHT_SHARE}`);
