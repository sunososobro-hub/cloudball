/* 九宮格棒球 3D field (#543): the same picture as field.js, as a three.js scene in the look of the owner prototype (ui/ref/baseball_9grid/:
 * green park, dirt diamond, low-poly figures, dusk sky). It only READS what field.js already scripts (`buildBeats` / `ballAt` / `runnerAt`),
 * so the beats, skip and 1x / 3x are the same and no rule or result changes (rule 10); nothing here uses a random number.
 * three.js is the one the page's import map loads (`three/webgpu`, same build as agent.html); no second copy, no build step (rule 22).
 * `createField3D(canvas, THREE)` is async (the renderer starts up) and returns null when there is no THREE or no renderer, so the caller
 * falls back to the canvas 2D field. `openField` does that fallback. Units as ball.js; world x is mirrored so first base is on the right. */
import { BASES } from './play.js';
import { fenceR, POS_N } from './ball.js';
import { buildBeats, ballAt, runnerAt, createField, SPEEDS, BEAT_S, PITCH_S } from './field.js';

export const CAM = { fov: 50, pos: [0, 30, -36], look: [0, 0, 50] };   // behind home plate, high enough to see the fence
export const TRAIL_N = 24;                                            // ball trail points
export const FENCE_ARC = Math.PI / 4;                                 // fence drawn from -45 to +45 degrees
export const FENCE_SEGS = 24;
export const FENCE_H = 3;
export const COL = { sky: 0x0d1b2a, grass: 0x3d9c4a, grass2: 0x46a853, dirt: 0xc28a57, white: 0xf3f3ee, wall: 0x1f5f3d, top: 0xffc84a, mine: 0x4f9bff, foe: 0xff5b48, bat: 0xe9b949, run: 0x8fd3ff, out: 0xdc5050, skin: 0xe8c39e };
export const BATTER_X = -1.3;                                         // the batter stands beside the plate
export const FIELDER_PANTS = COL.white;
/** #563 part 1: yaw that turns a render/ body (front = +z) from (x0, z0) toward (x1, z1). */
export const faceYaw = (x0, z0, x1, z1) => Math.atan2(x1 - x0, z1 - z0);

/** #563 part 2: the pitcher's windup and the batter's swing, from the recorded mocap clips render/ plays (assets/mocap, render/game.js PM_* / SW_*).
 *  Pure: they only turn the scripted time into a clip time and a weight; the result and the ball stay the beats' (rule 10), no random numbers.
 *  Scripted time t is 0 at ball release; the windup plays in the WINDUP_S before it. */
export const WINDUP_S = 1;
export const PITCH_CLIP_URL = 'assets/mocap/pitch_124_01.json', SWING_CLIP_URL = 'assets/mocap/swing_124_07.json';
export const PM = { rel: 111 / 30, end: 4.6, start: 1.2, inS: .25, out: [.5, .9] };       // pitch clip: release frame 111 at 30 fps, hips travel measured from 1.2 s
export const SW = { contact: 85 / 30, start: 1.6, end: 3.6, inS: .4, lead: .8, out: [.6, 1.1], outHit: [.2, .35] };   // swing clip: contact frame 85
const sat = x => Math.max(0, Math.min(1, x)), ease = x => x * x * (3 - 2 * x);
/** Pitcher: {ct, w} (clip time, weight 0..1) at scripted time t; w = 0 outside the windup. */
export function pitchAct(t) {
  const w = Math.min(ease(sat((t + WINDUP_S) / PM.inS)), 1 - ease(sat((t - PM.out[0]) / (PM.out[1] - PM.out[0]))));
  return { ct: Math.max(PM.start, Math.min(PM.end, PM.rel + t)), w };
}
/** Batter: the result kinds that swing (whiff, foul, contact, popup, a ball in play); a take, a ball and a bunt do not use this clip. */
export const swings = out => { const k = out && out.res && out.res.kind; return k === 'whiff' || k === 'foul' || k === 'contact' || k === 'popup' || (!!(out && out.play) && !out.play.bunt && k !== 'bunt' && k !== 'foulBunt'); };
/** Batter: {ct, w} at scripted time t (ball reaches the plate at PITCH_S); `hit` = a ball in play (the swing lets go sooner). */
export function swingAct(t, hit) {
  const a = PITCH_S - SW.lead - SW.inS, o = hit ? SW.outHit : SW.out;
  const w = Math.min(ease(sat((t - a) / SW.inS)), 1 - ease(sat((t - PITCH_S - o[0]) / (o[1] - o[0]))));
  return { ct: Math.max(SW.start, Math.min(SW.end, SW.contact + (t - PITCH_S))), w };
}

/** Cached tiny materials + mesh helper bound to one THREE. */
function kit(THREE) {
  const M = {}, mat = (c, o = {}) => M[c + JSON.stringify(o)] || (M[c + JSON.stringify(o)] = new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .85 }, o)));
  const mesh = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); return o; };
  return { mat, mesh };
}

/** A low-poly figure (legs, body, head, cap) in a team colour; `scale` 1 = a 1.8 m player. */
function figure(THREE, K, color) {
  const g = new THREE.Group(), tm = K.mat(color);
  for (const s of [-1, 1]) g.add(K.mesh(new THREE.CylinderGeometry(.1, .09, .8, 8), K.mat(COL.white), s * .13, .4, 0));
  g.add(K.mesh(new THREE.CylinderGeometry(.27, .33, .62, 10), tm, 0, 1.1, 0));
  g.add(K.mesh(new THREE.SphereGeometry(.22, 10, 8), K.mat(COL.skin), 0, 1.62, 0));
  g.add(K.mesh(new THREE.CylinderGeometry(.23, .23, .1, 10), tm, 0, 1.78, 0));
  return g;
}

/** Builds the static park into `scene`: grass, dirt, infield, mound, plate, bases, foul lines, fence. */
export function buildPark(THREE, scene, K = kit(THREE)) {
  const flat = (geo, c, x, y, z) => { const m = K.mesh(geo, K.mat(c), x, y, z); m.rotation.x = -Math.PI / 2; scene.add(m); return m; };
  flat(new THREE.CircleGeometry(160, 48), COL.grass, 0, 0, 40);
  flat(new THREE.CircleGeometry(29, 40, Math.PI / 4, Math.PI / 2), COL.dirt, 0, .02, 0);
  flat(new THREE.PlaneGeometry(23.5, 23.5), COL.grass2, 0, .03, 19.4).rotation.z = Math.PI / 4;
  flat(new THREE.CircleGeometry(4, 24), COL.dirt, 0, .035, 0);
  scene.add(K.mesh(new THREE.CylinderGeometry(2.6, 3, .25, 20), K.mat(COL.dirt), -POS_N[0][0], .12, POS_N[0][1]));
  scene.add(K.mesh(new THREE.BoxGeometry(.6, .05, .15), K.mat(COL.white), -POS_N[0][0], .26, POS_N[0][1]));
  for (const b of BASES.slice(1, 4)) scene.add(K.mesh(new THREE.BoxGeometry(.6, .1, .6), K.mat(COL.white), -b[0], .07, b[1]));
  scene.add(K.mesh(new THREE.CylinderGeometry(.33, .33, .04, 5), K.mat(COL.white), 0, .05, .15));
  for (const s of [-1, 1]) { const l = K.mesh(new THREE.BoxGeometry(.12, .02, 120), K.mat(COL.white), -s * Math.sin(FENCE_ARC) * 60, .04, Math.cos(FENCE_ARC) * 60); l.rotation.y = -s * FENCE_ARC; scene.add(l); }
  let prev = null;
  for (let i = 0; i <= FENCE_SEGS; i++) {
    const a = -FENCE_ARC + (2 * FENCE_ARC) * i / FENCE_SEGS, r = fenceR(a), p = [r * Math.sin(a), r * Math.cos(a)];
    if (prev) { const dx = p[0] - prev[0], dz = p[1] - prev[1], len = Math.hypot(dx, dz) + .2, mx = (p[0] + prev[0]) / 2, mz = (p[1] + prev[1]) / 2;
      const w = K.mesh(new THREE.BoxGeometry(.4, FENCE_H, len), K.mat(COL.wall), -mx, FENCE_H / 2, mz); w.rotation.y = Math.atan2(-dx, dz); scene.add(w);
      const t = K.mesh(new THREE.BoxGeometry(.45, .15, len), K.mat(COL.top), -mx, FENCE_H + .05, mz); t.rotation.y = w.rotation.y; scene.add(t); }
    prev = p;
  }
}

/** The 3D field. -> Promise<{play(out), skip(), setSpeed(n), dispose()} | null>.
 *  `opts.PL` = the render/players.js module (#563 part 1): bodies come from its `makePlayer` (the broadcast bodies); without it (tests, load failure) the low-poly figure stays. */
export async function createField3D(canvas, THREE, opts = {}) {
  if (!canvas || !THREE || typeof THREE.WebGPURenderer !== 'function') return null;
  let renderer; try { renderer = new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL: !!opts.forceWebGL }); await renderer.init(); } catch (e) { return null; }
  const W = canvas.width || 360, H = canvas.height || 270, K = kit(THREE), scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(CAM.fov, W / H, .1, 600);
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  scene.background = new THREE.Color(COL.sky); cam.position.set(...CAM.pos); cam.lookAt(...CAM.look);
  scene.add(new THREE.HemisphereLight(0xd6e6ff, 0x2c4a2c, .9)); const sun = new THREE.DirectionalLight(0xffffff, .8); sun.position.set(-30, 70, -25); scene.add(sun);
  buildPark(THREE, scene, K);
  const wx = x => -x, PL = opts.PL && typeof opts.PL.makePlayer === 'function' ? opts.PL : null;   // core x -> world x (first base on the right)
  const figs = new WeakMap();   // body group -> its render/ figure (has setMocap)
  const body = (color, o = {}) => { if (!PL) return figure(THREE, K, color);
    try { const jm = K.mat(color); const f = PL.makePlayer({ jersey: jm, pants: K.mat(FIELDER_PANTS), sock: jm, glove: !!o.glove, head: o.head || 'cap', role: o.role, throws: 'R' }); figs.set(f.g, f); return f.g; } catch (e) { return figure(THREE, K, color); } };
  const place = (g, x, z, tx, tz) => { g.position.set(x, 0, z); if (PL && g.rotation) g.rotation.y = faceYaw(x, z, tx, tz); scene.add(g); return g; };
  let pitcher = null;
  POS_N.forEach((p, i) => { if (i === 1) return; const g = place(body(COL.foe, { glove: true }), wx(p[0]), p[1], 0, 0); if (i === 0) pitcher = g; });   // index 1 = catcher, stands behind the plate below; fielders face the plate
  const catcher = place(body(COL.foe, { glove: true, head: 'helmet' }), 0, -1.6, 0, POS_N[0][1]);
  const batter = place(body(COL.bat, { head: 'helmet', role: 'batter' }), wx(BATTER_X), .2, 0, .2);
  const ball = K.mesh(new THREE.SphereGeometry(.4, 10, 8), K.mat(0xffffff, { emissive: 0x444444 })), shadow = K.mesh(new THREE.CircleGeometry(.5, 12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .35 }));
  shadow.rotation.x = -Math.PI / 2; ball.visible = shadow.visible = false; scene.add(ball, shadow);
  const tpos = new Float32Array(TRAIL_N * 3), tgeo = new THREE.BufferGeometry(); tgeo.setAttribute('position', new THREE.BufferAttribute(tpos, 3));
  const trail = new THREE.Line(tgeo, new THREE.LineBasicMaterial({ color: 0xf1efe6, transparent: true, opacity: .6 })); trail.frustumCulled = false; scene.add(trail);
  let wrap = null, beatEl = null;
  if (typeof document !== 'undefined' && canvas.parentNode && canvas.replaceWith) {            // the beat text is a DOM overlay (a canvas can't have both)
    wrap = document.createElement('div'); wrap.className = 'fwrap'; canvas.replaceWith(wrap); wrap.append(canvas);
    beatEl = document.createElement('div'); beatEl.className = 'fbeat'; beatEl.setAttribute('role', 'status'); wrap.append(beatEl); }
  let S = null, runners = [], t0 = 0, speed = SPEEDS[0], raf = 0, trailN = 0, lastBeat = '';
  const showBeat = txt => { if (beatEl && txt !== lastBeat) { beatEl.textContent = txt; lastBeat = txt; } };
  const clearRunners = () => { for (const r of runners) scene.remove(r.fig); runners = []; };
  const draw = () => renderer.render(scene, cam);
  // #563 part 2: mocap acts (pitcher windup, batter swing); clips load once, without them the bodies just stand as in part 1
  const clips = {}, loadAct = (k, url) => { if (!clips[k] && PL && PL.loadClip) { clips[k] = 0; PL.loadClip(url).then(c => { clips[k] = c; }).catch(() => { /* no clip: no act */ }); } };
  const fp = pitcher && figs.get(pitcher), fb = figs.get(batter), setAct = (f, c, ct, w, t0, mir) => { if (f && f.setMocap && c) f.setMocap(c, ct, w, mir, t0, 0); };
  const clearActs = () => { for (const f of [fp, fb]) if (f && f.setMocap) f.setMocap(null, 0, 0); };
  const acts = t => {
    if (!S) return;
    if (fp && clips.pitch) { const a = pitchAct(t); setAct(fp, clips.pitch, a.ct, a.w, PM.start, !!fp.mirrored); }
    if (fb && clips.swing && S.swing) { const a = swingAct(t, S.hit); setAct(fb, clips.swing, a.ct, a.w, SW.start, false); }
  };
  function frame(now) {
    const t = ((now - t0) / 1000) * speed - WINDUP_S, p = ballAt(S, t);
    if (p) { ball.visible = shadow.visible = true; ball.position.set(wx(p.x), Math.max(p.y, .4), p.z); shadow.position.set(wx(p.x), .05, p.z); shadow.scale.setScalar(Math.max(.4, 1.4 - p.y / 40));
      if (trailN < TRAIL_N) trailN++; else tpos.copyWithin(0, 3); const o = (trailN - 1) * 3; tpos[o] = wx(p.x); tpos[o + 1] = Math.max(p.y, .4); tpos[o + 2] = p.z;
      tgeo.setDrawRange(0, trailN); tgeo.attributes.position.needsUpdate = true; } else ball.visible = shadow.visible = false;
    for (const r of runners) { const q = runnerAt(r.R, t), end = t >= r.R.pts[r.R.pts.length - 1].t, nx = wx(q.x);
      if (PL && r.fig.rotation && Math.hypot(nx - r.px, q.z - r.pz) > .02) { r.fig.rotation.y = faceYaw(r.px, r.pz, nx, q.z); r.px = nx; r.pz = q.z; }   // runners face where they run
      r.fig.position.set(nx, 0, q.z); r.fig.visible = !(r.R.out && end); }
    batter.visible = !(runners.some(r => r.R.bat) && t > S.pitch.t1);
    acts(t);
    const b = S.beats.find(x => t >= x.t && t < x.t + BEAT_S); showBeat(b ? b.txt : '');
    draw(); if (t < S.dur) raf = requestAnimationFrame(frame); else { raf = 0; S = null; clearActs(); }
  }
  const api = {
    play(out) { api.skip(); S = buildBeats(out); S.swing = swings(out); S.hit = !!(out && out.play); trailN = 0; loadAct('pitch', PITCH_CLIP_URL); loadAct('swing', SWING_CLIP_URL);
      for (const R of S.runners) { const fig = body(R.bat ? COL.bat : COL.run, { head: 'helmet', role: 'batter' }); fig.position.set(wx(R.pts[0].x), 0, R.pts[0].z); scene.add(fig); runners.push({ R, fig, px: wx(R.pts[0].x), pz: R.pts[0].z }); }
      t0 = performance.now(); raf = requestAnimationFrame(frame); },
    skip() { if (raf) cancelAnimationFrame(raf); raf = 0; S = null; trailN = 0; clearRunners(); clearActs(); ball.visible = shadow.visible = false; batter.visible = true; showBeat(''); draw(); },
    setSpeed(n) { if (SPEEDS.includes(n)) { const now = performance.now(); if (S) t0 = now - (now - t0) * speed / n; speed = n; } },
    dispose() { api.skip(); if (renderer.dispose) renderer.dispose(); },
  };
  draw(); return api;
}

/** Picture for a canvas: the 3D field when three.js and a renderer are there, else the canvas 2D field (field.js), else null (no picture).
 *  `loadThree` -> the THREE module (default: the import map's `three/webgpu`). Never throws. A canvas that 3D tried to start is replaced by a fresh one for 2D. */
let plP = null;
/** The render/ player module with its MakeHuman bodies (#563 part 1); null when it cannot load (the field then keeps the low-poly figures). Loaded once. */
export const loadPlayers = () => plP || (plP = import('../../render/players.js').then(async PL => { try { await PL.loadPlayerAssets('./assets/'); } catch (e) { /* code-generated bodies */ } return PL; }).catch(() => null));
export async function openField(canvas, loadThree = () => import('three/webgpu'), loadPL = loadPlayers) {
  let f = null;
  try { const T = await loadThree(); f = await createField3D(canvas, T, { PL: await loadPL() }); } catch (e) { f = null; }
  if (f) return f;
  if (canvas && canvas.cloneNode && canvas.replaceWith && canvas.getContext) { try { const c2 = canvas.cloneNode(false); canvas.replaceWith(c2); canvas = c2; } catch (e) { /* keep the old one */ } }
  return createField(canvas);
}
