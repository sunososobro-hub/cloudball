/* #650: glove-hand-to-ball distance at the catch, on the real rig. Runs the game's own `reachGlove` (+ crouch, aimWorld, aimArm; sliced out of
 * render/game.js and evaluated with its few globals stubbed) on a render/players.js figure of each build, in headless Chromium. No drawing, no GPU.
 * The ball sits CATCH_SIDE m beside the figure (as the engine stream places it at catchT) and CATCH_FWD in front, at heights .2..2.2 m.
 *   THREE_DIR=.../node_modules/three [PLAYWRIGHT=.../node_modules/playwright] node render/tools/catch_reach_probe.mjs
 * Prints p50 / p95 / max (cm) per build and per ball height. Exit 1 when the worst miss at .2-2.2 m is over LIMIT_CM (#650 acceptance). */
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), TH = process.env.THREE_DIR || path.join(ROOT, 'node_modules/three');
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const LIMIT_CM = 15, CATCH_SIDE = [-.4, 0, .4], CATCH_FWD = .35, HEIGHTS = [.2, .4, .6, .8, 1, 1.2, 1.4, 1.6, 1.8, 2, 2.2], BUILDS = ['slim', 'normal', 'power', 'heavy'];
const game = readFileSync(path.join(ROOT, 'render/game.js'), 'utf8');
const grab = re => { const m = game.match(re); if (!m) { console.error('not found in game.js:', re); process.exit(2) } return m[0] };
const BLOCK = [
  grab(/const BAT_LOAD_LEAD=[^;\n]*;/), grab(/const _bv=new THREE\.Vector3\(\)[^\n]*\n/), grab(/const ARM_S_MIN=[^\n]*\n/), grab(/const [^\n]*LEG_LEN=[^;\n]*;/),
  'const _tv=new THREE.Vector3();', grab(/const CHEST=[^\n]*\n/), grab(/function aimArm\(a[^\n]*\n/), grab(/function aimWorld\([^\n]*\n/), grab(/function crouch\([^\n]*\n/), grab(/const CATCH_CROUCH_TOP=[^\n]*\n/), grab(/const CATCH_STEP_MAX=[^\n]*\n/), grab(/function reachGlove\(f,w\)\{[\s\S]*?\n  aimArm\(R\.a1[^\n]*\n/),
].join('\n');
const PAGE = `<!doctype html><script type="importmap">{"imports":{"three":"/three/build/three.webgpu.js","three/webgpu":"/three/build/three.webgpu.js","three/tsl":"/three/build/three.tsl.js"}}</script>
<script type="module">
import * as THREE from 'three';
import * as PL from '/render/players.js';
window.run = async (BUILDS, SIDE, FWD, HEIGHTS) => {
  await PL.loadPlayerAssets('/assets/');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), window_ = { PL };
  const api = new Function('THREE', 'window', 'clamp', ${JSON.stringify(BLOCK)} + ';return{reachGlove}')(THREE, window_, clamp);
  const rows = [];
  for (const build of BUILDS) {
    const f = PL.makePlayer({ jersey: 0xffffff, num: 1, build, throws: 'R', glove: true, head: 'cap' }), R = f.rig;
    for (const h of HEIGHTS) for (const x of SIDE) {
      f.g.position.set(0, 0, 0); f.g.rotation.set(0, 0, 0); R.l0.rotation.set(0, 0, 0); R.l1.rotation.set(0, 0, 0); R.l0.scale.y = R.l1.scale.y = 1; R.up.rotation.set(0, 0, 0); R.hg.rotation.set(0, 0, 0);
      const w = [x, h, FWD]; api.reachGlove(f, w); f.g.updateMatrixWorld(true);
      const q = f.handWorld(0); rows.push({ build, h, x, d: Math.hypot(q.x - w[0], q.y - w[1], q.z - w[2]) * 100 });
    }
  }
  return rows;
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
let rows; try { rows = await pg.evaluate(a => window.run(...a), [BUILDS, CATCH_SIDE, CATCH_FWD, HEIGHTS]) }
catch (e) { console.error('probe failed:', e.message, errs.slice(0, 3)); await br.close(); process.exit(2) }
await br.close();
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] }, fmt = a => `p50 ${pct(a, .5).toFixed(1)}  p95 ${pct(a, .95).toFixed(1)}  max ${Math.max(...a).toFixed(1)} cm`;
if (process.env.DETAIL) for (const r of rows.filter(r => r.build === "slim")) console.log("D", r.h, r.x, r.d.toFixed(1));
for (const b of BUILDS) console.log(b.padEnd(7), fmt(rows.filter(r => r.build === b).map(r => r.d)));
for (const h of HEIGHTS) console.log(`h ${h.toFixed(1)} m`.padEnd(9), fmt(rows.filter(r => r.h === h).map(r => r.d)));
const worst = Math.max(...rows.map(r => r.d)), w = rows.find(r => r.d === worst);
console.log(`worst ${worst.toFixed(1)} cm (${w.build}, h ${w.h}, x ${w.x}); limit ${LIMIT_CM}`);
process.exit(worst > LIMIT_CM ? 1 : 0);
