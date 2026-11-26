/* #281: planted-foot drift of the game's pitcher across the clip -> keyframe hand-off (PM_OUT), on the real rig.
 * Runs the real render/game.js pitch code (the block from `const kf=` up to `function arc(`, sliced out of the file and evaluated
 * with its few globals stubbed) on a render/players.js figure, in headless Chromium. No drawing, no GPU: only bone world positions.
 *   THREE_DIR=.../node_modules/three [PLAYWRIGHT=.../node_modules/playwright] node render/tools/pitch_handoff_probe.mjs [u0 u1]
 * Prints per foot the worst planted drift (cm, same rule as players.js rigFootDrift: ankle near the floor and slow) over u0..u1
 * (default PM_OUT widened by 0.2 s each side), plus the stride foot travel inside PM_OUT. Exit 1 when the worst drift > LIMIT_CM. */
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), TH = process.env.THREE_DIR || path.join(ROOT, 'node_modules/three');
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const LIMIT_CM = 7;   /* #281 acceptance (triage 2026-11-25) */
const [u0, u1] = process.argv.slice(2).map(Number);
const game = readFileSync(path.join(ROOT, 'render/game.js'), 'utf8'), a = game.indexOf('const kf='), b = game.indexOf('function arc(');
if (a < 0 || b < a) { console.error('pitch block not found in render/game.js'); process.exit(2) }
const BLOCK = game.slice(a, b);
const PAGE = `<!doctype html><script type="importmap">{"imports":{"three":"/three/build/three.webgpu.js","three/webgpu":"/three/build/three.webgpu.js","three/tsl":"/three/build/three.tsl.js"}}</script>
<script type="module">
import * as PL from '/render/players.js';
import { RELEASE } from '/engine/constants.js';
window.run = async (U0, U1) => {
  await PL.loadPlayerAssets('/assets/'); const c = await PL.loadClip('/assets/mocap/pitch_124_01.json');
  const P = PL.makePlayer({ jersey: 0xffffff, num: 1, build: 'normal', throws: 'R', glove: true, head: 'cap' }); P.setThrows && P.setThrows('R');
  const fielders = { P }, PR = P.rig, OFF = new Set(), window_ = { PL }, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t,
    sat01 = t => Math.max(0, Math.min(1, t)), ease = t => t * t * (3 - 2 * t);
  const api = new Function('fielders', 'PR', 'OFF', 'window', 'clamp', 'lerp', 'sat01', 'ease', 'RELEASE', 'CLIP',
    ${JSON.stringify(BLOCK)} + ';pitchClip=CLIP;pitchClipP=Promise.resolve(CLIP);return{pitchPose,PM_OUT,PM_BACK}')(fielders, PR, OFF, window_, clamp, lerp, sat01, ease, RELEASE, c);
  const lo = U0 ?? api.PM_OUT[0] - .2, hi = U1 ?? api.PM_OUT[1] + .2, dt = 1 / 60, nm = {}; P.g.traverse(o => { if (o.name === 'ftL' || o.name === 'ftR') nm[o.name] = o });
  const F = [];
  for (let u = lo; u <= hi + 1e-9; u += dt) {
    P.g.position.set(0, 0, 0); P.arms[1].rotation.x = 0; PR.up.rotation.set(0, 0, 0); PR.hg.rotation.set(0, 0, 0);
    api.pitchPose(u); P.g.updateMatrixWorld(true);
    F.push({ u, L: nm.ftL.getWorldPosition(new P.g.position.constructor()).toArray(), R: nm.ftR.getWorldPosition(new P.g.position.constructor()).toArray() });
  }
  const floor = Math.min(...F.map(f => Math.min(f.L[1], f.R[1]))), sc = .95 * (P.k || 1), py = PL.PLANT_Y * sc, pv = PL.PLANT_V * sc, out = { PM_OUT: api.PM_OUT, lo, hi };
  for (const s of ['L', 'R']) { let anc = null, mx = 0, at = 0;
    for (let i = 1; i < F.length; i++) { const p = F[i - 1][s], q = F[i][s], v = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) / dt;
      if (q[1] - floor < py && v < pv) { if (!anc) anc = q; const d = Math.hypot(q[0] - anc[0], q[2] - anc[2]); if (d > mx) { mx = d; at = F[i].u } } else anc = null }
    const inO = F.filter(f => f.u >= api.PM_OUT[0] && f.u <= api.PM_OUT[1]), t0 = inO[0][s], t1 = inO[inO.length - 1][s];
    out[s] = { plantedCm: +(mx * 100).toFixed(1), at: +at.toFixed(2), outTravelCm: +(Math.hypot(t1[0] - t0[0], t1[2] - t0[2]) * 100).toFixed(1),
      track: F.filter((_, i) => i % 6 === 0).map(f => [+f.u.toFixed(2), ...f[s].map(v => +v.toFixed(3))]) };
  }
  return out;
};
window.ready = true;
</script>`;
const br = await chromium.launch(), pg = await br.newPage(), errs = [];
pg.on('pageerror', e => errs.push(String(e))); pg.on('console', m => m.type() === 'error' && errs.push(m.text()));
await pg.route('**/*', r => {
  const u = new URL(r.request().url());
  if (u.pathname === '/probe.html') return r.fulfill({ body: PAGE, contentType: 'text/html' });
  const f = u.pathname.startsWith('/three/') ? path.join(TH, u.pathname.slice(7)) : path.join(ROOT, u.pathname);
  if (u.hostname !== 'local' || !existsSync(f)) return r.fulfill({ status: 404 });
  return r.fulfill({ path: f, contentType: f.endsWith('.js') ? 'application/javascript' : f.endsWith('.json') ? 'application/json' : 'text/plain' });
});
await pg.goto('http://local/probe.html'); await pg.waitForFunction(() => window.ready, null, { timeout: 60000 }).catch(() => {});
let res; try { res = await pg.evaluate(([x, y]) => window.run(x, y), [Number.isFinite(u0) ? u0 : null, Number.isFinite(u1) ? u1 : null]) }
catch (e) { console.error('probe failed:', e.message, errs.slice(0, 3)); await br.close(); process.exit(2) }
await br.close();
const verbose = process.env.VERBOSE;
for (const s of ['L', 'R']) { console.log(`${s}: planted drift ${res[s].plantedCm} cm at u ${res[s].at}, travel inside PM_OUT ${res[s].outTravelCm} cm`); if (verbose) console.log(JSON.stringify(res[s].track)) }
const worst = Math.max(res.L.plantedCm, res.R.plantedCm);
console.log(`pitch hand-off u ${res.lo.toFixed(2)}..${res.hi.toFixed(2)} (PM_OUT ${res.PM_OUT}): worst planted drift ${worst} cm (limit ${LIMIT_CM})`);
process.exit(worst > LIMIT_CM ? 1 : 0);
