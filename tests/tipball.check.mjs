/* #631: the foul-tip ball path (render/tipball.js) is run, not read: it starts at the plate point, ends in the mitt, bends at the bat
 * (the direction changes there by a real angle), stays continuous, and a straight plate-to-mitt line is NOT the same path. */
import { tipPath, TIP_AT, TIP_SIDE, TIP_UP } from '../render/tipball.js';
const bad = [], ok = (c, m) => { if (!c) bad.push(m) };
const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
for (const side of [1, -1]) {
  const p0 = [.1, .9, 0], p1 = [-.05, 1.0, 1.1];
  ok(d(tipPath(p0, p1, side, 0), p0) < 1e-9, `side ${side}: starts at the plate point`);
  ok(d(tipPath(p0, p1, side, 1), p1) < 1e-9, `side ${side}: ends in the mitt at the catch time`);
  const k = tipPath(p0, p1, side, TIP_AT);
  ok(Math.abs(k[0] - p0[0] - side * TIP_SIDE) < 1e-9 && Math.abs(k[1] - p0[1] - TIP_UP) < 1e-9, `side ${side}: the bend is at the bat, off the straight line`);
  let prev = tipPath(p0, p1, side, 0), maxStep = 0;
  for (let i = 1; i <= 200; i++) { const q = tipPath(p0, p1, side, i / 200); maxStep = Math.max(maxStep, d(q, prev)); prev = q }
  ok(maxStep < 0.02, `side ${side}: path jumps ${maxStep.toFixed(3)} m between samples`);
  const a = tipPath(p0, p1, side, TIP_AT - .05), b = tipPath(p0, p1, side, TIP_AT + .05), c = tipPath(p0, p1, side, TIP_AT);
  const v1 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], v2 = [b[0] - c[0], b[1] - c[1], b[2] - c[2]];
  const cos = (v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]) / (Math.hypot(...v1) * Math.hypot(...v2));
  ok(cos < .95, `side ${side}: direction barely changes at the bat (cos ${cos.toFixed(3)})`);
}
if (bad.length) { console.error('tipball.check FAILED\n - ' + bad.join('\n - ')); process.exit(1) }
console.log('tipball.check ok');
