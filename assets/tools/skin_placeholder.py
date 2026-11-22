"""Write assets/tex/skin_placeholder.jpg: a code-drawn skin colour map in the MakeHuman base-mesh UV layout (#207 round 2).
Usage: python3 skin_placeholder.py <assets folder> [size]
Stand-in until the CC0 MakeHuman community skins arrive (#207, manager's note 09:45). It uses the same UVs as the real maps
(assets/skin_uv.b64.txt), so render/players.js loads the real files by name (SKIN.maps) with no other change.
The map is a multiplier on each player's skin tone (near white): faint blotches, warmer ears, nose, cheeks and knuckles,
lips and brows. Every texel is painted from the 3D rest position of the point it maps to (rasterised UV triangles),
so the features land where the face really is. Texels no triangle covers are filled by dilation (no white seams)."""
import sys, json, struct, base64, numpy as np
from PIL import Image, ImageFilter

A = sys.argv[1]; S = int(sys.argv[2]) if len(sys.argv) > 2 else 1024
# Face landmarks: the same numbers as FACE in render/players.js (normal build, unscaled, metres)
FACE = dict(chinY=1.62, lipY=1.668, mouthY=1.676, noseY=1.697, browY=1.762, cheekY=1.708, eyeX=.033, faceZ=.12)
LIP = np.array([.82, .6, .58]); BROW = np.array([.3, .26, .23]); WARM = np.array([1., .86, .82])
BLOTCH = .05                  # Low-frequency lightness variation (fraction)
DILATE = 6                    # Passes of seam fill

def unpack_pack(path):
    raw = base64.b64decode(open(path).read()); hl = struct.unpack('<I', raw[4:8])[0]; H = json.loads(raw[8:8 + hl])
    n, ni = H['n'], H['ni']; off = 8 + hl
    Pq = np.frombuffer(raw, np.uint16, n * 3, off).reshape(n, 3); off += n * 6 * len(H['kinds']) + n * 8
    idx = np.frombuffer(raw, np.uint16, ni, off).astype(np.int64)
    return H, np.array(H['lo']) + Pq * np.array(H['ps']), idx

def unpack_uv(path, n):
    raw = base64.b64decode(open(path).read()); hl = struct.unpack('<I', raw[4:8])[0]; U = json.loads(raw[8:8 + hl])
    o = 8 + hl; uv = np.frombuffer(raw, np.uint16, n * 2, o).reshape(n, 2).astype(float) / U['q']; o += n * 4
    ex = np.frombuffer(raw, np.uint16, U['nExtra'] * 3, o).reshape(-1, 3); o += U['nExtra'] * 6; o += (-o) % 4
    fx = np.frombuffer(raw, np.uint32, U['nFix'] * 2, o).reshape(-1, 2)
    return U, uv, ex, fx

H, P, idx = unpack_pack(f'{A}/players.b64.txt')
U, uv, ex, fx = unpack_uv(f'{A}/skin_uv.b64.txt', H['n'])
cuv = uv[idx].copy(); cuv[fx[:, 0]] = ex[fx[:, 1], 1:].astype(float) / U['q']   # UV per corner
s, c = U['groups']['skin']
J = {k: np.array(v) for k, v in H['joints'].items()}; eyeY = J['eyeL'][1]

g1 = lambda v, m, w: np.exp(-((v - m) / w) ** 2)
ramp = lambda v, a, b: np.clip((v - a) / (b - a), 0, 1)
def paint(p):
    """3D rest points (k,3) -> RGB multipliers (k,3)."""
    x, y, z = p[:, 0], p[:, 1], p[:, 2]; ax = np.abs(x)
    head = y > J['neck'][1] + .02; fr = ramp(z, FACE['faceZ'] - .03, FACE['faceZ']) * head
    # Blotches: a few fixed sines (deterministic, no random), +-BLOTCH
    b = 1 + BLOTCH * (np.sin(x * 61 + y * 37) * np.sin(y * 53 - z * 41) * np.sin(z * 47 + x * 29))
    col = np.ones((len(p), 3)) * b[:, None]
    warm = np.maximum.reduce([
        g1(y, FACE['cheekY'] - .006, .016) * g1(ax, .052, .018) * fr,                       # Cheeks
        g1(x, 0, .014) * g1(y, FACE['noseY'] + .006, .014) * ramp(z, .14, .17) * head,     # Nose tip
        ramp(ax, .062, .075) * (np.abs(y - eyeY) < .05) * head * .9,                         # Ears
        np.clip(1 - np.linalg.norm(p - J['handL'], axis=1) / .12, 0, 1) * .5,    # Hands (knuckles)
        np.clip(1 - np.linalg.norm(p - J['handR'], axis=1) / .12, 0, 1) * .5])
    col *= 1 - (1 - WARM) * warm[:, None] * .3
    lip = g1(y, FACE['lipY'], .0072) * g1(x, 0, .021) * fr
    col = col * (1 - lip[:, None]) + col * LIP * lip[:, None]
    by = FACE['browY'] + .006 * g1(ax, .036, .018)
    brow = g1(y, by, .0052) * ramp(ax, .01, .018) * (1 - ramp(ax, .055, .066)) * fr
    brow *= .75 + .25 * np.sin(x * 900) ** 2                                               # Hair strokes across the brow
    col = col * (1 - brow[:, None]) + col * BROW * brow[:, None]
    return np.clip(col, 0, 1)

img = np.zeros((S, S, 3)); cov = np.zeros((S, S), bool)
for t0 in range(s, s + c, 3):
    q = cuv[t0:t0 + 3] * [S, S]; q[:, 1] = S - q[:, 1]                                       # Image rows run down (flipY)
    p3 = P[idx[t0:t0 + 3]]
    x0, y0 = np.floor(q.min(0)).astype(int); x1, y1 = np.ceil(q.max(0)).astype(int)
    x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, S - 1), min(y1, S - 1)
    if x1 < x0 or y1 < y0: continue
    gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + .5, np.arange(y0, y1 + 1) + .5)
    (ax_, ay), (bx, by_), (cx, cy) = q
    d = (by_ - cy) * (ax_ - cx) + (cx - bx) * (ay - cy)
    if abs(d) < 1e-12: continue
    w0 = ((by_ - cy) * (gx - cx) + (cx - bx) * (gy - cy)) / d; w1 = ((cy - ay) * (gx - cx) + (ax_ - cx) * (gy - cy)) / d; w2 = 1 - w0 - w1
    m = (w0 >= -.02) & (w1 >= -.02) & (w2 >= -.02)
    if not m.any(): continue
    pts = w0[m, None] * p3[0] + w1[m, None] * p3[1] + w2[m, None] * p3[2]
    ys, xs = (gy[m] - .5).astype(int), (gx[m] - .5).astype(int)
    img[ys, xs] = paint(pts); cov[ys, xs] = True
for _ in range(DILATE):                                                                      # Seam fill: grow covered texels outward
    acc = np.zeros_like(img); k = np.zeros((S, S))
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        sh = np.roll(cov, (dy, dx), (0, 1)); acc += np.roll(img, (dy, dx), (0, 1)) * sh[..., None]; k += sh
    new = ~cov & (k > 0); img[new] = acc[new] / k[new, None]; cov |= new
img[~cov] = 1
im = Image.fromarray((img * 255 + .5).astype(np.uint8)).filter(ImageFilter.GaussianBlur(.6))
im.save(f'{A}/tex/skin_placeholder.jpg', quality=88, optimize=True)
import os; print('skin_placeholder.jpg', S, 'px', os.path.getsize(f'{A}/tex/skin_placeholder.jpg'), 'bytes')
