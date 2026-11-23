/* How tall is a player's head on screen in each camera? (#151 item 3: is a face ever bigger than ~40 px at 1080p?)
 * Pure math, no browser: reads SEATS / HITCAM / HFOV_MAX straight out of render/game.js and the fielder spots from the engine,
 * projects the chin and the cap top of every player standing at his usual spot, and prints the head height in screen pixels.
 *   node render/tools/head_px.mjs            1920x1080
 *   node render/tools/head_px.mjs 2532 1170  any other screen (device pixels; e.g. a phone held sideways)
 * The numbers are for a player standing still where the play starts (batter in the box, fielders at their spots, runner on a base);
 * a player who runs toward a camera gets bigger for a moment. A head that is off screen or behind the camera prints "-". */
import { readFileSync } from 'node:fs';
import { FIELD_SPOTS, spotXZ, BASES } from '../../engine/rules/field.js';

const W = +(process.argv[2] || 1920), H = +(process.argv[3] || 1080), aspect = W / H;
const src = readFileSync(new URL('../game.js', import.meta.url), 'utf8');
const num = n => { const m = src.match(new RegExp(`\\b${n}=(-?[\\d.]+)`)); if (!m) throw new Error(`${n} not found in game.js`); return +m[1]; };
const grab = n => { const m = src.match(new RegExp(`const ${n}=(\\[[\\s\\S]*?\\]|\\{[^;]*?\\});`)); if (!m) throw new Error(`${n} not found in game.js`); return m[1]; };
const pl = readFileSync(new URL('../players.js', import.meta.url), 'utf8');   /* players.js imports three: read its numbers as text */
const REF_H = +pl.match(/REF_H = ([\d.]+)/)[1], NORMAL_H = +pl.match(/normal: \{[^}]*?h: ([\d.]+)/)[1];
const K = Object.fromEntries(['OF_BASE', 'FRONT_H', 'OF_SEAT_ROW', 'ROW_RISE', 'ROW_D', 'OF_R', 'HFOV_MAX'].map(n => [n, num(n)]));
const SEATS = Function(...Object.keys(K), `return ${grab('SEATS')}`)(...Object.values(K));
const HITCAM = Function(`return ${grab('HITCAM')}`)();
const ZOOM = +src.match(/zoomed\?bf\*([\d.]+)/)[1];
const fitFov = f => Math.min(f, 2 * Math.atan(Math.tan(K.HFOV_MAX * Math.PI / 360) / aspect) * 180 / Math.PI);

/* Head of a standard build: chin and cap top in unscaled body coordinates (headK in players.js runs 1.635 .. 1.875) */
const S = NORMAL_H / REF_H, CHIN = 1.635 * S, TOP = 1.875 * S + .02 /* cap crown */;
const who = { 打者: [-.9, .15, [1, 0]], 捕手: [0, 1.3, [0, -1]] };
for (const k of ['P', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF']) { const [x, z] = spotXZ(...FIELD_SPOTS[k]); who[k] = [x, z, [-x, -z]]; }
who['一壘跑者'] = [BASES[1][0] - 3, BASES[1][1] - 3, [1, -1]];
const NAME = { P: '投手', '1B': '一壘手', '2B': '二壘手', SS: '游擊手', '3B': '三壘手', LF: '左外野', CF: '中外野', RF: '右外野' };

const cams = [
  ['轉播鏡頭 (default)', SEATS[3], { cam: true }],
  ['轉播鏡頭 + 望遠鏡', SEATS[3], { cam: true, zoom: true }],
  ['轉播鏡頭 tight shot (#158, first pitch of a PA)', { ...SEATS[3], tx: -.9, ty: num('TIGHT_AIM_Y'), tz: .15, fov: num('TIGHT_FOV') }, { cam: true }],
  ['擊球後轉播 (HITCAM)', { ...HITCAM, tx: HITCAM.mid[0], ty: HITCAM.mid[1], tz: HITCAM.mid[2], cam: true }, {}],
  ['跟球鏡頭 (seat 4, ball at the pitcher)', SEATS[4], { follow: true }],
  ['本壘高空 (seat 5)', SEATS[5], {}],
  ['本壘後方 (seat 0)', SEATS[0], {}],
  ['本壘後方 + 望遠鏡, aimed at the batter', { ...SEATS[0], tx: -.9, ty: 1.4, tz: .15 }, { zoom: true }],
  ['一壘內野 (seat 1)', SEATS[1], {}],
  ['外野看台 (seat 2)', SEATS[2], {}],
];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], nrm = a => { const l = Math.hypot(...a); return a.map(v => v / l); };
const rows = [];
for (const [label, s, o] of cams) {
  const eye = [s.x, s.y + (s.cam || o.cam ? 0 : 1.25), s.z];
  let fov = s.fov;
  if (o.follow) { const d = Math.hypot(s.tx - s.x, s.tz - s.z); fov = Math.min(40, Math.max(16, 2 * Math.atan(14 / Math.max(d, 8)) * 180 / Math.PI)); }
  if (o.zoom) fov *= ZOOM;
  fov = fitFov(fov);
  const f = nrm(sub([s.tx, s.ty, s.tz], eye)), r = nrm(cross(f, [0, 1, 0])), u = cross(r, f), t = Math.tan(fov * Math.PI / 360);
  const proj = p => { const v = sub(p, eye), z = dot(v, f); if (z <= .1) return null; return [dot(v, r) / z / (t * aspect), dot(v, u) / z / t]; };
  const cells = {};
  for (const [n, [x, z, fd]] of Object.entries(who)) {
    const a = proj([x, CHIN, z]), b = proj([x, TOP, z]);
    if (!a || !b || Math.abs(a[0]) > 1 || Math.abs(a[1]) > 1) { cells[n] = '-'; continue; }
    const px = Math.round((b[1] - a[1]) * H / 2), toCam = nrm(sub(eye, [x, 1.7, z])), fl = Math.hypot(...fd);
    const facing = (fd[0] * toCam[0] + fd[1] * toCam[2]) / fl / Math.hypot(toCam[0], toCam[2]);
    cells[n] = `${px}${facing > .3 ? '' : facing < -.3 ? 'b' : 's'}`;   /* b = back of the head, s = side */
  }
  rows.push([`${label}  fov ${fov.toFixed(1)}`, cells]);
}
const names = Object.keys(who);
console.log(`head height in px at ${W}x${H} (b = back of the head to the camera, s = side, - = off screen); >= 40 px marked *`);
console.log(['camera', ...names.map(n => NAME[n] || n)].join(' | '));
for (const [l, c] of rows) console.log([l, ...names.map(n => (parseInt(c[n]) >= 40 ? '*' : '') + c[n])].join(' | '));
const best = Math.max(...rows.flatMap(([, c]) => Object.values(c).map(v => parseInt(v) || 0)));
console.log(`largest head: ${best} px`);
