"""Convert a MakeHuman (CC0 assets) body into a cloudball glb: 24 bones (the old 16 plus chest, clavicles, forearm twist, toes, head), separate materials for jersey/pants/socks/shoes/skin/hair/eyes.
Usage: python3 build_players.py <makehuman repo path> <output folder>, then run python3 glb2gltf.py in.glb out.gltf.json on each glb (artifacts cannot hold .glb)
Asset licence: the MakeHuman base mesh, targets and default rig/weights are all CC0 (see LICENSE.ASSETS.md in that repo).
A sparse clone must include makehuman/data/3dobjs, rigs, targets/macrodetails, targets/stomach, targets/torso."""
import sys, json, struct, re, numpy as np

MH, OUT = sys.argv[1], sys.argv[2]
D = MH + '/makehuman/data/'
REF_H = 1.86            # Top-of-head height of the unscaled body (matches players.js)
JERSEY_PUFF, PANTS_PUFF = .02, .018
HEAVY_W, HEAVY_BELLY, HEAVY_DEPTH = 1.6, .9, .5          # Extrapolated weight for the heavy build
# Fist (loose enough to hold a bat or ball): bend angle (rad) for each of the three finger segments; the thumb is separate
GRIP_CURL = [1.2, 1.45, .75]
THUMB_CURL = [0, .7, .9]          # First segment is replaced by 'turn toward the index finger'; segments 2 and 3 bend toward the little finger
THUMB_OUT = .018                   # How far (m) the thumb sits outside the index finger
PALM_OFF = .012                    # Palm surface offset from the metacarpals (m)
MH_UNIT = .1                       # MakeHuman raw units: 1 unit = 0.1 m
GRIP_HOLE = .5                     # Grip point = between the palm and the curled knuckles (0 = palm, 1 = knuckles)
# Clothing boundaries (m, unscaled body coordinates, neck joint at the origin)
NECK_BACK, NECK_TILT = .012, .3    # How much higher the back of the collar is than the neck joint, and the low-front/high-back slope (z per m)
VNECK_DEPTH, VNECK_W = .045, .075  # Front V-neck depth and half-width
SLEEVE_T = .45                     # Sleeve cuff position as a fraction of the upper arm
BELT_H = .04                       # Belt width
HEM_T = .52                        # Pant-leg hem: fraction from ankle to knee
# Flatten the crotch / lower belly (baseball pants are flat in front)
CROTCH_Y0, CROTCH_Y1, CROTCH_X = .84, 1.06, .13
CROTCH_ZMAX, CROTCH_KEEP = .095, .25   # Max forward bulge in z; fraction of the excess kept
CROSS_Y0, CROSS_Y1, CROSS_X, CROSS_BACK, CROSS_UP = .74, .95, .085, .05, .04   # Pull the crotch between the legs back and up
CLOTH_SMOOTH_ITERS, CLOTH_SMOOTH_K = 30, .6   # Smooth out muscle lines in clothed areas (Laplacian smoothing)   # Cloth offset from the skin (m, unscaled)

# The old 16-bone rig. Materials and the old weight split are still computed on it, so the mesh and every old pose stay the same
BONES16 = ['root', 'pelvis', 'spine', 'neck', 'shL', 'elL', 'handL', 'shR', 'elR', 'handR', 'thL', 'knL', 'ftL', 'thR', 'knR', 'ftR']
BI = {n: i for i, n in enumerate(BONES16)}
# Our 24 bones (order = B in players.js): the old 16 keep their indices, the new 8 are appended.
# wrL/wrR = forearm twist (MakeHuman lowerarm02); the hand hangs under it, so hand turn and wrist bend are separate bones
NEW_BONES = ['chest', 'clL', 'clR', 'wrL', 'wrR', 'toeL', 'toeR', 'head']
BONES = BONES16 + NEW_BONES
BI24 = {n: i for i, n in enumerate(BONES)}
PARENT = [-1, 0, 0, BI24['chest'], BI24['clL'], 4, BI24['wrL'], BI24['clR'], 7, BI24['wrR'], 0, 10, 11, 0, 13, 14,
          2, BI24['chest'], BI24['chest'], 5, 8, 12, 15, 3]
# Old bone each new bone splits off from: while a new bone keeps its identity rest rotation it moves exactly with that bone
GROUP16 = list(range(len(BONES16))) + [BI[b] for b in ('spine', 'spine', 'spine', 'elL', 'elR', 'ftL', 'ftR', 'neck')]
MAX_INF = 4                         # Bone influences per vertex (three.js SkinnedMesh)
W_Q = 255                           # Weights are stored as u8 (pack_players.py); the split below is done on those integers
# MakeHuman .R = the figure's right hand = -x = our arms[0] (L index)
SIDE = {'R': 'L', 'L': 'R'}

def map_bone(n):
    m = re.match(r'(.*)\.(L|R)$', n); base, s = (m.group(1), SIDE[m.group(2)]) if m else (n, '')
    if base in ('root', 'pelvis', 'spine05'): return 'pelvis'
    if base.startswith('spine') or base in ('clavicle', 'shoulder01', 'breast'): return 'spine'
    if base.startswith('upperarm'): return 'sh' + s
    if base.startswith('lowerarm'): return 'el' + s
    if base in ('wrist',) or base.startswith('metacarpal') or base.startswith('finger'): return 'hand' + s
    if base.startswith('upperleg'): return 'th' + s
    if base.startswith('lowerleg'): return 'kn' + s
    if base == 'foot' or base.startswith('toe'): return 'ft' + s
    return 'neck'

def map_bone24(n):
    """Same as map_bone, with the new bones split off (collapsing through GROUP16 gives map_bone back)."""
    m = re.match(r'(.*)\.(L|R)$', n); base, s = (m.group(1), SIDE[m.group(2)]) if m else (n, '')
    if base in ('spine02', 'spine01', 'breast'): return 'chest'
    if base in ('clavicle', 'shoulder01'): return 'cl' + s
    if base == 'lowerarm02': return 'wr' + s
    if base.startswith('toe'): return 'toe' + s
    old = map_bone(n)
    return 'head' if old == 'neck' and not base.startswith('neck') else old

def split_weights(idx, q, W24):
    """Split each old (bone, u8 weight) slot over that bone's new sub-bones in proportion to MakeHuman's weights.
    Group sums stay equal to the old integers, so with the new bones at identity every vertex lands where it did.
    If more than MAX_INF influences result, the smallest sub-bone folds back into the biggest one of its own group.
    Slot order: old slot order, biggest first inside a group (slot 0 is in the old dominant bone's group)."""
    nv = len(idx); JI = np.zeros((nv, MAX_INF), 'u1'); WQ = np.zeros((nv, MAX_INF), np.int32)
    members = {g: [b for b in range(len(BONES)) if GROUP16[b] == g] for g in range(len(BONES16))}
    for v in range(nv):
        ent = []                                  # [slot, bone, weight]
        for k in range(MAX_INF):
            g, w = int(idx[v, k]), int(q[v, k]); mb = members[g]; raw = W24[v, mb]
            if len(mb) == 1 or w == 0 or raw.sum() <= 0: ent.append([k, mb[0] if raw.sum() <= 0 or len(mb) == 1 else mb[int(raw.argmax())], w]); continue
            sh = w * raw / raw.sum(); fl = np.floor(sh).astype(int); r = w - fl.sum()
            for j in np.argsort(-(sh - fl), kind='stable')[:r]: fl[j] += 1
            got = [[k, mb[j], int(fl[j])] for j in range(len(mb)) if fl[j] > 0]
            ent += got or [[k, mb[int(raw.argmax())], w]]
        while len(ent) > MAX_INF:
            multi = [e for e in ent if sum(1 for o in ent if o[0] == e[0]) > 1]
            e = min(multi, key=lambda x: x[2]); ent.remove(e)
            max((o for o in ent if o[0] == e[0]), key=lambda x: x[2])[2] += e[2]
        ent.sort(key=lambda x: (x[0], -x[2]))
        for k, (_, b, w) in enumerate(ent): JI[v, k], WQ[v, k] = b, w
    return JI, WQ

def load_obj(p):
    V, F, G, g = [], [], [], ''
    for ln in open(p):
        if ln.startswith('v '): V.append([float(x) for x in ln.split()[1:4]])
        elif ln.startswith('g '): g = ln.split()[1]
        elif ln.startswith('f '): F.append([int(t.split('/')[0]) - 1 for t in ln.split()[1:]]); G.append(g)
    return np.array(V), F, G

def load_target(name):
    off = {}
    for ln in open(D + 'targets/' + (name if '/' in name else 'macrodetails/' + name) + '.target'):
        if ln[0].isdigit():
            a = ln.split(); off[int(a[0])] = np.array([float(x) for x in a[1:4]])
    return off

V0, F, G = load_obj(D + '3dobjs/base.obj')
SK = json.load(open(D + 'rigs/default.mhskel')); WT = json.load(open(D + 'rigs/default_weights.mhw'))['weights']

BUILDS = {   # Builds: MakeHuman macro target weights
    'slim':   {'universal-male-young-averagemuscle-minweight': .7, 'universal-male-young-averagemuscle-averageweight': .3},
    'normal': {'universal-male-young-averagemuscle-averageweight': .6, 'universal-male-young-maxmuscle-averageweight': .4},
    'power':  {'universal-male-young-maxmuscle-averageweight': .6, 'universal-male-young-maxmuscle-maxweight': .4},
    # Heavy: weights above 1 push outward (MakeHuman targets are linear offsets, so they extrapolate), plus extra belly and torso depth
    'heavy':  {'universal-male-young-averagemuscle-maxweight': HEAVY_W, 'universal-male-young-maxmuscle-maxweight': .3,
               'stomach/stomach-pregnant-incr': HEAVY_BELLY, 'torso/torso-scale-depth-incr': HEAVY_DEPTH},
}
RACE = {'asian-male-young': .7, 'caucasian-male-young': .3}

def jpos(V, key): return V[SK['joints'][key]].mean(0)


def rot(axis, ang):
    a = axis / np.linalg.norm(axis); c, s_ = np.cos(ang), np.sin(ang); x, y, z = a
    return np.array([[c + x*x*(1-c), x*y*(1-c) - z*s_, x*z*(1-c) + y*s_], [y*x*(1-c) + z*s_, c + y*y*(1-c), y*z*(1-c) - x*s_], [z*x*(1-c) - y*s_, z*y*(1-c) + x*s_, c + z*z*(1-c)]])

def rot_between(a, b):
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b); ax = np.cross(a, b)
    return rot(ax, np.arctan2(np.linalg.norm(ax), np.dot(a, b)))

def curl_fingers(V):
    """Curl the fingers into a loose fist (linear skinning, using MakeHuman's own finger bones and weights). Returns the new vertices and the grip point of each hand."""
    V = V.copy(); grips = {}
    for sd in ('R', 'L'):
        hd = lambda b: jpos(V, f'{b}.{sd}____head'); tl = lambda b: jpos(V, f'{b}.{sd}____tail')
        k = hd('finger5-1') - hd('finger2-1'); d3 = tl('finger3-1') - hd('finger3-1')
        c = np.cross(k, d3); c /= np.linalg.norm(c)
        kc = np.mean([hd(f'finger{i}-1') for i in range(2, 6)], 0)
        n = c * np.sign(np.dot(tl('finger1-3') - kc, c))          # Palm direction (thumb side)
        G = {}                                                   # Bone -> (R, t): p' = R p + t
        pip = []
        # Middle segment of the index finger after bending (the thumb presses here)
        h1, h2 = hd('finger2-1'), hd('finger2-2'); R1 = rot(np.cross(tl('finger2-1') - h1, n), GRIP_CURL[0])
        pip_idx = R1 @ (h2 - h1) + h1
        R2 = rot(np.cross(tl('finger2-2') - h2, n), GRIP_CURL[1]); pip_idx = (pip_idx + R1 @ (R2 @ (tl('finger2-2') - h2)) + pip_idx) / 2
        for fi in (2, 3, 4, 5, 1):
            Rp, tp = np.eye(3), np.zeros(3)
            for sg in range(1, 4):
                b = f'finger{fi}-{sg}'; h, t_ = hd(b), tl(b)
                ang = (THUMB_CURL if fi == 1 else GRIP_CURL)[sg - 1]
                R = rot(np.cross(t_ - h, k if fi == 1 else n), ang)   # The thumb bends toward the little finger, the other fingers toward the palm
                if fi == 1 and sg == 1:                          # Thumb first rotates as a whole toward the index middle segment (opposition), then bends
                    tip = tl('finger1-3') - h; tgt = pip_idx + n * THUMB_OUT / MH_UNIT - h
                    R = rot_between(tip, tgt) if np.linalg.norm(np.cross(tip, tgt)) > 1e-9 else np.eye(3)
                Rl, tl_ = R, h - R @ h                           # Rotate about h
                Rp, tp = Rp @ Rl, Rp @ tl_ + tp
                G[f'{b}.{sd}'] = (Rp.copy(), tp.copy())
                if fi > 1 and sg == 2: pip.append(Rp @ h + tp)   # Second knuckle position after bending
        V0_ = V.copy(); acc = np.zeros_like(V); wsum = np.zeros(len(V))
        for b, (R, t) in G.items():
            for vi, w in WT.get(b, []):
                acc[vi] += w * (V0_[vi] @ R.T + t); wsum[vi] += w
        m = wsum > 0
        V[m] = acc[m] + (1 - wsum[m])[:, None] * V0_[m]
        palm = np.mean([(hd(f'metacarpal{i}') + tl(f'metacarpal{i}')) / 2 for i in range(1, 5)], 0) + n * PALM_OFF / MH_UNIT
        grips[sd] = palm * (1 - GRIP_HOLE) + np.mean(pip, 0) * GRIP_HOLE
    return V, grips

def build(kind):
    V = V0.copy()
    for name, w in list(RACE.items()) + list(BUILDS[kind].items()):
        for i, d in load_target(name).items(): V[i] += d * w
    V, grips = curl_fingers(V)
    body = [k for k, g in enumerate(G) if g == 'body']
    used = sorted({i for k in body for i in F[k]}); remap = {o: n for n, o in enumerate(used)}
    P = V[used]
    # Align: soles at y=0, top of head = REF_H, centred in x/z
    lo, hi = P[:, 1].min(), P[:, 1].max(); s = REF_H / (hi - lo)
    ctr = np.array([0, lo, 0.]); ctr[[0, 2]] = 0
    T = lambda p: (p - ctr) * s
    P = T(P)
    J = {}
    jn = lambda b: T(jpos(V, b + '____head'))
    J['root'] = np.array([0, 0, 0.]); J['pelvis'] = jn('spine05'); J['spine'] = jn('spine04'); J['neck'] = jn('neck01')
    for mh, us in (('R', 'L'), ('L', 'R')):
        J['sh' + us] = jn('upperarm01.' + mh); J['el' + us] = jn('lowerarm01.' + mh); J['hand' + us] = jn('wrist.' + mh)
        J['th' + us] = jn('upperleg01.' + mh); J['kn' + us] = jn('lowerleg01.' + mh); J['ft' + us] = jn('foot.' + mh)
        J['grip' + us] = T(grips[mh])
        J['toe' + us] = jn('toe3-1.' + mh)
        J['cl' + us] = jn('clavicle.' + mh); J['wr' + us] = jn('lowerarm02.' + mh)
    J['chest'] = jn('spine02'); J['head'] = jn('head')
    J['eyeL'] = T(jpos(V, 'joint-r-eye')) if 'joint-r-eye' in SK['joints'] else jn('eye.R')
    J['eyeR'] = T(jpos(V, 'joint-l-eye')) if 'joint-l-eye' in SK['joints'] else jn('eye.L')
    # Collapse weights onto the 16 bones
    n = len(used); W = np.zeros((n, len(BONES16)))
    for b, lst in WT.items():
        k = BI[map_bone(b)]
        for vi, w in lst:
            if vi in remap: W[remap[vi], k] += w
    W[W.sum(1) == 0, BI['spine']] = 1
    W24 = np.zeros((n, len(BONES)))
    for b, lst in WT.items():
        k = BI24[map_bone24(b)]
        for vi, w in lst:
            if vi in remap: W24[remap[vi], k] += w
    W24[W24.sum(1) == 0, BI24['spine']] = 1
    assert np.allclose(np.stack([W24[:, [b for b in range(len(BONES)) if GROUP16[b] == g]].sum(1) for g in range(len(BONES16))], 1), W)
    # Material per face: jersey 0, pants 1, skin 2, dark 3, sock 4, hair 5
    # Boundaries come from a continuous per-vertex function (averaged per face); boundary vertices are then snapped to the zero line of that function, so edges are not jagged
    fc = [[remap[i] for i in F[k]] for k in body]
    dom = W.argmax(1)
    beltY = J['pelvis'][1] + .07
    NK = J['neck']
    def neckline(x, z):   # Collar height: high at the back, low at the front, plus the front V
        v = np.clip(1 - np.abs(x) / VNECK_W, 0, 1); v = v * v * (3 - 2 * v)
        return NK[1] + NECK_BACK - NECK_TILT * (z - NK[2]) - VNECK_DEPTH * v * (z > NK[2])
    def sleeve_t(p, side):
        sh, el = J['sh' + side], J['el' + side]; return np.dot(p - sh, el - sh) / np.dot(el - sh, el - sh)
    def hemY(side): kn, ft = J['kn' + side], J['ft' + side]; return ft[1] + HEM_T * (kn[1] - ft[1])
    mat = []
    for f in fc:
        Pf = P[f]; c = Pf.mean(0); b = BONES16[np.bincount(dom[f], minlength=len(BONES16)).argmax()]
        side = 'L' if c[0] < 0 else 'R'
        if b.startswith('ft') or (c[1] < J['ft' + side][1] + .035): m = 3
        elif b.startswith('kn') or b.startswith('th') or (b == 'pelvis' and c[1] < beltY):
            m = 1 if c[1] > hemY(side) else 4
        elif b in ('pelvis', 'spine', 'neck') or (b.startswith('sh') and np.mean([sleeve_t(p, side) for p in Pf]) < SLEEVE_T):
            if c[1] < beltY: m = 1
            elif c[1] < beltY + BELT_H: m = 3
            elif np.mean(Pf[:, 1] - neckline(Pf[:, 0], Pf[:, 2])) < 0: m = 0
            else:
                m = 2
                if b == 'neck' and c[1] > NK[1] + .17 and c[2] < J['eyeL'][2] - .07: m = 5   # Hair at the back of the head (shows below the cap)
        else: m = 2
        mat.append(m)
    vm = {}
    for f, m in zip(fc, mat):
        for i in f: vm.setdefault(i, set()).add(m)
    def snap(Q, which):
        """Snap vertices on material borders onto the boundary line. which: 'skin' (collar/cuffs/pant legs) or 'cloth' (belt, snapped again after smoothing)"""
        for i, ms in vm.items():
            if len(ms) < 2: continue
            p = Q[i]
            if which == 'skin' and ms >= {0, 2}:
                if p[1] > NK[1] - .12 and np.hypot(p[0] - NK[0], p[2] - NK[2]) < .16: p[1] = neckline(p[0], p[2])
                else:
                    sd = 'L' if p[0] < 0 else 'R'; sh, el = J['sh' + sd], J['el' + sd]
                    p += (SLEEVE_T - sleeve_t(p, sd)) * (el - sh)
            elif which == 'skin' and ms >= {1, 4}: p[1] = hemY('L' if p[0] < 0 else 'R')
            elif 3 in ms and ms & {0, 1} and p[1] > .8:   # Belt top/bottom edge: snap to whichever is closer
                p[1] = beltY if abs(p[1] - beltY) < abs(p[1] - beltY - BELT_H) else beltY + BELT_H
    snap(P, 'skin'); snap(P, 'cloth')
    # Normals; cloth is pushed outward
    N = np.zeros_like(P)
    for f in fc:
        for t in ((0, 1, 2), (0, 2, 3)) if len(f) == 4 else ((0, 1, 2),):
            a, b_, c_ = P[f[t[0]]], P[f[t[1]]], P[f[t[2]]]; nn = np.cross(b_ - a, c_ - a)
            for k in t: N[f[k]] += nn
    N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-12
    puff = np.zeros(n)
    for f, m in zip(fc, mat):
        amt = JERSEY_PUFF if m == 0 else PANTS_PUFF if m in (1, 3) and P[f, 1].mean() > .5 else 0
        for i in f: puff[i] = max(puff[i], amt)
    # Smooth clothed areas: vertices on the skin border stay fixed so seams do not split
    cloth = np.array([i in vm and vm[i] <= {0, 1, 3} and vm[i] & {0, 1} != set() and P[i, 1] > .45 for i in range(n)])
    nb = [set() for _ in range(n)]
    for f in fc:
        for a in range(len(f)): nb[f[a]].add(f[(a + 1) % len(f)]); nb[f[(a + 1) % len(f)]].add(f[a])
    nbl = [list(x) for x in nb]; Ps = P.copy(); ci = np.where(cloth)[0]
    for _ in range(CLOTH_SMOOTH_ITERS):
        avg = np.array([Ps[nbl[i]].mean(0) for i in ci]); Ps[ci] = Ps[ci] * (1 - CLOTH_SMOOTH_K) + avg * CLOTH_SMOOTH_K
    snap(Ps, 'cloth')
    # Flatten the crotch / lower belly
    for i in range(n):
        if not (i in vm and vm[i] <= {1, 3}): continue
        x, y, z = Ps[i]
        if CROTCH_Y0 < y < CROTCH_Y1 and abs(x) < CROTCH_X and z > CROTCH_ZMAX:
            w = min(1, (y - CROTCH_Y0) / .03, (CROTCH_Y1 - y) / .03) * min(1, (CROTCH_X - abs(x)) / .03)
            Ps[i, 2] = z - w * (1 - CROTCH_KEEP) * (z - CROTCH_ZMAX)
        if CROSS_Y0 < y < CROSS_Y1 and abs(x) < CROSS_X and z > -.02:
            wx = 1 - abs(x) / CROSS_X; wx = wx * wx * (3 - 2 * wx)
            wy = np.sin(np.pi * (y - CROSS_Y0) / (CROSS_Y1 - CROSS_Y0)); w = wx * wy * min(1, (z + .02) / .04)
            Ps[i, 2] -= w * CROSS_BACK; Ps[i, 1] += w * CROSS_UP
    P2 = Ps + N * puff[:, None]
    # Eyes: small generated spheres (white + dark pupil), attached to the neck bone
    extraP, extraW, extraF = [], [], {6: [], 7: []}
    def sphere(c, r, m):
        base = n + len(extraP); R_, S_ = 6, 8
        for i in range(R_ + 1):
            th = np.pi * i / R_
            for j in range(S_): ph = 2 * np.pi * j / S_; extraP.append(c + r * np.array([np.sin(th) * np.cos(ph), np.cos(th), np.sin(th) * np.sin(ph)])); extraW.append(BI['neck'])
        for i in range(R_):
            for j in range(S_):
                a, b_ = base + i * S_ + j, base + i * S_ + (j + 1) % S_; c_, d = a + S_, b_ + S_
                extraF[m].append([a, c_, d, b_])
    for e in ('eyeL', 'eyeR'):
        c = J[e]; sphere(c, .0115, 6); sphere(c + np.array([0, 0, .0085]), .0055, 7)
    allP = np.vstack([P2] + ([np.array(extraP)] if extraP else []))
    allN = np.vstack([N, np.zeros((len(extraP), 3))])
    if extraP:
        for k in range(n, len(allP)): v = allP[k] - (J['eyeL'] if allP[k][0] < 0 else J['eyeR']); allN[k] = v / (np.linalg.norm(v) + 1e-9)
    # Top four weights on the old 16 bones, quantised exactly as pack_players.py did, then split over the 24 bones
    Wall = np.vstack([W, np.zeros((len(extraP), len(BONES16)))])
    for k, b in enumerate(extraW): Wall[n + k, b] = 1
    idx = np.argsort(-Wall, 1)[:, :MAX_INF]; wv = np.take_along_axis(Wall, idx, 1); wv /= wv.sum(1, keepdims=True)
    wf = wv.astype('f4'); q = np.floor(wf * W_Q + np.float32(.5)).astype(np.int32); q[:, 0] += W_Q - q.sum(1); q = q.clip(0, W_Q)
    W24all = np.vstack([W24, np.zeros((len(extraP), len(BONES)))])
    for k, b in enumerate(extraW): W24all[n + k, BI24['head'] if b == BI['neck'] else b] = 1
    idx, q = split_weights(idx, q, W24all); wv = q / W_Q
    # Triangulate (one primitive per material)
    prims = {m: [] for m in range(8)}
    for f, m in zip(fc + extraF[6] + extraF[7], mat + [6] * len(extraF[6]) + [7] * len(extraF[7])):
        prims[m] += [f[0], f[1], f[2]] + ([f[0], f[2], f[3]] if len(f) == 4 else [])
    write_glb(f'{OUT}/player_{kind}.glb', allP.astype('f4'), allN.astype('f4'), idx.astype('u1'), wv.astype('f4'), prims, J, kind)

def write_glb(path, P, N, JI, WV, prims, J, kind):
    bin_, views, accs = bytearray(), [], []
    def add(arr, target, comp, typ, minmax=False):
        while len(bin_) % 4: bin_.append(0)
        off = len(bin_); b = arr.tobytes(); bin_.extend(b)
        views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(b), **({'target': target} if target else {})})
        a = {'bufferView': len(views) - 1, 'componentType': comp, 'count': len(arr), 'type': typ}
        if minmax: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
        accs.append(a); return len(accs) - 1
    pa = add(P, 34962, 5126, 'VEC3', True); na = add(N, 34962, 5126, 'VEC3'); ja = add(JI, 34962, 5121, 'VEC4'); wa = add(WV, 34962, 5126, 'VEC4')
    names = ['jersey', 'pants', 'skin', 'dark', 'sock', 'hair', 'eyeWhite', 'iris']
    mats = [{'name': nm, 'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0, 'roughnessFactor': .7}} for nm in names]
    P_ = []
    for m, ix in prims.items():
        if not ix: continue
        ia = add(np.array(ix, 'u2' if len(P) < 65536 else 'u4'), 34963, 5123 if len(P) < 65536 else 5125, 'SCALAR')
        P_.append({'attributes': {'POSITION': pa, 'NORMAL': na, 'JOINTS_0': ja, 'WEIGHTS_0': wa}, 'indices': ia, 'material': m})
    # Bone nodes (position = joint point, identity rotation)
    nodes = [{'name': 'body', 'mesh': 0, 'skin': 0}]
    for i, b in enumerate(BONES):
        p = J[b] - (J[BONES[PARENT[i]]] if PARENT[i] >= 0 else 0)
        nodes.append({'name': b, 'translation': [float(x) for x in p]})
    for i in range(len(BONES)):
        ch = [k + 1 for k in range(len(BONES)) if PARENT[k] == i]
        if ch: nodes[i + 1]['children'] = ch
    ibm = np.zeros((len(BONES), 16), 'f4')
    for i, b in enumerate(BONES): m = np.eye(4, dtype='f4'); m[:3, 3] = -J[b]; ibm[i] = m.T.reshape(-1)
    ib = add(ibm, None, 5126, 'MAT4')
    gl = {'asset': {'version': '2.0', 'generator': 'yunduan build_players.py', 'copyright': 'CC0 (derived from MakeHuman CC0 assets)'},
          'scene': 0, 'scenes': [{'nodes': [0, 1]}], 'nodes': nodes,
          'meshes': [{'name': 'player_' + kind, 'primitives': P_}], 'materials': mats,
          'skins': [{'joints': list(range(1, len(BONES) + 1)), 'skeleton': 1, 'inverseBindMatrices': ib}],
          'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(bin_)}],
          'extras': {'joints': {k: [round(float(x), 5) for x in v] for k, v in J.items()}, 'refH': REF_H, 'bones': BONES, 'parent': PARENT, 'group16': GROUP16}}
    js = json.dumps(gl, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    while len(bin_) % 4: bin_.append(0)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)))
        f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II', len(bin_), 0x004E4942)); f.write(bin_)
    print(path, len(P), 'verts', sum(len(p) for p in prims.values()) // 3, 'tris', f'{(28 + len(js) + len(bin_)) / 1e6:.2f} MB')

for k in BUILDS: build(k)
