"""Turn a BVH motion capture file (CMU / cgspeed naming) into a compact, rig-neutral cloudball clip (#186).

Usage:
  python3 mocap_clip.py <in.bvh> <out.json> [--start S] [--end S] [--fps 30] [--face travel|rest]
                        [--release auto|none|<seconds>] [--name NAME] [--source TEXT] [--check]
  python3 mocap_clip.py --selftest        (synthetic BVH -> clip -> forward kinematics round trip; no download)

Clip format (`cloudball-mocap/1`, JSON, see assets/mocap/README.md):
  * joints: the standard humanoid set in JOINTS, each with its parent and rest offset (in hip heights).
    Left/Right = the performer's own left/right.
  * Frame: Y up, the rest pose faces +Z, the performer's left is +X. With --face travel the whole take is
    turned about Y so the hips travel toward +Z (a pitcher's stride goes toward the plate).
  * rot: per frame, per joint, the LOCAL rotation relative to the rest pose (identity = rest pose; the
    source's rest is its T-pose), as a quaternion x y z w quantised to int16 (value / 32767).
  * pos: hips position per frame in hip heights (x z relative to the first kept frame), int16 / POS_Q.
  * release: kept-frame index of the throwing hand's peak speed (auto) and which hand.
Only the joints in JOINTS are kept; fingers are dropped. No third-party tool is needed (numpy only)."""
import sys, json, math, base64, argparse
import numpy as np

FORMAT = 'cloudball-mocap/1'
Q_SCALE = 32767          # Quaternion component quantisation
POS_Q = 4096             # Hips position quantisation: 1/4096 of a hip height (~0.2 mm); range +-8 hip heights
DEFAULT_FPS = 30
RELEASE_SMOOTH = 3       # Frames (at the output rate) averaged before picking the hand-speed peak

# Standard joint set (order = storage order; parents come first). Matches the bones listed in #185.
JOINTS = ['hips', 'spine', 'chest', 'neck', 'head',
          'clavicleLeft', 'upperArmLeft', 'forearmLeft', 'handLeft',
          'clavicleRight', 'upperArmRight', 'forearmRight', 'handRight',
          'thighLeft', 'shinLeft', 'footLeft', 'toeLeft',
          'thighRight', 'shinRight', 'footRight', 'toeRight']
PARENT = {'hips': None, 'spine': 'hips', 'chest': 'spine', 'neck': 'chest', 'head': 'neck',
          'clavicleLeft': 'chest', 'upperArmLeft': 'clavicleLeft', 'forearmLeft': 'upperArmLeft', 'handLeft': 'forearmLeft',
          'clavicleRight': 'chest', 'upperArmRight': 'clavicleRight', 'forearmRight': 'upperArmRight', 'handRight': 'forearmRight',
          'thighLeft': 'hips', 'shinLeft': 'thighLeft', 'footLeft': 'shinLeft', 'toeLeft': 'footLeft',
          'thighRight': 'hips', 'shinRight': 'thighRight', 'footRight': 'shinRight', 'toeRight': 'footRight'}
# Per joint: (source joints whose rest position is the joint's position, source joints whose world rotation is the
# joint's rotation); the first name found in the file wins. Chosen so every kept joint position is exact: CMU Spine1
# (zero-length, under the neck and clavicles) is folded into its children's world rotations, Neck1 is the skull
# pivot, and Head only turns the skull. LHipJoint/RHipJoint have no degrees of freedom in CMU data.
SRC = {'hips': (['Hips', 'hip', 'pelvis'], ['Hips', 'hip', 'pelvis']),
       'spine': (['LowerBack', 'abdomen'], ['LowerBack', 'abdomen']),
       'chest': (['Spine', 'chest'], ['Spine', 'chest']),
       'neck': (['Neck', 'neck'], ['Neck', 'neck']),
       'head': (['Neck1', 'head'], ['Head', 'head'])}
for s, S, c in (('Left', 'Left', 'L'), ('Right', 'Right', 'R')):
    SRC.update({'clavicle' + s: ([S + 'Shoulder', c + 'Collar'], [S + 'Shoulder', c + 'Collar']),
                'upperArm' + s: ([S + 'Arm', c + 'Shldr'], [S + 'Arm', c + 'Shldr']),
                'forearm' + s: ([S + 'ForeArm', c + 'Forearm'], [S + 'ForeArm', c + 'Forearm']),
                'hand' + s: ([S + 'Hand', c + 'Hand'], [S + 'Hand', c + 'Hand']),
                'thigh' + s: ([S + 'UpLeg', c + 'Thigh'], [S + 'UpLeg', c + 'Thigh']),
                'shin' + s: ([S + 'Leg', c + 'Shin'], [S + 'Leg', c + 'Shin']),
                'foot' + s: ([S + 'Foot', c + 'Foot'], [S + 'Foot', c + 'Foot']),
                'toe' + s: ([S + 'ToeBase', c + 'Toe'], [S + 'ToeBase', c + 'Toe'])})

# ---------- BVH ----------
def parse_bvh(text):
    tok = text.split()
    i = 0
    joints = []          # dicts: name, parent, offset, channels
    stack = []
    while True:
        t = tok[i]
        if t in ('ROOT', 'JOINT'):
            joints.append({'name': tok[i + 1], 'parent': stack[-1] if stack else -1, 'offset': None, 'channels': []})
            i += 2
        elif t == 'End':          # End Site: skip its block
            depth = 0
            while True:
                i += 1
                if tok[i] == '{': depth += 1
                elif tok[i] == '}':
                    depth -= 1
                    if depth == 0: break
            i += 1
        elif t == '{':
            stack.append(len(joints) - 1); i += 1
        elif t == '}':
            stack.pop(); i += 1
        elif t == 'OFFSET':
            joints[stack[-1]]['offset'] = np.array([float(x) for x in tok[i + 1:i + 4]]); i += 4
        elif t == 'CHANNELS':
            n = int(tok[i + 1]); joints[stack[-1]]['channels'] = tok[i + 2:i + 2 + n]; i += 2 + n
        elif t == 'MOTION':
            i += 1; break
        else:
            i += 1
    assert tok[i] == 'Frames:'; nf = int(tok[i + 1])
    assert tok[i + 2] == 'Frame' and tok[i + 3] == 'Time:'; dt = float(tok[i + 4])
    data = np.array([float(x) for x in tok[i + 5:]], dtype=np.float64)
    nch = sum(len(j['channels']) for j in joints)
    data = data[:nf * nch].reshape(nf, nch)
    return joints, dt, data

def axis_mat(axis, a):
    c, s = np.cos(a), np.sin(a)
    m = np.zeros(a.shape + (3, 3)); m[..., 0, 0] = m[..., 1, 1] = m[..., 2, 2] = 1
    p, q = {'X': (1, 2), 'Y': (2, 0), 'Z': (0, 1)}[axis]
    m[..., p, p] = c; m[..., q, q] = c; m[..., p, q] = -s; m[..., q, p] = s
    return m

def bvh_fk(joints, data):
    """World rotation matrices (F, J, 3, 3) and positions (F, J, 3) of every BVH joint."""
    F, J = len(data), len(joints)
    R = np.zeros((F, J, 3, 3)); P = np.zeros((F, J, 3))
    col = 0
    for j, jt in enumerate(joints):
        loc = np.broadcast_to(np.eye(3), (F, 3, 3)).copy(); tr = np.broadcast_to(jt['offset'], (F, 3)).copy()
        for ch in jt['channels']:
            v = data[:, col]; col += 1
            if ch.endswith('rotation'): loc = loc @ axis_mat(ch[0].upper(), np.radians(v))
            else: tr[:, 'XYZ'.index(ch[0].upper())] = v
        p = jt['parent']
        if p < 0: R[:, j] = loc; P[:, j] = tr
        else:
            R[:, j] = R[:, p] @ loc
            P[:, j] = P[:, p] + np.einsum('fab,fb->fa', R[:, p], tr)
    return R, P

# ---------- quaternions (x y z w) ----------
def mat_to_quat(m):
    m = np.asarray(m); q = np.zeros(m.shape[:-2] + (4,))
    t = m[..., 0, 0] + m[..., 1, 1] + m[..., 2, 2]
    # Shepperd: pick the largest of w, x, y, z per element
    cand = np.stack([t, m[..., 0, 0], m[..., 1, 1], m[..., 2, 2]], -1); k = cand.argmax(-1)
    for idx in range(4):
        s = k == idx
        if not s.any(): continue
        mm = m[s]
        if idx == 0:
            r = np.sqrt(1 + mm[:, 0, 0] + mm[:, 1, 1] + mm[:, 2, 2]) * 2
            q[s] = np.stack([(mm[:, 2, 1] - mm[:, 1, 2]) / r, (mm[:, 0, 2] - mm[:, 2, 0]) / r, (mm[:, 1, 0] - mm[:, 0, 1]) / r, r / 4], -1)
        elif idx == 1:
            r = np.sqrt(1 + mm[:, 0, 0] - mm[:, 1, 1] - mm[:, 2, 2]) * 2
            q[s] = np.stack([r / 4, (mm[:, 0, 1] + mm[:, 1, 0]) / r, (mm[:, 0, 2] + mm[:, 2, 0]) / r, (mm[:, 2, 1] - mm[:, 1, 2]) / r], -1)
        elif idx == 2:
            r = np.sqrt(1 + mm[:, 1, 1] - mm[:, 0, 0] - mm[:, 2, 2]) * 2
            q[s] = np.stack([(mm[:, 0, 1] + mm[:, 1, 0]) / r, r / 4, (mm[:, 1, 2] + mm[:, 2, 1]) / r, (mm[:, 0, 2] - mm[:, 2, 0]) / r], -1)
        else:
            r = np.sqrt(1 + mm[:, 2, 2] - mm[:, 0, 0] - mm[:, 1, 1]) * 2
            q[s] = np.stack([(mm[:, 0, 2] + mm[:, 2, 0]) / r, (mm[:, 1, 2] + mm[:, 2, 1]) / r, r / 4, (mm[:, 1, 0] - mm[:, 0, 1]) / r], -1)
    return q / np.linalg.norm(q, axis=-1, keepdims=True)

def quat_to_mat(q):
    x, y, z, w = (q[..., i] for i in range(4))
    m = np.empty(q.shape[:-1] + (3, 3))
    m[..., 0, 0] = 1 - 2 * (y * y + z * z); m[..., 0, 1] = 2 * (x * y - z * w); m[..., 0, 2] = 2 * (x * z + y * w)
    m[..., 1, 0] = 2 * (x * y + z * w); m[..., 1, 1] = 1 - 2 * (x * x + z * z); m[..., 1, 2] = 2 * (y * z - x * w)
    m[..., 2, 0] = 2 * (x * z - y * w); m[..., 2, 1] = 2 * (y * z + x * w); m[..., 2, 2] = 1 - 2 * (x * x + y * y)
    return m

def slerp(a, b, t):
    d = (a * b).sum(-1, keepdims=True)
    b = np.where(d < 0, -b, b); d = np.abs(d)
    th = np.arccos(np.clip(d, -1, 1)); s = np.sin(th)
    small = s < 1e-6
    wa = np.where(small, 1 - t, np.sin((1 - t) * th) / np.where(small, 1, s))
    wb = np.where(small, t, np.sin(t * th) / np.where(small, 1, s))
    q = wa * a + wb * b
    return q / np.linalg.norm(q, axis=-1, keepdims=True)

def yaw(a):
    return axis_mat('Y', np.array(a))

# ---------- conversion ----------
def find(names, index):
    for n in names:
        if n in index: return index[n]
    return None

def convert(joints, dt, data, start=0., end=None, fps=DEFAULT_FPS, face='travel', release='auto'):
    index = {j['name']: k for k, j in enumerate(joints)}
    pos_src, rot_src = {}, {}
    for t in JOINTS:
        a, b = find(SRC[t][0], index), find(SRC[t][1], index)
        if a is None or b is None: raise SystemExit('no source joint for %s (tried %s)' % (t, SRC[t]))
        pos_src[t], rot_src[t] = a, b
    # Rest pose (all rotations zero): world positions from offsets alone
    restP = np.zeros((len(joints), 3))
    for k, j in enumerate(joints):
        restP[k] = (restP[j['parent']] if j['parent'] >= 0 else 0) + j['offset']
    rest = {t: restP[pos_src[t]] for t in JOINTS}
    floor = min(rest[t][1] for t in ('footLeft', 'footRight', 'toeLeft', 'toeRight'))
    hip_h = rest['hips'][1] - floor
    # C: turn the rest pose so it faces +Z (performer's left at +X). Conjugation keeps rest = identity.
    left = rest['thighLeft'] - rest['thighRight']; c_ang = math.atan2(-left[2], left[0])
    C = yaw(c_ang)
    R, P = bvh_fk(joints, data)
    # Trim and resample
    n = len(data); t_src = np.arange(n) * dt
    end = t_src[-1] if end is None else min(end, t_src[-1])
    t_out = start + np.arange(int(math.floor((end - start) * fps + 1e-3)) + 1) / fps; u = t_out / dt
    i0 = np.clip(np.floor(u).astype(int), 0, n - 1); i1 = np.clip(i0 + 1, 0, n - 1); w = (u - i0)[:, None]
    Wq = {}
    for t in JOINTS:
        q = mat_to_quat(C @ R[:, rot_src[t]] @ C.T)
        q = slerp(q[i0], q[i1], w); Wq[t] = q
    hp = P[:, pos_src['hips']] @ C.T; hp = hp[i0] * (1 - w) + hp[i1] * w
    # H: heading so the hips travel toward +Z (first to last kept frame)
    H = np.eye(3)
    if face == 'travel':
        d = hp[-1] - hp[0]
        if math.hypot(d[0], d[2]) > 1e-6: H = yaw(-math.atan2(d[0], d[2]))
    Hq = mat_to_quat(H)
    def qmul(a, b):
        ax, ay, az, aw = (a[..., i] for i in range(4)); bx, by, bz, bw = (b[..., i] for i in range(4))
        return np.stack([aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx,
                         aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz], -1)
    def qinv(a): return a * np.array([-1, -1, -1, 1])
    for t in JOINTS: Wq[t] = qmul(np.broadcast_to(Hq, Wq[t].shape), Wq[t])
    hp = hp @ H.T
    hp = (hp - np.array([hp[0, 0], floor, hp[0, 2]])) / hip_h
    # Local = inverse(parent world) * world; then keep each joint's sign continuous over time
    loc = np.zeros((len(t_out), len(JOINTS), 4))
    for k, t in enumerate(JOINTS):
        p = PARENT[t]
        loc[:, k] = Wq[t] if p is None else qmul(qinv(Wq[p]), Wq[t])
        for f in range(1, len(t_out)):
            if (loc[f, k] * loc[f - 1, k]).sum() < 0: loc[f, k] = -loc[f, k]
    clip = {'format': FORMAT, 'fps': fps, 'frames': len(t_out), 'hipHeightSrc': round(float(hip_h), 4),
            'joints': [{'name': t, 'parent': PARENT[t],
                        'rest': [round(float(v), 4) for v in C @ ((rest[t] - (rest[PARENT[t]] if PARENT[t] else np.array([0, floor, 0])))) / hip_h]}
                       for t in JOINTS],
            'rotQ': Q_SCALE, 'posQ': POS_Q}
    rq = np.round(np.clip(loc, -1, 1) * Q_SCALE).astype('<i2')
    pq = np.round(np.clip(hp * POS_Q, -32767, 32767)).astype('<i2')
    clip['rot'] = base64.b64encode(rq.tobytes()).decode()
    clip['pos'] = base64.b64encode(pq.tobytes()).decode()
    if release != 'none':
        clip['release'] = pick_release(clip, release, start)
    return clip

def decode(clip):
    F, J = clip['frames'], len(clip['joints'])
    rot = np.frombuffer(base64.b64decode(clip['rot']), '<i2').reshape(F, J, 4) / clip['rotQ']
    rot = rot / np.linalg.norm(rot, axis=-1, keepdims=True)
    pos = np.frombuffer(base64.b64decode(clip['pos']), '<i2').reshape(F, 3) / clip['posQ']
    return rot, pos

def clip_fk(clip):
    """World positions (F, J, 3) in hip heights, from the clip alone (what a renderer would do)."""
    rot, pos = decode(clip); names = [j['name'] for j in clip['joints']]; ix = {n: k for k, n in enumerate(names)}
    F, J = rot.shape[:2]; M = quat_to_mat(rot); W = np.zeros((F, J, 3, 3)); X = np.zeros((F, J, 3))
    for k, j in enumerate(clip['joints']):
        if j['parent'] is None: W[:, k] = M[:, k]; X[:, k] = pos
        else:
            p = ix[j['parent']]; W[:, k] = W[:, p] @ M[:, k]; X[:, k] = X[:, p] + W[:, p] @ np.array(j['rest'])
    return X

def pick_release(clip, release, start):
    X = clip_fk(clip); fps = clip['fps']; ix = {j['name']: k for k, j in enumerate(clip['joints'])}
    best = None
    for hand in ('handRight', 'handLeft'):
        v = np.linalg.norm(np.diff(X[:, ix[hand]], axis=0), axis=-1) * fps
        if len(v) >= RELEASE_SMOOTH: v = np.convolve(v, np.ones(RELEASE_SMOOTH) / RELEASE_SMOOTH, 'same')
        f = int(v.argmax()) + 1
        if best is None or v.max() > best[2]: best = (hand, f, float(v.max()))
    hand, f, vmax = best
    if release != 'auto':
        f = int(round((float(release) - start) * fps)); f = max(0, min(clip['frames'] - 1, f))
    return {'frame': f, 'hand': 'right' if hand == 'handRight' else 'left', 'peakSpeed': round(vmax, 2), 'mode': release}

def check(joints, dt, data, clip, start, fps):
    """Max distance (hip heights) between the clip's own forward kinematics and the BVH's, per kept joint, in the
    hips' local frame (so heading and position offsets cancel). Only output frames that land on a source frame."""
    X = clip_fk(clip); rot, _ = decode(clip)
    index = {j['name']: k for k, j in enumerate(joints)}
    R, P = bvh_fk(joints, data)
    u = (start + np.arange(clip['frames']) / fps) / dt; f_src = np.round(u).astype(int); exact = np.abs(u - f_src) < 1e-3
    f_src = np.clip(f_src, 0, len(data) - 1)
    C = clip_rest_turn(joints, index); hips = find(SRC['hips'][1], index); Wh = quat_to_mat(rot[:, 0])
    err = 0.
    for k, j in enumerate(clip['joints'][1:], 1):
        src = find(SRC[j['name']][0], index)
        a = np.einsum('fba,fb->fa', R[f_src, hips], P[f_src, src] - P[f_src, hips]) / clip['hipHeightSrc']
        b = np.einsum('fba,fb->fa', Wh, X[:, k] - X[:, 0])
        err = max(err, float(np.linalg.norm(b - a @ C.T, axis=-1)[exact].max()))
    return err

def clip_rest_turn(joints, index):
    restP = np.zeros((len(joints), 3))
    for k, j in enumerate(joints): restP[k] = (restP[j['parent']] if j['parent'] >= 0 else 0) + j['offset']
    left = restP[find(SRC['thighLeft'][0], index)] - restP[find(SRC['thighRight'][0], index)]
    return yaw(math.atan2(-left[2], left[0]))

# ---------- self test ----------
CMU_TREE = [('Hips', None, (0, 0, 0)),
            ('LHipJoint', 'Hips', (0, 0, 0)), ('LeftUpLeg', 'LHipJoint', (1.36, -1.78, .84)), ('LeftLeg', 'LeftUpLeg', (2.45, -6.73, 0)),
            ('LeftFoot', 'LeftLeg', (2.56, -7.03, 0)), ('LeftToeBase', 'LeftFoot', (.16, -.45, 2.27)),
            ('RHipJoint', 'Hips', (0, 0, 0)), ('RightUpLeg', 'RHipJoint', (-1.31, -1.78, .84)), ('RightLeg', 'RightUpLeg', (-2.54, -6.98, 0)),
            ('RightFoot', 'RightLeg', (-2.57, -7.07, 0)), ('RightToeBase', 'RightFoot', (-.15, -.41, 2.37)),
            ('LowerBack', 'Hips', (0, 0, 0)), ('Spine', 'LowerBack', (.03, 2.04, -.2)), ('Spine1', 'Spine', (.05, 2.06, -.04)),
            ('Neck', 'Spine1', (0, 0, 0)), ('Neck1', 'Neck', (-.03, 1.75, .14)), ('Head', 'Neck1', (.03, 1.69, -.17)),
            ('LeftShoulder', 'Spine1', (0, 0, 0)), ('LeftArm', 'LeftShoulder', (3.36, 1.2, 0)), ('LeftForeArm', 'LeftArm', (5.0, 0, 0)),
            ('LeftHand', 'LeftForeArm', (3.4, 0, 0)), ('LeftFingerBase', 'LeftHand', (.7, 0, 0)),
            ('RightShoulder', 'Spine1', (0, 0, 0)), ('RightArm', 'RightShoulder', (-3.42, 1.27, 0)), ('RightForeArm', 'RightArm', (-5.1, 0, 0)),
            ('RightHand', 'RightForeArm', (-3.5, 0, 0)), ('RightFingerBase', 'RightHand', (-.7, 0, 0))]

NO_DOF = ('LHipJoint', 'RHipJoint')   # CMU connectors: channels present, always zero

def synth_bvh(frames=240, dt=1 / 120.):
    """A CMU-shaped BVH (same names, offsets near subject 124's scale, ZYX channels) with a made-up throw:
    hips walk toward -X (so --face travel must turn it), every joint wobbles, the right hand whips late."""
    out = ['HIERARCHY']; kids = {}
    for n, p, o in CMU_TREE: kids.setdefault(p, []).append((n, o))
    def emit(n, o, d):
        ind = '  ' * d
        out.append(ind + ('ROOT ' if d == 0 else 'JOINT ') + n); out.append(ind + '{')
        out.append(ind + '  OFFSET %.4f %.4f %.4f' % o)
        out.append(ind + ('  CHANNELS 6 Xposition Yposition Zposition Zrotation Yrotation Xrotation' if d == 0 else '  CHANNELS 3 Zrotation Yrotation Xrotation'))
        for c, co in kids.get(n, []): emit(c, co, d + 1)
        if n not in kids: out.extend([ind + '  End Site', ind + '  {', ind + '    OFFSET 0 0.5 0', ind + '  }'])
        out.append(ind + '}')
    emit('Hips', (0, 0, 0), 0)
    out += ['MOTION', 'Frames: %d' % frames, 'Frame Time: %.8f' % dt]
    rng = np.random.default_rng(186)
    amp = rng.uniform(3, 15, (len(CMU_TREE), 3)); ph = rng.uniform(0, 6.28, (len(CMU_TREE), 3)); fr = rng.uniform(.5, 2, (len(CMU_TREE), 3))
    for f in range(frames):
        t = f * dt; row = [-6 * t, 17 + .5 * math.sin(3 * t), .3 * t]
        for k, (n, _, _) in enumerate(CMU_TREE):
            a = amp[k] * np.sin(fr[k] * 6.28 * t + ph[k]) * (n not in NO_DOF)
            if n in ('RightArm', 'RightForeArm'): a = a + [160 * max(0, min(1, (t - 1.2) * 12)), 0, 0]   # late whip (Z channel), ~1900 deg/s
            row += list(a)
        out.append(' '.join('%.4f' % v for v in row))
    return '\n'.join(out) + '\n'

def selftest():
    joints, dt, data = parse_bvh(synth_bvh())
    ok = True
    for fps in (120, 30):
        clip = convert(joints, dt, data, fps=fps)
        err = check(joints, dt, data, clip, 0., fps)
        size = len(json.dumps(clip, separators=(',', ':')))
        X = clip_fk(clip); travel = X[-1, 0] - X[0, 0]
        print('fps %d: frames %d, %d bytes, max FK error %.5f hip heights, hips travel x %.3f z %.3f, release %s'
              % (fps, clip['frames'], size, err, travel[0], travel[2], clip['release']))
        ok &= err < 2e-3 and abs(travel[0]) < 1e-3 and travel[2] > 0 and clip['release']['hand'] == 'right'
    # Rest pose faces +Z with the performer's left at +X
    r = {j['name']: np.array(j['rest']) for j in clip['joints']}
    ok &= r['thighLeft'][0] > 0 > r['thighRight'][0] and abs(r['thighLeft'][2]) < .2
    print('selftest', 'PASS' if ok else 'FAIL'); return ok

def main():
    if '--selftest' in sys.argv: sys.exit(0 if selftest() else 1)
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('bvh'); ap.add_argument('out')
    ap.add_argument('--start', type=float, default=0.); ap.add_argument('--end', type=float)
    ap.add_argument('--fps', type=int, default=DEFAULT_FPS)
    ap.add_argument('--face', choices=['travel', 'rest'], default='travel')
    ap.add_argument('--release', default='auto'); ap.add_argument('--name'); ap.add_argument('--source')
    ap.add_argument('--check', action='store_true')
    a = ap.parse_args()
    joints, dt, data = parse_bvh(open(a.bvh).read())
    clip = convert(joints, dt, data, a.start, a.end, a.fps, 'travel' if a.face == 'travel' else 'rest', a.release)
    if a.name: clip['name'] = a.name
    if a.source: clip['source'] = a.source
    txt = json.dumps(clip, separators=(',', ':'))
    open(a.out, 'w').write(txt + '\n')
    print('%s: %d frames at %d fps (%.2f s), %d bytes, release %s' % (a.out, clip['frames'], a.fps, clip['frames'] / a.fps, len(txt), clip.get('release')))
    if a.check: print('max FK error (hip heights): %.5f' % check(joints, dt, data, clip, a.start, a.fps))

if __name__ == '__main__':
    main()
