"""Cut the owner's team logos out of their white background and export them for the page.

Usage: python3 assets/tools/make_logos.py <dir with <team id>.png> [team id ...]
Writes assets/logos/<id>_128.webp (scorebug, scoreboard, intro card) and <id>_512.webp (large).
With no team ids, every <id>.png in the directory is processed. To replace one logo, drop the new
PNG in a folder and run this for that id only; the page finds the files by team id, no code change.

Background removal: only near-white pixels connected to the image border become transparent, so
white inside the drawing (eyes, shirts, cups) stays. In a thin band along that border the white is
unmixed from the anti-aliased edge (colour-to-alpha against white), so no white halo shows on the
dark night-game background. Needs Pillow (with WebP), numpy and scipy.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

WHITE_MIN = 232       # a pixel whose darkest channel is at least this counts as background white
EDGE_BAND_PX = 3      # width of the anti-aliased edge band that gets unmixed from white
TRIM_ALPHA = 8        # alpha (0-255) below which a pixel does not count when trimming
PAD = 0.03            # transparent margin around the trimmed drawing, fraction of its size
SIZES = (128, 512)
WEBP_QUALITY = 88

OUT = Path(__file__).resolve().parent.parent / 'logos'


def cut_out(rgb):
    """rgb: HxWx3 uint8 -> HxWx4 uint8 with the outer white made transparent."""
    c = rgb.astype(np.float32)
    white = c.min(axis=2) >= WHITE_MIN
    labels, _ = ndimage.label(white)
    border = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    bg = np.isin(labels, border[border > 0])
    band = ndimage.binary_dilation(bg, iterations=EDGE_BAND_PX) & ~bg
    alpha = np.ones(c.shape[:2], np.float32)
    alpha[bg] = 0
    a = np.clip((255 - c[band]).max(axis=1) / 255, 0, 1)
    alpha[band] = a
    safe = np.maximum(a, 1e-3)[:, None]
    c[band] = np.clip((c[band] - 255 * (1 - safe)) / safe, 0, 255)
    return np.dstack([c, alpha * 255]).round().astype(np.uint8)


def square(rgba):
    ys, xs = np.nonzero(rgba[:, :, 3] > TRIM_ALPHA)
    crop = rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = crop.shape[:2]
    side = int(round(max(h, w) * (1 + 2 * PAD)))
    out = np.zeros((side, side, 4), np.uint8)
    y0, x0 = (side - h) // 2, (side - w) // 2
    out[y0:y0 + h, x0:x0 + w] = crop
    return out


def export(src, team):
    rgba = square(cut_out(np.asarray(Image.open(src).convert('RGB'))))
    big = Image.fromarray(rgba, 'RGBA').convert('RGBa')   # premultiplied, so resizing does not bleed colour into the edge
    OUT.mkdir(exist_ok=True)
    for px in SIZES:
        im = big.resize((px, px), Image.LANCZOS).convert('RGBA')
        dst = OUT / f'{team}_{px}.webp'
        im.save(dst, 'WEBP', quality=WEBP_QUALITY, method=6)
        print(f'{dst} {dst.stat().st_size // 1024} KB')


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    folder = Path(sys.argv[1])
    teams = sys.argv[2:] or sorted(p.stem for p in folder.glob('*.png'))
    for team in teams:
        export(folder / f'{team}.png', team)


if __name__ == '__main__':
    main()
