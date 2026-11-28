/* Live 3D preview for agent.html (#189). Read-only user of render/players.js: the real makePlayer / loadPlayerAssets, so the body
 * on this page is the body that appears on the field. Nothing in render/ changes.
 *
 * The page works without it: three.js and the player pack load after first paint (a plain silhouette shows meanwhile), and when
 * neither WebGPU nor WebGL is there, or any download fails, the box says so and the form keeps working with numbers only.
 * Kit buttons and a cap toggle (#595 part 1); pose buttons 站姿 / 打擊預備 (#595 part 2: the game's mocap batting stance, clip loaded on first use). #441 part 3: it opens from the front with a close-up of the head; 轉身 shows the back, 全身 / 特寫 switches the frame;
 * drag sideways to turn it by hand (touch-action: pan-y keeps the page scrollable). Nothing moves by itself, so it draws on demand only. */
import { sameSpec, PREVIEW_OPEN, yawOfSide, flipSide, flipZoom, frameOf, KITS, POSES, POSE_CLIPS, DEFAULT_DRESS, withDress, kitPaint } from './preview-spec.js';

const SKIN = 0xc99572;   /* skin is the game's default until #151 decides the look numbers; the kit colours come from ui/preview-spec.js kitPaint (#595) */
const FOV = 28, MAX_DPR = 2, CAM_RISE = 0.09;
const BAT_COLOR = 0xc9a06a, LEATHER = 0x8a5a2b;
const BAT_ARM_X = -0.45, BAT_GRIP_X = 1.4;   /* batter pose (#439): right arm swings forward by ARM_X; the bat turns by GRIP_X inside the hand (the hand bone is already tipped back by the arm and elbow), so the barrel stands up, leaning a little toward the pitcher. Measured: tip 0.8 m above the hand, 0.2 m forward of it */
const SAY = { loading: '3D 預覽載入中…', off: '這台裝置畫不出 3D 預覽，用數字一樣可以建立球員。', fail: '3D 預覽讀不到，用數字一樣可以建立球員。' };

export function makePreview(host) {
  const note = host.querySelector('.stage-note');
  let spec = null, dressing = { ...DEFAULT_DRESS }, ready = false, dead = false, api = null;
  const turnBtn = host.querySelector('.stage-turn'), zoomBtn = host.querySelector('.stage-zoom');
  const bar = host.querySelector('.stage-bar');
  const kitBar = host.querySelector('.stage-kit');   /* #595: one button per kit (four teams + free agent) and the cap toggle */
  const say = t => { if (note) { note.textContent = t; note.hidden = !t; } };
  
  async function boot() {
    try {
      const [THREE, PL] = await Promise.all([import('three/webgpu'), import('../render/players.js')]);
      await PL.loadPlayerAssets('./assets/');
      const renderer = new THREE.WebGPURenderer({ antialias: true, alpha: true });
      await renderer.init();
      api = build(THREE, PL, renderer);
      host.classList.add('live'); say(''); ready = true;
      if (spec) api.apply(spec);
    } catch (e) { console.error(e); dead = true; host.classList.add('dead'); say(!window.isSecureContext && !('gpu' in navigator) ? SAY.off : SAY.fail); }
  }

  function build(THREE, PL, renderer) {
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, MAX_DPR));
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
    const canvas = renderer.domElement; canvas.className = 'stage-canvas'; canvas.setAttribute('aria-label', '球員的 3D 預覽，可以左右拖動轉身'); host.appendChild(canvas);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 40), pivot = new THREE.Group();
    scene.add(pivot, new THREE.HemisphereLight(0xdfe8ff, 0x232830, 1.5));
    const key = new THREE.DirectionalLight(0xfff1dc, 2.4); key.position.set(2.2, 3.4, 3.2); scene.add(key);
    const rim = new THREE.DirectionalLight(0x9ec3ff, 1.2); rim.position.set(-3, 2.2, -2.5); scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.62, 40), new THREE.MeshBasicMaterial({ color: 0x0b0d12, transparent: true, opacity: 0.55 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.002; pivot.add(floor);

    let clips = {}, cur = null;
    let f = null, kind = null, hairIx = -1, built = '', bat = null, side = PREVIEW_OPEN.side, zoom = PREVIEW_OPEN.zoom, yaw = yawOfSide(side), ht = 1.8, dragging = false, w = 0, h = 0, lastX = 0;
    const R = PL.HEAD_SHAPES.length, headOf = n => ((n | 0) % R + R) % R, HT = PL.HAIR_TONES.length, hairOf = n => ((n | 0) % HT + HT) % HT;

    const fit = () => {   /* the frame (head close-up or whole body) fits both ways: tall box on a phone, wide box on a desktop */
      const fr = frameOf(zoom, ht), aspect = w / Math.max(h, 1), vf = FOV * Math.PI / 180, dh = fr.h / 2 / Math.tan(vf / 2), dw = fr.w / 2 / (Math.tan(vf / 2) * aspect);
      const d = Math.max(dh, dw); camera.aspect = aspect; camera.position.set(0, fr.y + d * CAM_RISE, d); camera.lookAt(0, fr.y, 0); camera.updateProjectionMatrix();
    };
    const size = () => { const r = host.getBoundingClientRect(); const barH = bar ? bar.offsetHeight : 0; w = Math.max(1, Math.round(r.width)); h = Math.max(1, Math.round(r.height - barH)); renderer.setSize(w, h);   /* #597: the canvas stops where the button bar starts, so no tap lands on it */ fit(); draw(); };
    const draw = () => { pivot.rotation.y = yaw; renderer.render(scene, camera); };

    const dress = s => {
      const hx = PL.headOfPlayer({ id: s.id ?? 'draw:' + (s.seed ?? ''), look: { head: s.head, skin: 0, hair: s.hair } }), hIx = PL.gearOf(hx).hair;   /* #541: chips untouched = the look hashed from his id, as in the game */
      const key = s.kind + '|' + hIx + '|' + s.kit + '|' + s.cap;
      if (!f || built !== key) {   /* #441: the hair colour is a material of the figure, so a new pick builds it again (geometry is cached) */
        if (f) { pivot.remove(f.g); bat = null; }   /* body geometry is cached in players.js, so nothing to free */
        kind = s.kind; hairIx = hIx; built = key;
        const batter = s.kind === 'bat';
        const paint = kitPaint(s.kit, PL);   /* the cap is made of the jersey material, so a team kit (jersey = cap colour) and the grey kit need no extra step */
        f = PL.makePlayer({ jersey: paint.jersey, pants: paint.pants, sock: paint.sock, skin: SKIN, hair: PL.HAIR_TONES[hairIx], head: s.cap ? 'cap' : 'none', role: batter ? 'batter' : undefined, throws: 'R', glove: !batter, parent: pivot });
        if (f.glove) f.glove.traverse(m => { if (m.isMesh) m.material = new THREE.MeshStandardMaterial({ color: LEATHER, roughness: 0.6 }); });
        if (batter) {   /* bat held in the right hand, barrel up and a little forward: the one pose (was rotation.x -0.35, which laid the barrel flat behind the hip) */
          bat = PL.makeBat(BAT_COLOR); f.sockets.handR.add(bat); bat.rotation.x = BAT_GRIP_X; f.arms[1].rotation.x = BAT_ARM_X;
        }
      }
      f.setBuild(s.body, s.ht, hx);
      if (s.kind === 'bat') f.g.scale.x = s.hand === 'L' ? -1 : 1; else f.setThrows(s.hand === 'L' ? 'L' : 'R');
      f.setNum(s.num); ht = s.ht; pose(s); fit();
    };
    /* #595 part 2: the batting stance is the game's swing clip at its stance frame (as render/game.js batterMocap, no mirror: a lefty is the whole
       figure mirrored); the bat then goes from the bottom hand (handR) toward the top hand, as game.js does while the clip holds */
    const V = () => new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
    const pose = s => {
      cur = s; const P = s.kind === 'bat' && POSE_CLIPS[s.pose], clip = P && clips[s.pose];
      if (P && clips[s.pose] === undefined) {
        clips[s.pose] = null;
        PL.loadClip('./' + P.url).then(c => { clips[s.pose] = c; if (cur) { pose(cur); draw(); } }).catch(e => { console.warn('pose clip', e); delete clips[s.pose]; });
      }
      f.setMocap(clip || null, P ? P.t : 0, clip ? 1 : 0, false, P ? P.t : 0, 0);
      if (!bat) return;
      if (clip) {
        f.g.updateMatrixWorld(true); const a = f.handWorld(1, V()), b = f.handWorld(0, V());
        const H = f.sockets.handR, d = H.worldToLocal(b).sub(H.worldToLocal(a));
        if (d.lengthSq() > 1e-6) bat.quaternion.setFromUnitVectors(UP, d.normalize());
      } else bat.rotation.set(BAT_GRIP_X, 0, 0);
    };

    canvas.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => { if (!dragging) return; yaw += (e.clientX - lastX) * 0.012; lastX = e.clientX; draw(); });
    const up = () => { dragging = false; };
    const labels = () => { if (turnBtn) turnBtn.textContent = side === 'front' ? '轉身看背面' : '轉身看正面'; if (zoomBtn) zoomBtn.textContent = zoom === 'close' ? '看全身' : '看臉部特寫'; };
    if (turnBtn) turnBtn.onclick = () => { side = flipSide(side); yaw = yawOfSide(side); labels(); draw(); };
    if (zoomBtn) zoomBtn.onclick = () => { zoom = flipZoom(zoom); labels(); fit(); draw(); };
    labels();
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    const ro = new ResizeObserver(size); ro.observe(host); if (bar) ro.observe(bar);
    size();
    return { apply(s) { dress(s); draw(); } };   /* pose(s) runs inside dress */
  }

  const chips = () => {
    if (!kitBar) return;
    const batter = !spec || spec.kind === 'bat';
    kitBar.querySelectorAll('button').forEach(b => {
      if (b.dataset.pose) { b.hidden = !batter; b.setAttribute('aria-pressed', String(b.dataset.pose === dressing.pose)); return; }   /* poses are batter-only */
      b.setAttribute('aria-pressed', String(b.dataset.kit ? b.dataset.kit === dressing.kit : dressing.cap));
    });
  };
  const redress = () => { chips(); if (spec) { spec = withDress(spec, dressing); if (ready && !dead) api.apply(spec); } };
  if (kitBar) {
    for (const k of KITS) { const b = document.createElement('button'); b.type = 'button'; b.dataset.kit = k.id; b.textContent = k.label; b.onclick = () => { dressing.kit = k.id; redress(); }; kitBar.appendChild(b); }
    const c = document.createElement('button'); c.type = 'button'; c.className = 'cap'; c.onclick = () => { dressing.cap = !dressing.cap; c.textContent = dressing.cap ? '脫帽' : '戴帽'; redress(); }; c.textContent = '脫帽'; kitBar.appendChild(c);
    for (const p of POSES) { const b = document.createElement('button'); b.type = 'button'; b.dataset.pose = p.id; b.textContent = p.label; b.onclick = () => { dressing.pose = p.id; redress(); }; kitBar.appendChild(b); }
    chips();
  }

  /* first paint first: the heavy part starts when the browser is idle */
  const start = () => { say(SAY.loading); (window.requestIdleCallback || (cb => setTimeout(cb, 200)))(boot, { timeout: 1500 }); };
  let started = false;
  return {
    show(next) {
      next = withDress(next, dressing); if (sameSpec(spec, next)) return; spec = next; chips();
      if (!started) { started = true; start(); }
      if (ready && !dead) api.apply(spec);
    },
  };
}
