// Rig change check (#185): the same random poses on two builds of the players (old and new players.js + players.b64.txt);
// every skinned vertex, the hand/head/back/pelvis sockets and the cap must land in the same place (gap under 0.1 mm).
// Usage: copy both players.js files into a folder that has `npm i three@0.186.1` (ESM resolves 'three/webgpu' from the file),
// then: node rig_check.mjs <old players.js> <old pack folder> <new players.js> <new pack folder>
// KICK=<bone index> turns that bone of the new rig by 0.3 rad, to see that the check does catch a change.
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import * as THREE from 'three/webgpu';
const ctx = new Proxy({}, { get: () => () => ({ width: 0 }), set: () => true });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
globalThis.fetch = async p => ({ text: async () => fs.readFileSync(p, 'utf8') });
const [oldJs, oldDir, newJs, newDir] = process.argv.slice(2);
const OLD = await import(pathToFileURL(path.resolve(oldJs)).href), NEW = await import(pathToFileURL(path.resolve(newJs)).href);
await OLD.loadPlayerAssets(oldDir + '/'); await NEW.loadPlayerAssets(newDir + '/');
const GAP_MAX = 1e-4;   // metres
let seed = 185; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
let worst = 0, worstSock = 0, nv = 0, poses = 0;
const v = new THREE.Vector3(), w = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
for (const role of ['batter', 'pitcher', 'fielder']) for (const build of ['normal', 'slim', 'power', 'heavy']) {
  const opts = { role, build, throws: 'R', glove: role !== 'batter', head: role === 'batter' ? 'helmet' : 'cap' };
  const P = [OLD.makePlayer(opts), NEW.makePlayer(opts)];
  if (!P[0].real || !P[1].real) throw new Error('not the real player');
  for (let k = 0; k < 6; k++) {
    const qs = Object.keys(P[0].rig).map(() => new THREE.Euler(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1)), sc = [.7 + rnd() * .4, .7 + rnd() * .4, .7 + rnd() * .4, .7 + rnd() * .4];
    for (const f of P) {
      Object.values(f.rig).forEach((o, i) => o.quaternion.setFromEuler(qs[i]));
      [f.rig.l0, f.rig.l1, f.rig.a0, f.rig.a1].forEach((o, i) => o.scale.y = sc[i]);
      f.g.position.set(1, 0, 2); f.g.rotation.y = .7; f.g.updateMatrixWorld(true);
    }
    if (process.env.KICK) { P[1].bones[+process.env.KICK].rotation.x = .3; P[1].g.updateMatrixWorld(true) }
    const [m0, m1] = P.map(f => f.mesh), n = m0.geometry.attributes.position.count;
    for (let i = 0; i < n; i++) {
      m0.getVertexPosition(i, v); m0.localToWorld(v); m1.getVertexPosition(i, w); m1.localToWorld(w);
      worst = Math.max(worst, v.distanceTo(w));
    }
    nv += n; poses++;
    for (const s of ['handL', 'handR', 'head', 'back', 'pelvis']) worstSock = Math.max(worstSock, P[0].sockets[s].getWorldPosition(a).distanceTo(P[1].sockets[s].getWorldPosition(b)));
    worstSock = Math.max(worstSock, P[0].cap.getWorldPosition(a).distanceTo(P[1].cap.getWorldPosition(b)));
  }
  if (P[1].bones.length !== P[0].bones.length + 8) throw new Error('new rig has ' + P[1].bones.length + ' bones');
}
console.log(`rigcheck: ${poses} random poses, ${nv} skinned vertices, worst vertex gap ${(worst * 1000).toFixed(4)} mm, worst socket/cap gap ${(worstSock * 1000).toFixed(4)} mm`);
if (worst > GAP_MAX || worstSock > GAP_MAX) { console.log('FAIL'); process.exit(1) }
