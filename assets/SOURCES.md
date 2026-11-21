# Asset sources

Everything in this folder is third-party CC0 (source listed per row) or derived from CC0 sources, except the team
logos in `logos/` (see below). Rule for additions: third-party CC0 stays CC0 with its source listed here; the
owner's own original models, textures and art are CC BY 4.0 (attribution "cloudball
(https://github.com/sunososobro-hub/cloudball)") and marked "owner-original" here. No owner-original
licensed file exists yet. Scripts in `tools/` are code (MIT). Earlier versions published under CC0 stay CC0.

| File(s) | Source | License |
| --- | --- | --- |
| `tex/grass_*.jpg` | ambientCG Grass004 (1K JPG), repacked (`_c` colour, `_n` normal, `_orm` R=AO G=roughness) | CC0 |
| `tex/dirt_*.jpg` | ambientCG Ground103 | CC0 |
| `tex/concrete_*.jpg` | ambientCG Concrete048 | CC0 |
| `tex/fabric_*.jpg` | ambientCG Fabric083 (normal + roughness only) | CC0 |
| `tex/leather_*.jpg` | ambientCG Leather038 | CC0 |
| `logos/<team id>_128.webp`, `logos/<team id>_512.webp` | Team marks generated and chosen by the repository owner (raster images, delivered as white-background PNGs, 2026-11-21); cut out and resized by `tools/make_logos.py` | **Not CC0.** Owner's team marks, not licensed (rule 18) |
| `players.b64.txt` | Derived from MakeHuman base mesh, targets and default rig (CC0, see MakeHuman `LICENSE.ASSETS.md`) by `tools/build_players.py`, `tools/glb2gltf.py`, `tools/pack_players.py` | CC0 |

`players.b64.txt` is a base64 text copy of a packed binary (shared indices/skeleton/weights,
one base body plus slim/power/heavy offsets). Rebuild: run `tools/build_players.py` against a
MakeHuman checkout, `tools/glb2gltf.py` on each output, then `tools/pack_players.py`.

`logos/`: one file pair per team id (`pheasants`, `owls`, `macaques`, `muntjacs`). The page finds
them by team id, so replacing a logo is replacing its files: run
`python3 assets/tools/make_logos.py <folder with <id>.png> <id>` and commit the two new files.
The CC0 dedication in `assets/LICENSE` does not cover them; forks must not use them (rule 18).
