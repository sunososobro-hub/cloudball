/* Live 3D preview for agent.html (#189). Read-only user of render/players.js: the real makePlayer / loadPlayerAssets, so the body
 * on this page is the body that appears on the field. Nothing in render/ changes.
 *
 * The page works without it: three.js and the player pack load after first paint (a plain silhouette shows meanwhile), and when
 * neither WebGPU nor WebGL is there, or any download fails, the box says so and the form keeps working with numbers only.
 * One standing pose. #441 part 3: it opens from the front with a close-up of the head; 轉身 shows the back, 全身 / 特寫 switches the frame;
 * drag sideways to turn it by hand (touch-action: pan-y keeps the page scrollable). Nothing moves by itself, so it draws on demand only. */
import { sameSpec, PREVIEW_OPEN, yawOfSide, flipSide, flipZoom, frameOf } from './preview-spec.js';

const JERSEY = 0x7d8794, PANTS = 0xe6e6e6, SKIN = 0xc99572;   /* neutral free-agent uniform; skin is the game's default until #151 decides the look numbers */
const FOV = 28, MAX_DPR = 2, CAM_RISE = 0.09;
const BAT_COLOR = 0xc9a06a, LEATHER = 0x8a5a2b;
const BAT_ARM_X = -0.45, BAT_GRIP_X = 1.4;   /* batter pose (#439): right arm swings forward by ARM_X; the bat turns by GRIP_X inside the hand (the hand bone is already tipped back by the arm and elbow), so the barrel stands up, leaning a little toward the pitcher. Measured: tip 0.8 m above the hand, 0.2 m forward of it */
const SAY = { loading: '3D 預覽載入中…', off: '這台裝置畫不出 3D 預覽，用數字一樣可以建立球員。', fail: '3D 預覽讀不到，用數字一樣可以建立球員。' };

export function makePreview(host) {
  const note = host.querySelector('.stage-note');
  let spec = null, ready = false, dead = false, api = null;
  const turnBtn = host.querySelector('.stage-turn'), zoomBtn = host.querySelector('.stage-zoom');
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

    let f = null, kind = null, hairIx = -1, bat = null, side = PREVIEW_OPEN.side, zoom = PREVIEW_OPEN.zoom, yaw = yawOfSide(side), ht = 1.8, dragging = false, w = 0, h = 0, lastX = 0;
    const R = PL.HEAD_SHAPES.length, headOf = n => ((n | 0) % R + R) % R, HT = PL.HAIR_TONES.length, hairOf = n => ((n | 0) % HT + HT) % HT;

    const fit = () => {   /* the frame (head close-up or whole body) fits both ways: tall box on a phone, wide box on a desktop */
      const fr = frameOf(zoom, ht), aspect = w / Math.max(h, 1), vf = FOV * Math.PI / 180, dh = fr.h / 2 / Math.tan(vf / 2), dw = fr.w / 2 / (Math.tan(vf / 2) * aspect);
      const d = Math.max(dh, dw); camera.aspect = aspect; camera.position.set(0, fr.y + d * CAM_RISE, d); camera.lookAt(0, fr.y, 0); camera.updateProjectionMatrix();
    };
    const size = () => { const r = host.getBoundingClientRect(); w = Math.max(1, Math.round(r.width)); h = Math.max(1, Math.round(r.height)); renderer.setSize(w, h); fit(); draw(); };
    const draw = () => { pivot.rotation.y = yaw; renderer.render(scene, camera); };

    const dress = s => {
      if (!f || kind !== s.kind || hairIx !== hairOf(s.hair)) {   /* #441: the hair colour is a material of the figure, so a new pick builds it again (geometry is cached) */
        if (f) { pivot.remove(f.g); bat = null; }   /* body geometry is cached in players.js, so nothing to free */
        kind = s.kind; hairIx = hairOf(s.hair);
        const batter = s.kind === 'bat';
        f = PL.makePlayer({ jersey: JERSEY, pants: PANTS, sock: JERSEY, skin: SKIN, hair: PL.HAIR_TONES[hairIx], head: 'cap', role: batter ? 'batter' : undefined, throws: 'R', glove: !batter, parent: pivot });
        if (f.glove) f.glove.traverse(m => { if (m.isMesh) m.material = new THREE.MeshStandardMaterial({ color: LEATHER, roughness: 0.6 }); });
        if (batter) {   /* bat held in the right hand, barrel up and a little forward: the one pose (was rotation.x -0.35, which laid the barrel flat behind the hip) */
          bat = PL.makeBat(BAT_COLOR); f.sockets.handR.add(bat); bat.rotation.x = BAT_GRIP_X; f.arms[1].rotation.x = BAT_ARM_X;
        }
      }
      f.setBuild(s.body, s.ht, headOf(s.head));
      if (s.kind === 'bat') f.g.scale.x = s.hand === 'L' ? -1 : 1; else f.setThrows(s.hand === 'L' ? 'L' : 'R');
      f.setNum(s.num); ht = s.ht; fit();
    };

    canvas.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => { if (!dragging) return; yaw += (e.clientX - lastX) * 0.012; lastX = e.clientX; draw(); });
    const up = () => { dragging = false; };
    const labels = () => { if (turnBtn) turnBtn.textContent = side === 'front' ? '轉身看背面' : '轉身看正面'; if (zoomBtn) zoomBtn.textContent = zoom === 'close' ? '看全身' : '看臉部特寫'; };
    if (turnBtn) turnBtn.onclick = () => { side = flipSide(side); yaw = yawOfSide(side); labels(); draw(); };
    if (zoomBtn) zoomBtn.onclick = () => { zoom = flipZoom(zoom); labels(); fit(); draw(); };
    labels();
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    new ResizeObserver(size).observe(host);
    size();
    return { apply(s) { dress(s); draw(); } };
  }

  /* first paint first: the heavy part starts when the browser is idle */
  const start = () => { say(SAY.loading); (window.requestIdleCallback || (cb => setTimeout(cb, 200)))(boot, { timeout: 1500 }); };
  let started = false;
  return {
    show(next) {
      if (sameSpec(spec, next)) return; spec = next;
      if (!started) { started = true; start(); }
      if (ready && !dead) api.apply(spec);
    },
  };
}
