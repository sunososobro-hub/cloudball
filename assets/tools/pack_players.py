"""Merge the 4 player_<build>.gltf.json files (24-bone rig) into one assets/players.bin: shared topology/skeleton/weights,
base build (normal) positions + int16 offsets for the other builds, so the browser can blend builds freely.
Usage: python3 pack_players.py <assets folder>"""
import sys, json, base64, struct, numpy as np
A = sys.argv[1]
JOINT_TOL = .01; NEW_JOINT_SLACK = ('chest', 'clL', 'clR')   # metres
KINDS = ['normal', 'slim', 'power', 'heavy']
def load(k):
    g = json.load(open(f'{A}/player_{k}.gltf.json')); b = base64.b64decode(g['buffers'][0]['uri'].split(',')[1]); return g, b
def acc(g, b, i):
    a = g['accessors'][i]; bv = g['bufferViews'][a['bufferView']]
    dt = {5126: np.float32, 5121: np.uint8, 5123: np.uint16, 5125: np.uint32}[a['componentType']]
    n = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
    return np.frombuffer(b, dt, a['count'] * n, bv.get('byteOffset', 0) + a.get('byteOffset', 0)).reshape(a['count'], n)
g0, b0 = load('normal'); prim = g0['meshes'][0]['primitives']
P0 = acc(g0, b0, prim[0]['attributes']['POSITION']).astype(np.float64)
JI = acc(g0, b0, prim[0]['attributes']['JOINTS_0']).astype(np.uint8)
W = acc(g0, b0, prim[0]['attributes']['WEIGHTS_0'])
# Quantise weights to u8, keeping the sum at 255
Wq = np.floor(W * 255 + .5).astype(np.int32); Wq[:, 0] += 255 - Wq.sum(1); Wq = Wq.clip(0, 255).astype(np.uint8)
idx, groups = [], []
for p in prim:
    ix = acc(g0, b0, p['indices']).reshape(-1); groups.append([len(idx), len(ix), g0['materials'][p['material']]['name']]); idx.extend(ix.tolist())
idx = np.array(idx, np.uint16)
lo, hi = P0.min(0), P0.max(0); PS = (hi - lo) / 65535
Pq = np.floor((P0 - lo) / PS + .5).astype(np.uint16)
DS = 5e-5   # 0.05 mm
deltas = []
for k in KINDS[1:]:
    g, b = load(k); Pk = acc(g, b, g['meshes'][0]['primitives'][0]['attributes']['POSITION']).astype(np.float64)
    d = np.floor((Pk - P0) / DS + .5); assert np.abs(d).max() < 32767, k; deltas.append(d.astype(np.int16))
    # One skeleton for every build: the old joints match exactly; the heavy build's torso depth moves the chest and clavicle
    # pivots a few mm, and the normal build's pivots are used (they only matter once a pose turns those bones)
    for j, p in g['extras']['joints'].items():
        d = max(abs(a - b) for a, b in zip(p, g0['extras']['joints'][j]))
        assert d == 0 or (j in NEW_JOINT_SLACK and d < JOINT_TOL), (k, j, d)
X = g0['extras']   # v2: 24 bones; 'group' = old 16-bone index each bone moves with while it rests (players.js checks it)
H = {'v': 2, 'bones': X['bones'], 'parent': X['parent'], 'group': X['group16'], 'n': len(P0), 'ni': len(idx), 'lo': lo.tolist(), 'ps': PS.tolist(), 'ds': DS, 'kinds': KINDS, 'groups': groups,
     'joints': g0['extras']['joints'], 'refH': g0['extras'].get('refH', 1.86), 'src': 'CC0, derived from MakeHuman CC0 assets'}
hj = json.dumps(H, separators=(',', ':')).encode()
while (8 + len(hj)) % 4: hj += b' '
out = bytearray(b'YDPL') + struct.pack('<I', len(hj)) + hj
for arr in [Pq, *deltas, JI, Wq, idx]: out += arr.tobytes(); 
import base64 as B64
open(f'{A}/players.b64.txt', 'w').write(B64.b64encode(bytes(out)).decode()); print('players.b64.txt', len(out), 'bytes raw')
# Check the reconstruction error
print('pos err', np.abs(lo + Pq * PS - P0).max(), 'delta err', DS / 2)
