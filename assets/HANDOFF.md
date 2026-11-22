# assets/ handoff (max 20 lines)

## Done
- #3: Chinese comments/docstrings in `tools/*.py` translated (PR #12).
- #16: team logos in `logos/<id>_{128,512}.webp`, cut from the owner's PNGs by `tools/make_logos.py` (not CC0).
- #185 first half (feat/185, lane B): rig 16 -> 24 bones (chest, clL/clR, wrL/wrR = forearm twist, toeL/toeR, head appended; old indices kept). Pack v2 header has `bones`/`parent`/`group`; weights are the old u8 split per old bone, so `tools/rig_check.mjs` shows 0.0000 mm on 72 random poses.

- #207 round 1 half (feat/207-maps): `skin_uv.b64.txt` = UVs of skin/hair (MakeHuman base.obj vt) + eyes (generated), joined to the pack by vertex + seam rows (`extra`/`fix`, see `tools/skin_uv.py` docstring); pack unchanged. 100 KB of the 600 KB budget.

## Next
- #207 round 1 pick up: skin colour maps. MakeHuman's `data/skins/` holds only `default.mhmat` (no image); its textured skins were in `makehumancommunity/makehuman-assets`, which is gone from GitHub (asks for login), so no map is covered by that repo's LICENSE.ASSETS.md. Manager's call: another CC0 source, or a map baked by code from the UV layout (rule 16 allows code-drawn). Any atlas crop must remap the UVs in `tools/skin_uv.py`.
- #185 second half (pick up here): turn the new bones, one act per round: pitcher delivery (chest vs pelvis, clavicle, wrist snap), swing (hips lead chest), running (toe push-off). Poses are set in `sync()` of `makeRealPlayer` (players.js); the acts live in game.js (lane A): name the call site in the PR. Back number socket is on `spine`: move it to `chest` once the chest turns.
- Any new third-party file must be CC0 and listed in SOURCES.md (rule 16).

## Traps
- UV tool needs a MakeHuman clone with `makehuman/data/3dobjs` only; it asserts the pack's vertex count, so rerun it whenever `players.b64.txt` is rebuilt.
- Logos: macaque may be replaced again; rerun `tools/make_logos.py <dir> macaques`, no code change. Source PNGs are not in the repo.
- `players.b64.txt` is generated: rebuild with tools/build_players.py -> glb2gltf.py -> pack_players.py, never hand-edit. MakeHuman sparse clone (see build_players.py docstring) rebuilds the old file byte for byte.
- Heavy build moves the chest/clavicle pivots a few mm (torso depth target); the pack keeps normal's pivots (`NEW_JOINT_SLACK`).
- Face/head code must read `PACK.DG`/`DW` (old 16-bone dominant group), not `SI`: head vertices now sit on `head`, not `neck`.
- #204 uniforms (feat/204, lane B, items 1-2 done): `makeKit`/`setKit` in players.js (one shared kit per side; game.js `kitOf`/`paintKit`, side 1 = home white). Trim/belt are cut from the pack's jersey/dark groups at load (`cutKitGroups`, no asset change). Marks: `logoMat` (logos 128), `numFront` mirrors numMesh, `setName` (family name, called from game.js `dress`). `TEAMS[].color2` in league/teams.js.
- #204 pick up: item 3 (check color2 at broadcast distance and the #158 tight shot; maybe name/number fill in color2 on road), item 4 (catcher gear in team colour; helmets already use the kit). Scratch studio: 8 players front/back, no game page needed (~4 s on swiftshader).
