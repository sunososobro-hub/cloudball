/* Live 3D preview for agent.html (#189). Read-only user of render/players.js: the real makePlayer / loadPlayerAssets, so the body
 * on this page is the body that appears on the field. Nothing in render/ changes.
 *
 * The page works without it: three.js and the player pack load after first paint (a plain silhouette shows meanwhile), and when
 * neither WebGPU nor WebGL is there, or any download fails, the box says so and the form keeps working with numbers only.
 * One standing pose; the figure turns slowly, drag sideways to turn it (touch-action: pan-y keeps the page scrollable). */
import { sameSpec } from './preview-spec.js';

const JERSEY = 0x7d8794, PANTS = 0xe6e6e6, SKIN = 0xc99572;   /* neutral free-agent uniform; skin is the game's default until #151 decides the look numbers */
const FOV = 28, FRAME_H = 2.2, FRAME_W = 1.5, TARGET_Y = 0.98, YAW0 = 0.5, TURN = 0.55, RESUME_MS = 2200, MAX_DPR = 2;
const BAT_COLOR = 0xc9a06a, LEATHER = 0x8a5a2b;
const SAY = { loading: '3D 預覽載入中…', off: '這台裝置畫不出 3D 預覽，用數字一樣可以建立球員。', fail: '3D 預覽讀不到，用數字一樣可以建立球員。' };

export function makePreview(host) {
  const note = host.querySelector('.stage-note');
  let spec = null, ready = false, dead = false, api = null;
  const say = t => { if (note) { note.textContent = t; note.hidden = !t; } };
  const reduced = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();

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

    let f = null, kind = null, bat = null, yaw = YAW0, dragging = false, last = 0, resumeAt = 0, visible = true, raf = 0, w = 0, h = 0, lastX = 0;
    const R = PL.HEAD_SHAPES.length, headOf = n => ((n | 0) % R + R) % R;

    const fit = () => {   /* the whole body fits both ways: tall box on a phone, wide box on a desktop */
      const aspect = w / Math.max(h, 1), vf = FOV * Math.PI / 180, dh = FRAME_H / 2 / Math.tan(vf / 2), dw = FRAME_W / 2 / (Math.tan(vf / 2) * aspect);
      const d = Math.max(dh, dw); camera.aspect = aspect; camera.position.set(0, TARGET_Y + d * 0.09, d); camera.lookAt(0, TARGET_Y, 0); camera.updateProjectionMatrix();
    };
    const size = () => { const r = host.getBoundingClientRect(); w = Math.max(1, Math.round(r.width)); h = Math.max(1, Math.round(r.height)); renderer.setSize(w, h); fit(); draw(); };
    const draw = () => { pivot.rotation.y = yaw; renderer.render(scene, camera); };

    const dress = s => {
      if (!f || kind !== s.kind) {
        if (f) { pivot.remove(f.g); bat = null; }   /* body geometry is cached in players.js, so nothing to free */
        kind = s.kind;
        const batter = s.kind === 'bat';
        f = PL.makePlayer({ jersey: JERSEY, pants: PANTS, sock: JERSEY, skin: SKIN, head: 'cap', role: batter ? 'batter' : undefined, throws: 'R', glove: !batter, parent: pivot });
        if (f.glove) f.glove.traverse(m => { if (m.isMesh) m.material = new THREE.MeshStandardMaterial({ color: LEATHER, roughness: 0.6 }); });
        if (batter) {   /* bat held low in the right hand, barrel up and forward: the one pose */
          bat = PL.makeBat(BAT_COLOR); f.sockets.handR.add(bat); bat.rotation.x = -0.35; f.arms[1].rotation.x = -0.45;
        }
      }
      f.setBuild(s.body, s.ht, headOf(s.head));
      if (s.kind === 'bat') f.g.scale.x = s.hand === 'L' ? -1 : 1; else f.setThrows(s.hand === 'L' ? 'L' : 'R');
      f.setNum(s.num);
    };

    const loop = t => {
      raf = 0; if (!visible || document.hidden) return;
      const dt = last ? Math.min(0.1, (t - last) / 1000) : 0; last = t;
      if (!reduced && !dragging && t > resumeAt) yaw += dt * TURN;
      draw(); raf = requestAnimationFrame(loop);
    };
    const wake = () => { if (!raf && visible && !document.hidden) { last = 0; raf = requestAnimationFrame(loop); } };

    canvas.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => { if (!dragging) return; yaw += (e.clientX - lastX) * 0.012; lastX = e.clientX; draw(); });
    const up = () => { if (dragging) { dragging = false; resumeAt = performance.now() + RESUME_MS; } };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    new ResizeObserver(size).observe(host);
    new IntersectionObserver(es => { visible = es[es.length - 1].isIntersecting; wake(); }).observe(host);
    document.addEventListener('visibilitychange', wake);
    size(); wake();
    return { apply(s) { dress(s); draw(); wake(); } };
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
