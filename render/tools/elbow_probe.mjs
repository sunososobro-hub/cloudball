/* #124 r3 probe: where the skinned plate umpire's calling elbow ends up on the hammer, with the real players.js solver and the real
   aimArm / aimArmPole / UC_* lines of render/game.js (cut out of the classic script, nothing copied by hand).
   Run: npm i three@0.186.1 somewhere, then THREE_DIR=<that>/node_modules/three node render/tools/elbow_probe.mjs
   Prints shoulder, elbow, hand in the upper-body frame (+x his right, y up, +z forward) without and with the pole; exits 1 when the
   poled elbow is not out to the side at shoulder height (|elbow y - shoulder y| > .06 m, elbow x - shoulder x < .22 m, |elbow z| > .06 m). */
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const TD = process.env.THREE_DIR; if (!TD) { console.error('set THREE_DIR to node_modules/three (three@0.186.1)'); process.exit(2) }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
register('data:text/javascript,' + encodeURIComponent(`const T=${JSON.stringify(pathToFileURL(path.resolve(TD)).href)};
export async function resolve(s,c,n){if(s==='three/webgpu')return{url:T+'/build/three.webgpu.js',shortCircuit:true};if(s==='three')return{url:T+'/build/three.module.js',shortCircuit:true};return n(s,c)}`));
/* players.js draws number canvases at build time: a do-nothing 2D context is enough for joint positions */
const ctx = new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : /ImageData$/.test(k) ? (w = 128, h = 128) => ({ data: new Uint8ClampedArray(4 * w * h), width: w, height: h }) : /Gradient$/.test(k) ? () => ({ addColorStop() {} }) : () => {}, set: () => true });
globalThis.document = { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx, toDataURL: () => '' }) };
globalThis.window = globalThis;
const THREE = await import('three/webgpu');
const { makePlayer } = await import(pathToFileURL(path.join(ROOT, 'render/players.js')).href);
const src = readFileSync(path.join(ROOT, 'render/game.js'), 'utf8');
const cut = re => { const m = src.match(re); if (!m) { console.error('not found in game.js:', re); process.exit(2) } return m[0] };
const code = [/const BAT_LOAD_LEAD=[^\n]*\n/, /const _bv=new THREE[^\n]*\n/, /function aimArm\([^\n]*\n/, /const ARM_S_MIN=[^\n]*\n/, /const _pq=new THREE[^\n]*\n/,
  /function aimArmPole\([^\n]*\n[^\n]*\n/, /const UC_K_TURN=[^\n]*\n/, /const UC_HAMMER_POLE=[^\n]*\n/].map(cut).join('');
const G = new Function('THREE', 'window', code + 'return{aimArm,aimArmPole,BAT_SHOULDER_X,UC_HAMMER,UC_HAMMER_POLE}')(THREE, { PL: 1 });
const f = makePlayer({}), R = f.rig, at = n => { let b; f.g.traverse(o => { if (o.isBone && o.name === n) b = o }); const v = b.getWorldPosition(new THREE.Vector3()); R.up.worldToLocal(v); return v };
const show = v => v.toArray().map(x => x.toFixed(3)).join(' ');
const run = pole => { const [x, y, z] = G.UC_HAMMER; pole ? G.aimArmPole(R.a1, G.BAT_SHOULDER_X, x, y, z, G.UC_HAMMER_POLE, 1) : G.aimArm(R.a1, G.BAT_SHOULDER_X, x, y, z);
  f.g.updateMatrixWorld(true); const s = at('shR'), e = at('elR'), h = at('handR'); console.log(`${pole ? 'pole ' : 'plain'}  shoulder ${show(s)}  elbow ${show(e)}  hand ${show(h)}`); return { s, e, h } };
run(false); const { s, e } = run(true);
const bad = Math.abs(e.y - s.y) > .06 || e.x - s.x < .22 || Math.abs(e.z) > .06;
console.log(bad ? 'FAIL: hammer elbow not out at shoulder height' : 'ok: hammer elbow out to the side at shoulder height'); process.exit(bad ? 1 : 0);
