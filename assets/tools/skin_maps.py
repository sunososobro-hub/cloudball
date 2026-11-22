"""Write assets/tex/skin_<tone>.jpg from the CC0 MakeHuman community skins (#207, owner's pick 2026-11-22).
Usage: python3 skin_maps.py <folder with the three source PNGs> <assets folder> [size]
Source: asset pack Skins 02 (https://files.makehumancommunity.org/asset_packs/skins02/skins02_cc0.zip), diffuse maps only,
2048 px, MakeHuman base-mesh UV layout (the same UVs as assets/skin_uv.b64.txt, so no UV change).
What it does, per map: (1) every region the uniform, socks and cleats always cover (torso below the collar bones, legs,
feet, groin, the small spare islands) and the credit labels are painted flat with the map's own mean skin colour, so the
repo carries faces, necks, arms and hands only; (2) resize to <size> (1024) with Lanczos; (3) JPEG quality 88.
The keep regions are rectangles in UV space read off the layout (KEEP below), not a rasterised mesh mask: a later round
may tighten them from the pack's skin group."""
import sys, numpy as np
from PIL import Image

SRC, A = sys.argv[1], sys.argv[2]; S = int(sys.argv[3]) if len(sys.argv) > 3 else 1024
MAPS = {  # output tone name -> source file in Skins 02
    'light': 'toigo_light_skin_male_bronze.png',
    'dark': 'mindfront_skin_male_african_middleage.png',
    'old': 'onlytheghosts_old_eurasian_male.png',
}
# Regions kept, as (x0, y0, x1, y1) fractions of the map, y down.
KEEP = [
    (0.000, 0.000, 0.760, 0.235),  # neck, shoulders, both arms
    (0.630, 0.170, 1.000, 0.870),  # head: face, scalp, ears
    (0.350, 0.790, 0.780, 0.940),  # both hands
    (0.000, 0.350, 0.160, 0.470),  # eye sockets
    (0.740, 0.820, 0.940, 0.970),  # inside of the mouth
]
DROP = [(0.965, 0.740, 1.000, 0.900), (0.735, 0.000, 1.000, 0.080)]  # credit labels that sit inside a keep region
MEAN_BOX = (0.70, 0.45, 0.95, 0.60)  # cheek and forehead: where the fill colour is measured
QUALITY = 88

for tone, name in MAPS.items():
    im = np.asarray(Image.open(f'{SRC}/{name}').convert('RGB')).astype(np.float32)
    h, w = im.shape[:2]
    x0, y0, x1, y1 = MEAN_BOX
    fill = im[int(y0 * h):int(y1 * h), int(x0 * w):int(x1 * w)].reshape(-1, 3).mean(0)
    out = np.empty_like(im); out[:] = fill
    for x0, y0, x1, y1 in KEEP:
        a, b, c, d = int(y0 * h), int(y1 * h), int(x0 * w), int(x1 * w)
        out[a:b, c:d] = im[a:b, c:d]
    for x0, y0, x1, y1 in DROP:
        out[int(y0 * h):int(y1 * h), int(x0 * w):int(x1 * w)] = fill
    Image.fromarray(out.astype(np.uint8)).resize((S, S), Image.LANCZOS).save(f'{A}/tex/skin_{tone}.jpg', quality=QUALITY)
    print(tone, name, 'fill', fill.round().astype(int).tolist())
