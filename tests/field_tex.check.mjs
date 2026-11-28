/* #563 part 7: render/field_tex.js draws the broadcast field map once for both pictures (render/game.js, the 九宮格 3D field).
 * Runs the real drawing against a recording canvas 2D stub: size, determinism, the wear dabs; then ui/baseball9/field3d.js fieldGround /
 * buildPark with a small fake THREE: the map lands in the 3D field's frame (bases on the painted bases), and no canvas keeps the flat park. */
const FT = await import('../render/field_tex.js'), F3 = await import('../ui/baseball9/field3d.js'), { BASES } = await import('../ui/baseball9/play.js');
const bad = [], fail = m => bad.push(m);
const fakeDoc = () => { const log = []; return { log, createElement(tag) { if (tag !== 'canvas') throw new Error('only canvas');
  const c = { width: 0, height: 0, getContext: () => new Proxy({}, { get: (_, k) => k === 'getImageData' ? (x, y, w, h) => ({ data: new Uint8ClampedArray(64) }) : (...a) => log.push([k, ...a.map(v => typeof v === 'number' ? +v.toFixed(4) : typeof v === 'object' ? 'obj' : v)]),
    set: (_, k, v) => { log.push(['=' + String(k), v]); return true; } }) }; return c; } }; };
{ const d1 = fakeDoc(), d2 = fakeDoc(), A = FT.drawFieldTex(d1), B = FT.drawFieldTex(d2);
  if (A.c.width !== FT.FIELD_PX || A.c.height !== Math.round(FT.FIELD_H * FT.FIELD_PX / FT.FIELD_W)) fail(`field canvas ${A.c.width}x${A.c.height}`);
  if (JSON.stringify(d1.log) !== JSON.stringify(d2.log)) fail('field map is not the same on every load');
  const dabs = d1.log.filter(o => o[0] === '=fillStyle' && String(o[1]).startsWith(`rgba(${FT.DIRT_RGB},`)).length, want = 2 * FT.CHALK_SCUFFS + 2 * FT.BOX_SCUFFS + 5 * FT.BASE_DUST;
  if (dabs !== want) fail(`wear dabs ${dabs}, want ${want}`);
  if (A.X(0) !== -FT.FIELD_X0 * A.S || A.Y(0) !== -FT.FIELD_Z0 * A.S) fail('home plate pixel'); }
/* fake THREE: enough to place the ground plane */
const v3 = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } });
class Obj { constructor() { this.position = v3(); this.rotation = v3(); this.children = []; this.userData = {}; } add(...o) { this.children.push(...o); } }
const THREE = { Group: class extends Obj {}, Mesh: class extends Obj { constructor(g, m) { super(); this.geometry = g; this.material = m; } },
  PlaneGeometry: class { constructor(w, h) { this.w = w; this.h = h; } }, CircleGeometry: class {}, CylinderGeometry: class {}, BoxGeometry: class {},
  MeshStandardMaterial: class { constructor(o) { Object.assign(this, o); } }, CanvasTexture: class { constructor(c) { this.image = c; } }, SRGBColorSpace: 'srgb' };
{ const g = F3.fieldGround(THREE, fakeDoc());
  if (!g) fail('fieldGround returned null with a canvas');
  else { const p = g.children[0], T = g.userData.fieldTex;
    if (!p || p.material.map.image !== T.c || p.geometry.w !== FT.FIELD_W || p.geometry.h !== FT.FIELD_H) fail('ground plane must carry the field map at its size');
    /* broadcast map point (x, z) -> plane local -> group turned by rotation.y about y -> world */
    const world = (x, z) => { const c = Math.cos(g.rotation.y), s = Math.sin(g.rotation.y), lx = x + p.position.x, lz = z; return [lx * c + lz * s, -lx * s + lz * c]; };
    if (Math.abs(p.position.z - (FT.FIELD_Z0 + FT.FIELD_H / 2)) > 1e-9 || Math.abs(p.rotation.x + Math.PI / 2) > 1e-9) fail('ground plane placement');
    /* painted bases (render frame: first base at +x, second at -z) must land on the 3D field's bases (world x = -core x) */
    for (const [i, [bx, bz]] of [[1, [19.4, -19.4]], [2, [0, -38.8]], [3, [-19.4, -19.4]], [0, [0, 0]]]) {
      const [wx, wz] = world(bx, bz), [cx, cz] = BASES[i];
      if (Math.abs(wx - -cx) > 1e-6 || Math.abs(wz - cz) > 1e-6) fail(`painted base ${i} at ${wx.toFixed(2)},${wz.toFixed(2)}, field base at ${-cx},${cz}`); } } }
{ if (F3.fieldGround(THREE, null) !== null) fail('fieldGround without a document must be null');
  if (F3.fieldGround(THREE, { createElement() { throw new Error('no canvas'); } }) !== null) fail('a failing canvas must be null');
  const S = new Obj(); F3.buildPark(THREE, S, undefined, null);
  if (S.children.some(o => o.name === 'field-ground')) fail('buildPark without canvas must keep the flat park');
  const S2 = new Obj(); F3.buildPark(THREE, S2, undefined, fakeDoc());
  if (S2.children.filter(o => o.name === 'field-ground').length !== 1) fail('buildPark with canvas must add the field ground once');
  if (!(S2.children.length < S.children.length)) fail('painted ground replaces the flat dirt / infield / foul-line meshes'); }
if (bad.length) { console.error('FAIL field_tex:\n - ' + bad.join('\n - ')); process.exit(1); }
console.log('field_tex ok: shared field map, deterministic, on the 3D field bases');
