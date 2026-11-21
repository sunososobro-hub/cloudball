/* players.js — 程式生成的有骨架球員（SkinnedMesh + Skeleton），three.js 0.186.1（three/webgpu）
 * 素材：全部程式生成，沒有外部模型。
 *
 * 介面跟舊的積木人 figure() + rigUpper() 一樣：
 *   f.g                        整個人（位置、朝向、g.scale.x=-1 左打鏡射都照舊）
 *   f.legs[0|1] / f.arms[0|1]  髖、肩關節。rotation.x/z、quaternion、scale.y 用法都跟舊的一樣
 *   f.rig = {up,hips,hg,l0,l1,a0,a1}  等同 rigUpper(f) 的回傳值（不用再呼叫 rigUpper）
 *   f.numMesh                  背號平面（舊的 setNum(f,n) 可直接用）
 * 舊介面裡肢體是一根棍子，現在 scale.y<1 會換算成「彎膝／彎肘」：手腳末端位置不變，
 * 不會整條縮短。scale.y>1 則由肩膀往前送（最多 ARM_REACH）。
 * 關節軸向：local -y 沿肢體往下，+z 是正面；rotation.x 負值 = 往前抬。
 *
 * 慣用手：舊積木人的 arms[1]（local +x）其實是人物的「左手」，所以舊投手看起來是左投。
 * throws:'R'（預設）會在內層做 x 鏡射，舊 keyframe 不用改就變成右投、手套在左手；
 * throws:'L' 不鏡射。role:'batter' 一律不做內層鏡射（左右打照舊用 g.scale.x）。
 * 內層鏡射時，世界座標的出手點要改用 f.handWorld(1) 取，不能再用 pitchTipAt 的 +x 公式。
 */
import * as THREE from 'three/webgpu';

/* ---------- 尺寸（未縮放的人體座標，跟舊積木人對齊） ---------- */
export const REF_H = 1.86;               /* 未縮放時頭頂高度；身高 h 的人整體縮放 h/REF_H */
export const DIMS = {
  PELVIS_Y: .95, HIP_X: .11, HIP_Y: .86, THIGH: .40, SHIN: .38, LEG_LEN: .86, FOOT_H: .08,
  SH_X: .3, SH_Y: .57 /* 相對 up */, UPPER_ARM: .29, FOREARM: .26, HAND_GRIP: .05, ARM_LEN: .6,
  NECK_Y: .7 /* 相對 up */, NUM_Y: 1.3,
};
const D = DIMS;
const ARM_REACH = .1;                    /* 手臂伸不到時肩膀最多往前送多少 m */
const KNEE_REST = .995, ELBOW_REST = .97;/* 站姿也留一點點彎，不會像棍子 */
const KNEE_FREE_FWD = .85, KNEE_FREE_BACK = .75, ELBOW_FREE = 1.1, ELBOW_FREE_MAX = 1.4, THROW_ELBOW_PHI = 1.0;
const RADIAL = 14;
const ELBOW_RUN = 1.5, RUN_SPLIT_LO = .08, RUN_SPLIT_W = .3;   /* 兩腳前後分開多少（方向 z 差）就算在跑 */

/* 體型：h 身高(m)、chest 胸寬、belly 腰腹、hip 臀、limb 四肢粗細、neck 脖子 */
export const BUILDS = {
  slim:   { label: '瘦長', h: 1.78, chest: .9,  belly: .88, hip: .92, limb: .86, neck: .92 },
  normal: { label: '標準', h: 1.82, chest: 1,   belly: 1,   hip: 1,   limb: 1,   neck: 1 },
  power:  { label: '壯碩', h: 1.88, chest: 1.14,belly: 1.05,hip: 1.08,limb: 1.18,neck: 1.12 },
  heavy:  { label: '重砲', h: 1.85, chest: 1.16,belly: 1.32,hip: 1.2, limb: 1.15,neck: 1.16 },
};

/* ---------- 骨頭編號 ---------- */
const B = { root: 0, pelvis: 1, spine: 2, neck: 3, shL: 4, elL: 5, handL: 6, shR: 7, elR: 8, handR: 9, thL: 10, knL: 11, ftL: 12, thR: 13, knR: 14, ftR: 15 };
/* 「L/R」指 local -x / +x（= arms[0] / arms[1]），不是人物的左右手 */
const NB = 16;

const sm = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t) };
function prof(keys, y) {            /* keys: [[y, v...]] 依 y 遞增；平滑內插 */
  if (y <= keys[0][0]) return keys[0].slice(1);
  for (let i = 1; i < keys.length; i++) if (y <= keys[i][0]) {
    const a = keys[i - 1], b = keys[i], t = sm((y - a[0]) / (b[0] - a[0]));
    return a.slice(1).map((v, k) => v + (b[k + 1] - v) * t);
  }
  return keys[keys.length - 1].slice(1);
}

/* ---------- 幾何：沿軸放樣的管子，每個頂點帶骨頭權重 ---------- */
class Builder {
  constructor(nMat) { this.m = Array.from({ length: nMat }, () => ({ p: [], i: [], si: [], sw: [] })) }
  /* ring(t) → {c:[x,y,z], a, b, e}；axis 'y'：截面在 xz；axis 'z'：截面在 xy。weight(x,y,z) → [[bone,w],...] */
  tube(mat, rings, axis, ring, weight, n = RADIAL, round = [0, 0]) {
    const M = this.m[mat], base = M.p.length / 3;
    /* round=[頭,尾]：兩端多少比例收成半球，避免平平的蓋子 */
    const rf = t => { let k = 1; if (round[0] && t < round[0]) k = Math.sqrt(Math.max(.0004, 1 - (1 - t / round[0]) ** 2)); if (round[1] && t > 1 - round[1]) k = Math.min(k, Math.sqrt(Math.max(.0004, 1 - (1 - (1 - t) / round[1]) ** 2))); return k };
    const put = (x, y, z) => {
      M.p.push(x, y, z); let w = weight(x, y, z).filter(q => q[1] > 1e-4).sort((p, q) => q[1] - p[1]).slice(0, 4);
      const s = w.reduce((a, q) => a + q[1], 0) || 1; while (w.length < 4) w.push([0, 0]);
      for (const q of w) { M.si.push(q[0]); M.sw.push(q[1] / s) }
    };
    for (let r = 0; r <= rings; r++) {
      const t = r / rings, { c, a: a0, b: b0, e = 2 } = ring(t), k = rf(t), a = a0 * k, b = b0 * k;
      for (let j = 0; j < n; j++) {
        const th = j / n * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th);
        const u = Math.sign(cs) * Math.abs(cs) ** (2 / e) * a, v = Math.sign(sn) * Math.abs(sn) ** (2 / e) * b;
        if (axis === 'y') put(c[0] + u, c[1], c[2] + v); else put(c[0] + u, c[1] + v, c[2]);
      }
    }
    const P = k => base + k, idx = (r, j) => P(r * n + (j % n)), tris = [];
    for (let r = 0; r < rings; r++) for (let j = 0; j < n; j++) {
      tris.push([idx(r, j), idx(r + 1, j), idx(r, j + 1)], [idx(r + 1, j), idx(r + 1, j + 1), idx(r, j + 1)]);
    }
    const c0 = ring(0).c, c1 = ring(1).c;
    const p0 = M.p.length / 3; put(...c0); const p1 = M.p.length / 3; put(...c1);
    for (let j = 0; j < n; j++) { tris.push([p0, idx(0, j), idx(0, j + 1)]); tris.push([p1, idx(rings, j + 1), idx(rings, j)]) }
    /* 檢查第一個三角形朝外，不是就整塊翻面 */
    const v = k => new THREE.Vector3(M.p[k * 3], M.p[k * 3 + 1], M.p[k * 3 + 2]);
    const [A, Bv, C] = tris[0].map(v), nrm = Bv.clone().sub(A).cross(C.clone().sub(A));
    const cen = new THREE.Vector3(...ring(.5 / rings).c), out = A.clone().add(Bv).add(C).divideScalar(3).sub(cen);
    if (axis === 'y') out.y = 0; else out.z = 0;
    const flip = nrm.dot(out) < 0;
    for (const t of tris) M.i.push(...(flip ? [t[0], t[2], t[1]] : t));
  }
  /* 橢球：沿 y 放樣，兩端收成圓 */
  ellipsoid(mat, c, rx, ry, rz, weight, rings = 8, n = RADIAL) {
    this.tube(mat, rings, 'y', t => { const a = -Math.PI / 2 + t * Math.PI, s = Math.max(.02, Math.cos(a)); return { c: [c[0], c[1] + Math.sin(a) * ry, c[2]], a: rx * s, b: rz * s } }, weight, n);
  }
  geometry() {
    const g = new THREE.BufferGeometry(), P = [], I = [], SI = [], SW = [];
    let vo = 0, io = 0;
    this.m.forEach((M, k) => {
      P.push(...M.p); SI.push(...M.si); SW.push(...M.sw); for (const i of M.i) I.push(i + vo);
      g.addGroup(io, M.i.length, k); vo += M.p.length / 3; io += M.i.length;
    });
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
    g.setIndex(I); g.computeVertexNormals(); g.computeBoundingSphere();
    return g;
  }
}

/* 軀幹截面（胸以上用 chest，腰以下用 belly） */
const TORSO_K = [[.9, .165, .118], [1.0, .17, .122], [1.12, .183, .132], [1.3, .203, .137], [1.4, .23, .135], [1.46, .228, .127], [1.51, .205, .113], [1.555, .16, .095], [1.61, .08, .066]];
function torsoAt(bd, y) { const [rx, rz] = prof(TORSO_K, y), m = sm((y - 1.2) / .25), k = bd.belly + (bd.chest - bd.belly) * m;
  return { rx: rx * k, rz: rz * k, cz: (1 - m) * (bd.belly - 1) * .045 } }

/* 材質槽 */
const MAT = { jersey: 0, pants: 1, skin: 2, dark: 3, sock: 4, hair: 5 };
const geoCache = new Map();
function bodyGeometry(bd) {
  const key = JSON.stringify(bd); if (geoCache.has(key)) return geoCache.get(key);
  const b = new Builder(6), side = x => x < 0 ? 0 : 1;
  const blend = (y, y0, y1, lo, hi) => { const t = sm((y - y0) / (y1 - y0)); return [[lo, 1 - t], [hi, t]] };
  const torsoR = y => torsoAt(bd, y);
  /* 軀幹（球衣） */
  b.tube(MAT.jersey, 16, 'y', t => { const y = .9 + t * .71, r = torsoR(y); return { c: [0, y, r.cz], a: r.rx, b: r.rz, e: 2.3 } }, (x, y, z) => {
    let w = blend(y, .98, 1.14, B.pelvis, B.spine);
    const sh = .3 * sm((Math.abs(x) - .15) / .06) * sm((y - 1.38) / .1);
    if (sh > 0) { w = w.map(q => [q[0], q[1] * (1 - sh)]); w.push([x < 0 ? B.shL : B.shR, sh]) }
    const nk = .35 * sm((y - 1.57) / .04); if (nk > 0) { w = w.map(q => [q[0], q[1] * (1 - nk)]); w.push([B.neck, nk]) }
    return w;
  });
  /* 皮帶 */
  const belt = Math.max(torsoR(1.0).rx, .178 * bd.hip) + .008;
  b.tube(MAT.dark, 2, 'y', t => ({ c: [0, .975 + t * .045, torsoR(1).cz], a: belt, b: belt * .72 }), (x, y) => blend(y, .98, 1.14, B.pelvis, B.spine));
  /* 骨盆／褲頭 */
  const pelK = [[.76, .06, .045], [.81, .165, .11], [.9, .19, .128], [1.0, .175, .122], [1.04, .16, .11]];
  b.tube(MAT.pants, 10, 'y', t => { const y = .74 + t * .3, [rx, rz] = prof(pelK, y); return { c: [0, y, 0], a: rx * bd.hip, b: rz * bd.hip, e: 2.2 } }, (x, y) => {
    const leg = .55 * sm((.92 - y) / .12); if (leg <= 0) return [[B.pelvis, 1]];
    const l = sm((-x + .03) / .06), r = 1 - l;   /* x<0 → thL */
    return [[B.pelvis, 1 - leg], [B.thL, leg * l], [B.thR, leg * r]];
  });

  /* 腿：褲管（到小腿中段）＋襪子＋鞋 */
  for (const s of [-1, 1]) {
    const th = s < 0 ? B.thL : B.thR, kn = s < 0 ? B.knL : B.knR, ft = s < 0 ? B.ftL : B.ftR, KY = D.HIP_Y - D.THIGH, AY = KY - D.SHIN;
    const legW = (x, y) => y > KY + .05 ? [[th, 1]] : y > KY - .05 ? blend(y, KY - .05, KY + .05, kn, th) : [[kn, 1]];
    const L = bd.limb, HX = D.HIP_X * s;
    const legK = [[.18, .052, .055], [.3, .064, .07], [.4, .06, .063], [.48, .068, .07], [.62, .083, .086], [.8, .095, .094], [.98, .095, .085]];
    b.tube(MAT.pants, 18, 'y', t => { const y = .3 + t * .68, [rx, rz] = prof(legK, y); return { c: [HX * (.9 + .1 * sm((y - .4) / .4)), y, .005], a: rx * L * 1.08, b: rz * L * 1.08 } }, legW);
    b.tube(MAT.sock, 8, 'y', t => { const y = AY + .01 + t * (.34 - AY), [rx, rz] = prof(legK, y); return { c: [HX * .9, y, .0], a: rx * L, b: rz * L } }, legW);
    b.tube(MAT.dark, 8, 'z', t => { const z = -.07 + t * .26, h = Math.sin(Math.PI * (.08 + .84 * t)) ** .35, top = .075 - .03 * sm((z - .03) / .12);
      return { c: [HX * .9, top / 2 + .002, z], a: .052 * h * (.9 + .1 * L), b: top / 2 * h + .004, e: 2.6 } }, () => [[ft, 1]]);
  }

  /* 手臂：袖子（球衣）＋手臂（皮膚）＋手 */
  for (const s of [-1, 1]) {
    const sh = s < 0 ? B.shL : B.shR, el = s < 0 ? B.elL : B.elR, hd = s < 0 ? B.handL : B.handR;
    const SY = D.PELVIS_Y + D.SH_Y, EY = SY - D.UPPER_ARM, WY = EY - D.FOREARM, X = D.SH_X * s, L = bd.limb;
    const armW = (x, y) => y > EY + .04 ? [[sh, 1]] : y > EY - .04 ? blend(y, EY - .04, EY + .04, el, sh) : y > WY ? [[el, 1]] : [[hd, 1]];
    const armK = [[WY - .01, .03, .025], [WY + .02, .033, .028], [EY - .1, .045, .042], [EY, .042, .04], [EY + .14, .055, .052], [SY - .02, .062, .06], [SY + .045, .035, .035]];
    b.tube(MAT.skin, 16, 'y', t => { const y = WY - .01 + t * (SY - .03 - WY + .01), [rx, rz] = prof(armK, y); return { c: [X, y, 0], a: rx * L, b: rz * L } }, armW, RADIAL, [0, .12]);
    b.tube(MAT.jersey, 6, 'y', t => { const y = EY + .07 + t * (SY + .035 - EY - .07), [rx, rz] = prof(armK, y), f = .011;
      return { c: [X - s * .03 * sm((y - SY + .12) / .14), y, 0], a: rx * L + f, b: rz * L + f * .9 } }, armW, RADIAL, [0, .35]);
    b.ellipsoid(MAT.skin, [X, WY - .05, .008], .03 * L, .058, .04 * L, () => [[hd, 1]], 6);
  }

  /* 脖子、頭、耳、鼻 */
  const NY = D.PELVIS_Y + D.NECK_Y;
  b.tube(MAT.skin, 6, 'y', t => { const y = 1.54 + t * .19; return { c: [0, y, .005], a: .056 * bd.neck, b: .054 * bd.neck } }, (x, y) => blend(y, 1.59, NY + .02, B.spine, B.neck));
  const headK = [[1.635, .03, .03, .0], [1.66, .072, .08, .012], [1.7, .093, .108, .01], [1.75, .103, .116, 0], [1.81, .098, .108, -.005], [1.86, .062, .07, -.008], [1.875, .02, .02, -.01]];
  b.tube(MAT.skin, 14, 'y', t => { const y = 1.635 + t * .24, [rx, rz, cz] = prof(headK, y); return { c: [0, y, cz], a: rx, b: rz } }, () => [[B.neck, 1]]);
  for (const s of [-1, 1]) b.ellipsoid(MAT.skin, [s * .1, 1.75, -.01], .014, .028, .02, () => [[B.neck, 1]], 4, 8);
  const HW = () => [[B.neck, 1]];
  const faceZ = (x, y) => { const [rx, rz, cz] = prof(headK, y); return cz + rz * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2)) };   /* 臉表面的 z */
  b.ellipsoid(MAT.skin, [0, 1.737, faceZ(0, 1.737) - .004], .014, .022, .018, () => [[B.neck, 1]], 4, 8);
  b.ellipsoid(MAT.hair, [0, 1.785, -.022], .108, .075, .116, HW, 6);                    /* 帽子下露出的頭髮 */
  for (const s of [-1, 1]) {
    b.ellipsoid(MAT.hair, [s * .036, 1.762, faceZ(s * .036, 1.762) - .002], .011, .009, .006, HW, 3, 8);           /* 眼睛 */
    b.ellipsoid(MAT.hair, [s * .038, 1.783, faceZ(s * .038, 1.783) - .002], .02, .0045, .007, HW, 3, 8);           /* 眉毛 */
  }
  b.ellipsoid(MAT.hair, [0, 1.703, faceZ(0, 1.703) - .002], .018, .003, .006, HW, 3, 8);                  /* 嘴 */

  const g = b.geometry(); geoCache.set(key, g); return g;
}

/* ---------- 材質 ---------- */
const matCache = new Map();
const stdMat = (hex, rough = .6, metal = 0) => {
  const k = hex + ':' + rough + ':' + metal; let m = matCache.get(k);
  if (!m) { m = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHex(hex, THREE.SRGBColorSpace), roughness: rough, metalness: metal }); matCache.set(k, m) }
  return m;
};
const asMat = (v, rough) => v && v.isMaterial ? v : stdMat(v, rough);

/* 背號：每個號碼一個共用材質（跟舊的 numMat 相容，也可以直接用舊的） */
const numMats = new Map();
export function numMat(n) {
  let m = numMats.get(n); if (m) return m;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.font = "bold 92px 'Barlow Condensed','Arial Narrow',sans-serif"; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineWidth = 10;
  g.strokeStyle = '#14161c'; g.fillStyle = '#fff'; g.strokeText(String(n), 64, 68); g.fillText(String(n), 64, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  m = new THREE.MeshBasicMaterial({ map: t, transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); numMats.set(n, m); return m;
}

/* ---------- 配件 ---------- */
function makeCap(mat) {
  const g = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(.118, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat); dome.scale.set(1, .92, 1.06); dome.position.set(0, .12, -.004);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(.105, .105, .012, 18, 1, false, -Math.PI / 2, Math.PI), mat); brim.scale.set(.95, 1, 1); brim.position.set(0, .124, .06); brim.rotation.x = .12;
  const btn = new THREE.Mesh(new THREE.SphereGeometry(.012, 8, 4), mat); btn.position.set(0, .23, 0);
  g.add(dome, brim, btn); return g;   /* 掛在 neck 骨（舊 hg），原點 = y 1.65 */
}
function makeHelmet(mat) {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(.128, 20, 10, 0, Math.PI * 2, 0, Math.PI * .62), mat); shell.scale.set(1, .95, 1.08); shell.position.set(0, .105, -.008);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, .01, 16, 1, false, -Math.PI / 2, Math.PI), mat); brim.scale.set(1.1, 1, .7); brim.position.set(0, .12, .1); brim.rotation.x = .2;
  const flap = new THREE.Mesh(new THREE.SphereGeometry(.05, 10, 8), mat); flap.scale.set(.5, 1, 1); flap.position.set(.11, .07, -.005);   /* 右打的護耳朝投手（local +x） */
  g.add(shell, brim, flap); return g;
}
function makeGlove(leather) {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), leather); pad.scale.set(.038, .115, .085); pad.position.set(0, -.07, .02);
  const thumb = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), leather); thumb.scale.set(.03, .06, .03); thumb.position.set(.012, -.03, .09); thumb.rotation.x = -.5;
  const web = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), stdMat(0x5a3a1c, .7)); web.scale.set(.02, .05, .045); web.position.set(.025, -.14, .07);
  g.add(pad, thumb, web); return g;
}
export function makeBat(color = 0xc9a06a) {
  /* 握把在原點、往 +y 長（跟舊 batPivot 裡的 bat 一樣） */
  const pts = [[0, .012], [.004, .016], [.012, .013], [.2, .014], [.42, .022], [.62, .033], [.8, .034], [.85, .03], [.855, 0]].map(([y, r]) => new THREE.Vector2(r, y - .03));
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 12), stdMat(color, .45)); m.castShadow = true; return m;
}

/* ---------- 兩節 IK：讓「根→末端」距離 = d，方向不變 ---------- */
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _X = new THREE.Vector3(1, 0, 0), _DN = new THREE.Vector3(0, -1, 0);
function twoBone(l1, l2, d) {
  d = Math.max(Math.abs(l1 - l2) + 1e-3, Math.min(l1 + l2 - 1e-4, d));
  const a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const k = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2))));
  return [a, Math.PI - k];
}

/**
 * makePlayer(opts) → 球員物件
 *  opts.jersey  球衣：顏色 hex 或 Material（傳共用材質可整隊一起換色，例如舊的 matDef）
 *  opts.pants   褲子 hex/Material（預設白）   opts.sock 襪子（預設 = 球衣）
 *  opts.skin    膚色 hex（opts.hair 髮色）                      opts.num 背號（null = 不顯示）
 *  opts.build   'slim'|'normal'|'power'|'heavy' 或自訂 {h,chest,belly,hip,limb,neck}
 *  opts.height  身高 m（覆蓋 build.h）        opts.throws 'R'|'L'（預設 R）
 *  opts.glove   true = 手套戴在接球手         opts.head 'cap'|'helmet'|'none'
 *  opts.role    'batter' → 不做內層鏡射        opts.parent 直接 add 進去（例如 scene）
 */
export function makePlayer(opts = {}) {
  if (PACK && opts.style !== 'blocky') return makeRealPlayer(opts, realAsset(opts.build || 'normal'));
  const bd = Object.assign({}, typeof opts.build === 'object' ? opts.build : BUILDS[opts.build || 'normal']);
  if (opts.height) bd.h = opts.height;
  const jersey = asMat(opts.jersey ?? 0xffffff, .55), pants = asMat(opts.pants ?? 0xeeeeee, .75), skin = asMat(opts.skin ?? 0xc99572, .7);
  const dark = stdMat(0x1a1a1e, .5), hair = asMat(opts.hair ?? 0x1c1612, .8), sock = asMat(opts.sock ?? jersey, .6), leather = stdMat(0x8a5a2b, .6);
  const throws = opts.throws || 'R', mirrored = opts.role !== 'batter' && throws === 'R';

  const g = new THREE.Group(), body = new THREE.Group(), mir = new THREE.Group();
  body.scale.setScalar(bd.h / REF_H); mir.scale.x = mirrored ? -1 : 1; g.add(body); body.add(mir);

  /* 代理關節（舊介面）——不畫東西，只給 keyframe 寫值 */
  const P = () => new THREE.Object3D();
  const hips = P(), up = P(), hg = P(), l0 = P(), l1 = P(), a0 = P(), a1 = P();
  hips.position.y = D.PELVIS_Y; up.position.y = D.PELVIS_Y; hg.position.y = D.NECK_Y;
  l0.position.set(-D.HIP_X, D.HIP_Y, 0); l1.position.set(D.HIP_X, D.HIP_Y, 0);
  a0.position.set(-D.SH_X, D.SH_Y, 0); a1.position.set(D.SH_X, D.SH_Y, 0);
  mir.add(hips, up, l0, l1); up.add(hg, a0, a1);

  /* 骨頭 */
  const bones = Array.from({ length: NB }, () => new THREE.Bone());
  const at = (i, parent, x, y, z = 0) => { bones[i].position.set(x, y, z); bones[parent].add(bones[i]) };
  at(B.pelvis, B.root, 0, D.PELVIS_Y); at(B.spine, B.root, 0, D.PELVIS_Y); at(B.neck, B.spine, 0, D.NECK_Y);
  for (const [s, sh, el, hd] of [[-1, B.shL, B.elL, B.handL], [1, B.shR, B.elR, B.handR]]) { at(sh, B.spine, s * D.SH_X, D.SH_Y); at(el, sh, 0, -D.UPPER_ARM); at(hd, el, 0, -D.FOREARM) }
  for (const [s, th, kn, ft] of [[-1, B.thL, B.knL, B.ftL], [1, B.thR, B.knR, B.ftR]]) { at(th, B.root, s * D.HIP_X, D.HIP_Y); at(kn, th, 0, -D.THIGH); at(ft, kn, 0, -D.SHIN) }
  bones.forEach((b, i) => b.name = Object.keys(B)[i]);
  mir.add(bones[B.root]);

  const mesh = new THREE.SkinnedMesh(bodyGeometry(bd), [jersey, pants, skin, dark, sock, hair]);
  mesh.castShadow = true; mesh.frustumCulled = false; mir.add(mesh);
  g.updateMatrixWorld(true); mesh.bind(new THREE.Skeleton(bones));

  /* 掛點 */
  const sock_ = (bone, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); bones[bone].add(o); return o };
  const sockets = { handL: sock_(B.handL, 0, -D.HAND_GRIP, 0), handR: sock_(B.handR, 0, -D.HAND_GRIP, 0), head: sock_(B.neck, 0, 0, 0),
    back: sock_(B.spine, 0, D.NUM_Y - D.PELVIS_Y, 0), pelvis: sock_(B.pelvis, 0, 0, 0) };
  const tb = torsoAt(bd, D.NUM_Y), backZ = tb.cz - tb.rz - .006;   /* 背號貼在 y 1.3 的背面 */
  const numMesh = new THREE.Mesh(new THREE.PlaneGeometry(.24, .24), numMat(0)); numMesh.position.z = backZ; numMesh.rotation.y = Math.PI; numMesh.visible = false; sockets.back.add(numMesh);
  let cap = null, glove = null;
  const head = opts.head || 'cap';
  if (head !== 'none') { cap = head === 'helmet' ? makeHelmet(asMat(opts.jersey ?? 0xffffff, .3)) : makeCap(jersey); sockets.head.add(cap) }
  if (opts.glove) { glove = makeGlove(leather); sockets.handL.add(glove) }
  [cap, glove].forEach(o => o && o.traverse(m => { if (m.isMesh) m.castShadow = true }));

  const f = {
    g, legs: [l0, l1], arms: [a0, a1], numMesh, rig: { up, hips, hg, l0, l1, a0, a1 },
    ph: 0, px: 0, pz: 0, mesh, bones, sockets, cap, glove, build: bd, throws, mirrored, k: bd.h / REF_H,
    auto: true,                          /* 自動自然彎曲（跑步膝蓋、抬腿、手肘） */
    bend: { knee: [0, 0], elbow: [0, 0] },/* 額外彎曲（弧度，正 = 彎），整合時想手動調再用 */
    numN: undefined,
    setNum(n) { if (f.numN === n) return; f.numN = n; numMesh.visible = n != null; if (n != null) numMesh.material = numMat(n) },
    setHead(kind) { if (cap) sockets.head.remove(cap); cap = kind === 'none' ? null : kind === 'helmet' ? makeHelmet(asMat(opts.jersey ?? 0xffffff, .3)) : makeCap(jersey); if (cap) sockets.head.add(cap); f.cap = cap },
    /* 手的世界座標（i 跟 arms 同號：0 = local -x、1 = local +x） */
    handWorld(i, out = new THREE.Vector3()) { g.updateMatrixWorld(true); return (i ? sockets.handR : sockets.handL).getWorldPosition(out) },
  };
  if (opts.num != null) f.setNum(opts.num);

  /* 每幀：代理 → 骨頭（在 renderer 更新矩陣時自動跑） */
  const qOf = o => o.quaternion;   /* rotation 跟 quaternion 在 three 是同步的 */
  function limb(px, sh, el, end, l1, l2, d0, restK, kind, idx) {
    const s = px.scale.y, isArm = kind === 'arm';
    let reach = 0, d = isArm ? d0 * Math.min(s, restK) : D.LEG_LEN * Math.min(s, restK) - D.FOOT_H;
    if (isArm && s > 1) reach = Math.min(ARM_REACH, (s - 1) * d0);
    _v.copy(_DN).applyQuaternion(qOf(px));             /* 肢體方向（在父座標） */
    const phi = Math.acos(Math.max(-1, Math.min(1, -_v.y)));
    const [a, k] = twoBone(l1, l2, d);
    let free = 0;
    if (f.auto) {
      if (isArm) { const throwing = idx === 1; if ((!throwing || phi < THROW_ELBOW_PHI) && s >= .999) free = Math.max(Math.min(ELBOW_FREE_MAX, phi * ELBOW_FREE), runK * ELBOW_RUN) }
      else if (s >= .999) free = _v.z > 0 ? Math.max(0, phi - .2) * KNEE_FREE_FWD : phi * KNEE_FREE_BACK;
    }
    free += (isArm ? f.bend.elbow : f.bend.knee)[idx];
    sh.position.copy(px.position).addScaledVector(_v, reach);
    const sgn = isArm ? 1 : -1;                         /* 腿：膝蓋往前；手：手肘往後 */
    sh.quaternion.copy(qOf(px)).multiply(_q.setFromAxisAngle(_X, sgn * a));
    el.quaternion.setFromAxisAngle(_X, -sgn * (k + free));
    if (end) end.quaternion.setFromAxisAngle(_X, a - k - free);   /* 鞋子保持跟舊棍子同方向 */
  }
  let runK = 0;
  function sync() {
    const b = bones;
    /* 兩腿一前一後在甩 = 在跑/走 → 手肘自動彎（約 85 度） */
    const z0 = _v.copy(_DN).applyQuaternion(l0.quaternion).z, z1 = _v.copy(_DN).applyQuaternion(l1.quaternion).z;
    runK = z0 * z1 < 0 ? sm((Math.abs(z0 - z1) - RUN_SPLIT_LO) / RUN_SPLIT_W) : 0;
    b[B.pelvis].position.copy(hips.position); b[B.pelvis].quaternion.copy(hips.quaternion);
    b[B.spine].position.copy(up.position); b[B.spine].quaternion.copy(up.quaternion);
    b[B.neck].position.copy(hg.position); b[B.neck].quaternion.copy(hg.quaternion);
    limb(a0, b[B.shL], b[B.elL], null, D.UPPER_ARM, D.FOREARM + D.HAND_GRIP, D.ARM_LEN, ELBOW_REST, 'arm', 0);
    limb(a1, b[B.shR], b[B.elR], null, D.UPPER_ARM, D.FOREARM + D.HAND_GRIP, D.ARM_LEN, ELBOW_REST, 'arm', 1);
    limb(l0, b[B.thL], b[B.knL], b[B.ftL], D.THIGH, D.SHIN, D.LEG_LEN - D.FOOT_H, KNEE_REST, 'leg', 0);
    limb(l1, b[B.thR], b[B.knR], b[B.ftR], D.THIGH, D.SHIN, D.LEG_LEN - D.FOOT_H, KNEE_REST, 'leg', 1);
    numMesh.scale.x = Math.sign(g.scale.x || 1) * mir.scale.x < 0 ? -1 : 1;   /* 鏡射時背號不要反過來 */
  }
  const base = THREE.Object3D.prototype.updateMatrixWorld;
  g.updateMatrixWorld = function (force) { if (g.visible) sync(); return base.call(this, force) };   /* 藏起來的人不解 IK，省效能 */
  if (opts.parent) opts.parent.add(g);
  return f;
}

/* 方便：把舊 rigUpper(f) 換成這個 */
export const rigOf = f => f.rig;


/* =====================================================================
 * 寫實版：MakeHuman（CC0）人體，build_players.py 轉成 assets/player_<體型>.glb
 * 先 await loadPlayerAssets() 一次，之後 makePlayer() 自動用寫實版；沒載入就用上面的程式生成版。
 * 關節介面完全一樣：代理關節照舊吃 keyframe，「舊積木人的手/腳末端會在哪」當 IK 目標，
 * 真實骨架從自己的肩膀/髖關節去搆那個點，所以手握球棒、腳踩地的位置跟舊版一致。
 * 手指在素材裡已經彎成鬆拳（球、球棒都握得住），握點 = 拳心；帽子/頭盔照每個體型的頭型現做（fitCapGeometry）。
 * 雙手握棒時遠側那隻手搆不到，肩膀會往前送（最多 REAL_SH_REACH）。
 * ===================================================================== */
const ASSETS = new Map();
const NUM_GAP = .012;                    /* 背號離背多遠 */
/* 帽子（照頭的尺寸做）：帽緣前面在眼睛上方多少、後面在眼睛上方多少；量頭寬時排除耳朵的高度 */
const CAP_BAND_FRONT = .032, CAP_BAND_BACK = -.004, CAP_EAR_CLEAR = .045;
const CAP_GAP = .007, CAP_TOP_GAP = .012, CAP_SQUARE = 2.15, CAP_ROUND = 2.25;   /* 離頭皮多遠、頭頂多留、側面方度（越大越方）、平面方度 */
const CAP_TOP_TAPER = .01;               /* 往上每一層最多縮多少 */
const BRIM_LEN = .07, BRIM_SPAN = 1.02, BRIM_DROP = .26, BRIM_CURVE = .045, BRIM_TH = .006;  /* 帽舌長、左右展開角(rad)、下壓角、兩側下彎、厚度 */
const HELMET_GAP = .02, HELMET_BRIM = .04, HELMET_EAR_DROP = .075;
const REAL_SH_REACH = .14;               /* 手搆不到時肩膀最多往目標送多少（雙手握棒時遠側那隻手） */
const R_SLOTS = ['jersey', 'pants', 'skin', 'dark', 'sock', 'hair', 'eyeWhite', 'iris'];
/* players.b64.txt（players.bin 的 base64）：共用拓撲/骨架/權重 + normal 位置 + slim/power/heavy 位移（tools/pack_players.py 產生，取代 4 個 gltf）。
 * 體型可以混合：build 傳 'slim' 之類的字串，或 {slim:.3,power:.5} 這種權重（相對 normal）。 */
let PACK = null;
export async function loadPlayerAssets(base = './assets/') {
  /* 託管只收常見副檔名，二進位用 base64 文字放（.b64.txt，約 800KB） */
  const b64 = await (await fetch(base + 'players.b64.txt')).text(), bin = atob(b64.trim()), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const buf = u8.buffer;
  if (new TextDecoder().decode(new Uint8Array(buf, 0, 4)) !== 'YDPL') throw new Error('players.bin 格式不對');
  const hl = new DataView(buf).getUint32(4, true), H = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hl)));
  let o = 8 + hl; const n = H.n, take = (T, len) => { const a = new T(buf, o, len); o += len * T.BYTES_PER_ELEMENT; return a };
  const Pq = take(Uint16Array, n * 3), Dl = {};
  for (const k of H.kinds.slice(1)) Dl[k] = take(Int16Array, n * 3);
  const JI = take(Uint8Array, n * 4), WQ = take(Uint8Array, n * 4), IX = take(Uint16Array, H.ni);
  const P0 = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) P0[i] = H.lo[i % 3] + Pq[i] * H.ps[i % 3];
  const SI = new Uint16Array(JI), SW = new Float32Array(n * 4); for (let i = 0; i < n * 4; i++) SW[i] = WQ[i] / 255;
  PACK = { H, P0, D: Dl, SI, SW, IX, geos: new Map() };
  for (const k of H.kinds) ASSETS.set(k, realAsset(k));
  return ASSETS;
}
const buildKey = b => typeof b === 'string' ? b : JSON.stringify(b || {});
/* 取（快取）某體型的 geometry ＋ 頭型（帽子用）、背深（背號用） */
function realAsset(build) {
  const key = buildKey(build); if (PACK.geos.has(key)) return PACK.geos.get(key);
  const { H, P0, D: Dl, SI, SW, IX } = PACK, J = H.joints, n = H.n;
  const w = typeof build === 'string' ? (build === 'normal' ? {} : { [build]: 1 }) : build || {};
  const P = new Float32Array(P0);
  for (const k in w) { const d = Dl[k], a = w[k] * H.ds; if (!d || !a) continue; for (let i = 0; i < n * 3; i++) P[i] += d[i] * a }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4)); geo.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4));
  geo.setIndex(new THREE.BufferAttribute(IX, 1));
  for (const [start, count, name] of H.groups) geo.addGroup(start, count, R_SLOTS.indexOf(name));
  geo.computeVertexNormals(); geo.computeBoundingSphere();
  /* 頭的範圍：耳朵以上量寬/前後/頭頂；帽子照這個尺寸做 */
  const hb = { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9, top: -1e9 }; let backZ = 1e9;
  const eyeY = J.eyeL[1], pts = [];
  for (let i = 0; i < n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    if (SI[i * 4] === B.neck && SW[i * 4] > .9 && y > eyeY - .01) {
      pts.push(x, y, z); hb.top = Math.max(hb.top, y);
      if (y > eyeY + CAP_EAR_CLEAR) { hb.x0 = Math.min(hb.x0, x); hb.x1 = Math.max(hb.x1, x) }
      hb.z0 = Math.min(hb.z0, z); hb.z1 = Math.max(hb.z1, z);
    }
    if (Math.abs(y - D.NUM_Y) < .03 && Math.abs(x) < .04) backZ = Math.min(backZ, z);
  }
  hb.pts = new Float32Array(pts);
  const A = { key, geo, J, head: hb, backZ }; PACK.geos.set(key, A); return A;
}
/* 體型權重 → 身高（BUILDS 的 h 依權重內插） */
export function buildHeight(build) {
  if (typeof build === 'string') return (BUILDS[build] || BUILDS.normal).h;
  let h = BUILDS.normal.h; for (const k in build || {}) h += ((BUILDS[k] || BUILDS.normal).h - BUILDS.normal.h) * build[k]; return h;
}

/* 照頭型做的帽子／打擊頭盔。座標 = neck 骨的 local（rest 時 = 模型座標 − J.neck） */
function fitCapGeometry(A, kind) {
  const J = A.J, hb = A.head, N = J.neck, eyeY = J.eyeL[1];
  const helmet = kind === 'helmet', gap = helmet ? HELMET_GAP : CAP_GAP;
  const cx = (hb.x0 + hb.x1) / 2, cz = (hb.z0 + hb.z1) / 2;
  const ra = (hb.x1 - hb.x0) / 2, rf = hb.z1 - cz, rb = cz - hb.z0;
  const band = th => { const c = Math.cos(th); return eyeY + CAP_BAND_BACK + (CAP_BAND_FRONT - CAP_BAND_BACK) * (1 + c) / 2 - (helmet ? HELMET_EAR_DROP * Math.max(0, Math.sin(th) - .55) * 2.2 : 0) };   /* 頭盔：只有 +x 那側往下包耳朵 */
  const topY = hb.top + CAP_TOP_GAP + (helmet ? gap - CAP_GAP : 0);
  const spow = (v, e) => Math.sign(v) * Math.abs(v) ** (2 / e);
  /* 先算「這個方向頭皮最外面在哪」：在每個高度把頭的點投到 θ 上取最大半徑，保證帽子不穿頭 */
  const NT = 32, NH = 10, rMax = new Float32Array(NT * (NH + 1));
  const pts = hb.pts;
  for (let i = 0; i < pts.length; i += 3) {
    const x = pts[i] - cx, y = pts[i + 1], z = pts[i + 2] - cz, th = Math.atan2(x, z);
    const b = band(th), h = (y - b) / (topY - b); if (h < -.05) continue;
    if (Math.abs(x) > ra + .004 && y < eyeY + CAP_EAR_CLEAR) continue;   /* 耳朵 */
    const ti = ((Math.round(th / (2 * Math.PI) * NT) % NT) + NT) % NT, hi = Math.max(0, Math.min(NH, Math.round(h * NH)));
    const r = Math.hypot(x, z); if (r > rMax[ti * (NH + 1) + hi]) rMax[ti * (NH + 1) + hi] = r;
  }
  const rAt = (th, h) => {   /* 參數殼的半徑：超橢圓平面 × 側面方度 */
    const c = Math.cos(th), sn = Math.sin(th), u = spow(sn, CAP_ROUND) * ra, v = spow(c, CAP_ROUND) * (c > 0 ? rf : rb);
    const s = (1 - Math.max(0, h) ** CAP_SQUARE) ** (1 / CAP_SQUARE); return [u * s, v * s];
  };
  /* 每個 (θ, 高度) 的放大倍數：參數殼要包住頭皮（含 gap），兩個方向都平滑，帽子才不會歪七扭八 */
  const NH1 = NH + 1, grow = new Float32Array(NT * NH1).fill(1);
  for (let ti = 0; ti < NT; ti++) for (let hi = 0; hi <= NH; hi++) {
    const r = rMax[ti * NH1 + hi]; if (!r) continue;
    const th = ti / NT * 2 * Math.PI, [u, v] = rAt(th, hi / NH), rr = Math.hypot(u, v);
    if (rr > 1e-3) grow[ti * NH1 + hi] = Math.max(1, (r + gap) / rr);
  }
  for (let it = 0; it < 3; it++) {                    /* 只往大的方向平滑（不會因平滑又穿頭） */
    const g0 = grow.slice();
    for (let ti = 0; ti < NT; ti++) for (let hi = 0; hi <= NH; hi++) {
      const at = (t, h) => g0[((t + NT) % NT) * NH1 + Math.max(0, Math.min(NH, h))];
      grow[ti * NH1 + hi] = Math.max(at(ti, hi), (at(ti - 1, hi) + at(ti + 1, hi) + at(ti, hi - 1) + at(ti, hi + 1)) / 4);
    }
  }
  for (let ti = 0; ti < NT; ti++) for (let hi = 1; hi <= NH; hi++)   /* 往上只會變大：頂部圓、不會尖 */
    grow[ti * NH1 + hi] = Math.max(grow[ti * NH1 + hi], grow[ti * NH1 + hi - 1] * (1 - CAP_TOP_TAPER));
  const growAt = (th, h = 0) => {
    const f = ((th / (2 * Math.PI)) * NT % NT + NT) % NT, i = Math.floor(f), t = f - i, hf = Math.max(0, Math.min(NH, h * NH)), j = Math.min(NH - 1, Math.floor(hf)), s = hf - j;
    const G = (a, b) => grow[(a % NT) * NH1 + b];
    return (G(i, j) * (1 - t) + G(i + 1, j) * t) * (1 - s) + (G(i, j + 1) * (1 - t) + G(i + 1, j + 1) * t) * s;
  };

  const pos = [], idx = [], SEG = 40, RING = 18;
  /* 帽殼（環在頂部比較密，最上面用一個中心點收口，避免極點星形陰影） */
  for (let r = 0; r <= RING; r++) {
    const h = Math.sin(r / RING * Math.PI / 2) * .985;
    for (let j = 0; j < SEG; j++) {
      const th = j / SEG * 2 * Math.PI, [u, v] = rAt(th, h), k = growAt(th, h), b = band(th);
      pos.push(cx + u * k - N[0], b + (topY - b) * h - N[1], cz + v * k - N[2]);
    }
  }
  for (let r = 0; r < RING; r++) for (let j = 0; j < SEG; j++) {
    const a = r * SEG + j, b = r * SEG + (j + 1) % SEG, c = a + SEG, d = b + SEG; idx.push(a, b, c, b, d, c);
  }
  const pole = pos.length / 3; pos.push(cx - N[0], topY - N[1], cz - N[2]);
  for (let j = 0; j < SEG; j++) idx.push(RING * SEG + j, RING * SEG + (j + 1) % SEG, pole);
  /* 帽頂扣子 */
  const top = pos.length / 3, BTN = .011;
  const capTop = [cx - N[0], topY - N[1] + .002, cz - N[2]];
  for (let r = 0; r <= 3; r++) for (let j = 0; j < 8; j++) { const a = r / 3 * Math.PI / 2, t = j / 8 * 2 * Math.PI; pos.push(capTop[0] + Math.cos(a) * Math.sin(t) * BTN, capTop[1] + Math.sin(a) * BTN * .6, capTop[2] + Math.cos(a) * Math.cos(t) * BTN) }
  for (let r = 0; r < 3; r++) for (let j = 0; j < 8; j++) { const a = top + r * 8 + j, b = top + r * 8 + (j + 1) % 8; idx.push(a, a + 8, b, b, a + 8, b + 8) }
  /* 帽舌：前半圈帽緣往前伸，兩側下彎，有厚度 */
  const len = helmet ? HELMET_BRIM : BRIM_LEN, NU = 24, NV = 5, b0 = pos.length / 3;
  const brimPt = (u, v, dn) => {
    const th = (u - .5) * BRIM_SPAN * 2, [bu, bv] = rAt(th, 0), k = growAt(th);
    const ex = Math.cos((u - .5) * Math.PI) ** .6;                  /* 中間最長、兩端收 */
    const ox = bu * k, oz = bv * k, nl = Math.hypot(ox, oz) || 1;
    const out = v * len * ex, drop = out * Math.tan(BRIM_DROP) + BRIM_CURVE * ((u - .5) * 2) ** 2 * v;
    return [cx + ox + ox / nl * out - N[0], band(th) - drop - dn - N[1] + .002, cz + oz + oz / nl * out - N[2]];
  };
  for (const dn of [0, BRIM_TH]) for (let v = 0; v <= NV; v++) for (let u = 0; u <= NU; u++) pos.push(...brimPt(u / NU, v / NV, dn));
  const W = NU + 1, L = (NV + 1) * W, at = (layer, v, u) => b0 + layer * L + v * W + u;
  for (let v = 0; v < NV; v++) for (let u = 0; u < NU; u++) {
    idx.push(at(0, v, u), at(0, v + 1, u), at(0, v, u + 1), at(0, v, u + 1), at(0, v + 1, u), at(0, v + 1, u + 1));   /* 上面 */
    idx.push(at(1, v, u), at(1, v, u + 1), at(1, v + 1, u), at(1, v, u + 1), at(1, v + 1, u + 1), at(1, v + 1, u));   /* 下面 */
  }
  for (let u = 0; u < NU; u++) { const a = at(0, NV, u), b = at(0, NV, u + 1), c = at(1, NV, u), d = at(1, NV, u + 1); idx.push(a, c, b, b, c, d) }   /* 外緣 */
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  /* 頭盔護耳：在 local +x 那側（右打朝投手） */
  let flap = null;
  if (helmet) { const th = Math.PI / 2, [u] = rAt(th, 0), k = growAt(th); flap = [cx + u * k - N[0] + .004, eyeY - .03 - N[1], cz - .005 - N[2]] }
  return { geo, flap };
}
const capGeoCache = new Map();
const V3 = a => new THREE.Vector3(...a);
const _q3 = new THREE.Quaternion(), _q4 = new THREE.Quaternion(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _Y = new THREE.Vector3(0, -1, 0);
function makeRealPlayer(opts, A) {
  const bd = { h: opts.height || buildHeight(opts.build || 'normal') };
  const jersey = asMat(opts.jersey ?? 0xffffff, .55), pants = asMat(opts.pants ?? 0xeeeeee, .75), skin = asMat(opts.skin ?? 0xc99572, .62);
  const dark = stdMat(0x1a1a1e, .5), sock = asMat(opts.sock ?? jersey, .6), hair = asMat(opts.hair ?? 0x1c1612, .8), leather = stdMat(0x8a5a2b, .6);
  let throws = opts.throws || 'R', mirrored = opts.role !== 'batter' && throws === 'R', headKind = opts.head || 'cap';
  const J = A.J;

  const g = new THREE.Group(), body = new THREE.Group(), mir = new THREE.Group();
  body.scale.setScalar(bd.h / REF_H); mir.scale.x = mirrored ? -1 : 1; g.add(body); body.add(mir);
  /* 代理關節：位置跟舊積木人一樣 */
  const P = () => new THREE.Object3D();
  const hips = P(), up = P(), hg = P(), l0 = P(), l1 = P(), a0 = P(), a1 = P();
  hips.position.y = D.PELVIS_Y; up.position.y = D.PELVIS_Y; hg.position.y = D.NECK_Y;
  l0.position.set(-D.HIP_X, D.HIP_Y, 0); l1.position.set(D.HIP_X, D.HIP_Y, 0);
  a0.position.set(-D.SH_X, D.SH_Y, 0); a1.position.set(D.SH_X, D.SH_Y, 0);
  mir.add(hips, up, l0, l1); up.add(hg, a0, a1);

  /* 真實骨架（位置 = glb 的關節點） */
  const names = Object.keys(B), bones = names.map(n => { const b = new THREE.Bone(); b.name = n; return b });
  const PAR = [-1, 0, 0, 2, 2, 4, 5, 2, 7, 8, 0, 10, 11, 0, 13, 14];
  names.forEach((n, i) => { const p = V3(J[n]); if (PAR[i] >= 0) { p.sub(V3(J[names[PAR[i]]])); bones[PAR[i]].add(bones[i]) } bones[i].position.copy(p) });
  mir.add(bones[0]);
  const mesh = new THREE.SkinnedMesh(A.geo, [jersey, pants, skin, dark, sock, hair, stdMat(0xf2f0ea, .4), stdMat(0x2a1d14, .3)]);
  mesh.castShadow = true; mesh.frustumCulled = false; mir.add(mesh);
  g.updateMatrixWorld(true); mesh.bind(new THREE.Skeleton(bones));

  /* 每條手腳：靜止方向、長度、把靜止方向轉成「往下」的旋轉 */
  const chain = (sh, el, end, grip) => {
    const S = V3(J[sh]), E = V3(J[el]), T = V3(J[grip || end]);
    const u0 = E.clone().sub(S), f0 = T.clone().sub(E), l1 = u0.length(), l2 = f0.length();
    return { l1, l2, R0u: new THREE.Quaternion().setFromUnitVectors(u0.normalize(), _Y), R0l: new THREE.Quaternion().setFromUnitVectors(f0.normalize(), _Y) };
  };
  const C = { aL: chain('shL', 'elL', 'handL', 'gripL'), aR: chain('shR', 'elR', 'handR', 'gripR'), lL: chain('thL', 'knL', 'ftL'), lR: chain('thR', 'knR', 'ftR') };
  /* 掛點 */
  const sockets = { head: new THREE.Object3D(), back: new THREE.Object3D(), pelvis: new THREE.Object3D(), handL: new THREE.Object3D(), handR: new THREE.Object3D() };
  for (const [k, bn, ch, grip] of [['handL', B.handL, C.aL, 'gripL'], ['handR', B.handR, C.aR, 'gripR']]) {
    sockets[k].position.copy(V3(J[grip]).sub(V3(J[k]))); sockets[k].quaternion.copy(ch.R0l).invert(); bones[bn].add(sockets[k]);
  }
  bones[B.spine].add(sockets.back); sockets.back.position.set(0, D.NUM_Y - J.spine[1], A.backZ - J.spine[2]);
  bones[B.pelvis].add(sockets.pelvis);
  const hb = A.head, hcz = (hb.z0 + hb.z1) / 2;
  bones[B.neck].add(sockets.head); sockets.head.position.set(0, J.eyeL[1] - J.neck[1] + CAP_BAND_FRONT, hcz - J.neck[2]);   /* 舊的掛點，保留給外部用 */
  const capRoot = new THREE.Object3D(); bones[B.neck].add(capRoot);   /* 帽子幾何本身就是 neck local 座標 */
  const numMesh = new THREE.Mesh(new THREE.PlaneGeometry(.2, .2), numMat(0)); numMesh.position.z = -NUM_GAP; numMesh.rotation.y = Math.PI; numMesh.visible = false; sockets.back.add(numMesh);
  let cap = null, glove = null;
  const putHead = kind => {
    if (cap) capRoot.remove(cap); cap = null; if (kind === 'none') return;
    const key = A.key + ':' + kind; let cg = capGeoCache.get(key); if (!cg) { cg = fitCapGeometry(A, kind); capGeoCache.set(key, cg) }
    const m = kind === 'helmet' ? asMat(opts.jersey ?? 0xffffff, .3) : jersey;
    cap = new THREE.Group(); cap.add(new THREE.Mesh(cg.geo, m));
    capRoot.add(cap); cap.traverse(o => { if (o.isMesh) o.castShadow = true });
  };
  putHead(opts.head || 'cap');
  if (opts.glove) { glove = makeGlove(leather); glove.position.y = .05; sockets.handL.add(glove); glove.traverse(m => { if (m.isMesh) m.castShadow = true }) }

  const f = {
    g, legs: [l0, l1], arms: [a0, a1], numMesh, rig: { up, hips, hg, l0, l1, a0, a1 },
    ph: 0, px: 0, pz: 0, mesh, bones, sockets, get cap() { return cap }, glove, build: bd, throws, mirrored, k: bd.h / REF_H, real: true,
    auto: true, bend: { knee: [0, 0], elbow: [0, 0] }, numN: undefined,
    setNum(n) { if (f.numN === n) return; f.numN = n; numMesh.visible = n != null; if (n != null) numMesh.material = numMat(n) },
    setHead(kind) { headKind = kind; putHead(kind) },
    handWorld(i, out = new THREE.Vector3()) { g.updateMatrixWorld(true); return (i ? sockets.handR : sockets.handL).getWorldPosition(out) },
    /* 換慣用手：'R' 內層鏡射（舊 keyframe → 右投），'L' 不鏡射。打者不動 */
    setThrows(t) { if (opts.role === 'batter' || t === f.throws) return; f.throws = throws = t; f.mirrored = mirrored = t === 'R'; mir.scale.x = mirrored ? -1 : 1 },
    /* 換體型：同一副骨架（關節點各體型相同），換 geometry（快取）、帽子照新頭型重做、整體縮放成該體型身高 */
    setBuild(build, height) { const k = buildKey(build) + ':' + (height || ''); if (f.buildKey === k) return; f.buildKey = k;
      A = realAsset(build); mesh.geometry = A.geo; putHead(headKind); bd.h = height || buildHeight(build); f.k = bd.h / REF_H; body.scale.setScalar(f.k) },
  };
  f.buildKey = buildKey(opts.build || 'normal') + ':' + (opts.height || '');
  if (opts.num != null) f.setNum(opts.num);

  /* up 代理（原點在舊的 .95）→ spine 骨（原點在真實腰椎）的座標換算 */
  const upMinusSpine = new THREE.Vector3(0, D.PELVIS_Y, 0).sub(V3(J.spine));
  let runK = 0;
  function solve(px, ch, upper, lower, end, rootPos, isArm, idx, inSpine) {
    const s = px.scale.y, q = px.quaternion;
    _v.copy(_DN).applyQuaternion(q);                           /* 舊棍子方向 */
    const len = isArm ? D.ARM_LEN * Math.min(s, 1 + ARM_REACH / D.ARM_LEN) : D.LEG_LEN * Math.min(s, 1.02) - D.FOOT_H;
    _v2.copy(px.position).addScaledVector(_v, len);            /* 舊手（或腳踝）在父座標的位置 */
    if (inSpine) _v2.add(_v3.copy(upMinusSpine).applyQuaternion(_q4.copy(up.quaternion).invert()));
    _v2.sub(rootPos);                                          /* 從真實肩/髖指過去 */
    let dist = _v2.length(); _v2.divideScalar(dist || 1);
    if (isArm) {                                               /* 搆不到 → 肩膀往目標送（最多 REAL_SH_REACH） */
      const over = Math.max(0, Math.min(REAL_SH_REACH, dist - (ch.l1 + ch.l2) * ELBOW_REST));
      upper.position.copy(shRest[idx]).addScaledVector(_v2, over); dist -= over;
    }
    const phi = Math.acos(Math.max(-1, Math.min(1, -_v.y)));
    let [a, k] = twoBone(ch.l1, ch.l2, Math.min(dist, (ch.l1 + ch.l2) * (isArm ? ELBOW_REST : KNEE_REST) / (s < 1 ? 1 : 1)));
    let free = 0;
    if (f.auto && s >= .999) {
      if (isArm) { if (idx === 0 || phi < THROW_ELBOW_PHI) free = Math.max(Math.min(ELBOW_FREE_MAX, phi * ELBOW_FREE), runK * ELBOW_RUN) }
      else free = _v.z > 0 ? Math.max(0, phi - .2) * KNEE_FREE_FWD : phi * KNEE_FREE_BACK;
    }
    free += (isArm ? f.bend.elbow : f.bend.knee)[idx];
    _q3.setFromUnitVectors(_v, _v2).multiply(q);               /* 舊的轉法（含扭轉），方向改成真的指向 */
    const sg = isArm ? 1 : -1;
    upper.quaternion.copy(_q3).multiply(_q.setFromAxisAngle(_X, sg * a)).multiply(ch.R0u);
    lower.quaternion.copy(ch.R0u).invert().multiply(_q.setFromAxisAngle(_X, -sg * (k + free))).multiply(ch.R0l);
    if (end) end.quaternion.copy(ch.R0l).invert().multiply(_q.setFromAxisAngle(_X, a - k - free));
  }
  const SH = [V3(J.shL).sub(V3(J.spine)), V3(J.shR).sub(V3(J.spine))], TH = [V3(J.thL), V3(J.thR)];
  const shRest = [bones[B.shL].position.clone(), bones[B.shR].position.clone()];
  function sync() {
    const b = bones;
    const z0 = _v.copy(_DN).applyQuaternion(l0.quaternion).z, z1 = _v.copy(_DN).applyQuaternion(l1.quaternion).z;
    runK = z0 * z1 < 0 ? sm((Math.abs(z0 - z1) - RUN_SPLIT_LO) / RUN_SPLIT_W) : 0;
    b[B.pelvis].quaternion.copy(hips.quaternion); b[B.spine].quaternion.copy(up.quaternion); b[B.neck].quaternion.copy(hg.quaternion);
    solve(a0, C.aL, b[B.shL], b[B.elL], null, SH[0], true, 0, true);
    solve(a1, C.aR, b[B.shR], b[B.elR], null, SH[1], true, 1, true);
    solve(l0, C.lL, b[B.thL], b[B.knL], b[B.ftL], TH[0], false, 0, false);
    solve(l1, C.lR, b[B.thR], b[B.knR], b[B.ftR], TH[1], false, 1, false);
    numMesh.scale.x = Math.sign(g.scale.x || 1) * mir.scale.x < 0 ? -1 : 1;
  }
  const base = THREE.Object3D.prototype.updateMatrixWorld;
  g.updateMatrixWorld = function (force) { if (g.visible) sync(); return base.call(this, force) };   /* 藏起來的人不解 IK，省效能 */
  if (opts.parent) opts.parent.add(g);
  return f;
}
