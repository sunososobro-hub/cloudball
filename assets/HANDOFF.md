# assets/ handoff (max 20 lines)
## Done
- #3 (PR #12) tools comments in English; #16 team logos `logos/<id>_{128,512}.webp` from the owner's PNGs by `tools/make_logos.py` (not CC0).
- #185 first half (feat/185, lane B): rig 16 -> 24 bones (chest, clL/clR, wrL/wrR = forearm twist, toeL/toeR, head appended; old indices kept). Pack v2 header has `bones`/`parent`/`group`; weights are the old u8 split per old bone, so `tools/rig_check.mjs` shows 0.0000 mm on 72 random poses.
- #207 round 1 half (feat/207-maps): `skin_uv.b64.txt` = UVs of skin/hair (MakeHuman base.obj vt) + eyes (generated), joined to the pack by vertex + seam rows (`extra`/`fix`, see `tools/skin_uv.py` docstring); pack unchanged. 100 KB.
- #207 round 2 (feat/207-skin): skin material in players.js (`SKIN`, `skinMat`, `SkinLighting` = wrap + back-light glow, `skinAttrs` = per-vertex thinness/roughness, `joinSkinUV` grows the pack by the seam copies, seam normals averaged in `realAsset`). Map = `tex/skin_placeholder.jpg` from `tools/skin_placeholder.py` (18 KB, code-drawn, same UV layout).

## Next
- #207 real maps (manager brings the CC0 MakeHuman community skins): set `SKIN.map` to the file and `SKIN.ref` to its average skin colour, `lips`/`brows` to what it paints; one map per player is #151's (tone cache is per hex). Then round 3 (eyes). `SKIN.full` is the #211 spot: set it from the `max` tier before `loadPlayerAssets`.
- #185 second half (pick up here): turn the new bones, one act per round: pitcher delivery (chest vs pelvis, clavicle, wrist snap), swing (hips lead chest), running (toe push-off). Poses are set in `sync()` of `makeRealPlayer` (players.js); the acts live in game.js (lane A): name the call site in the PR. Back number socket is on `spine`: move it to `chest` once the chest turns.

## Traps
- UV tool needs a MakeHuman clone (`makehuman/data/3dobjs`); rerun it, then `skin_placeholder.py`, whenever `players.b64.txt` is rebuilt.
- Logos: rerun `tools/make_logos.py <dir> macaques` if replaced (source PNGs not in repo). New third-party files: CC0 + SOURCES.md (rule 16).
- Skin: the pack grows by `nExtra` vertices at load when UVs join (`H.n` changes); code that loops vertices must use `H.n`, not the file's count.
- `players.b64.txt` is generated: rebuild with tools/build_players.py -> glb2gltf.py -> pack_players.py, never hand-edit. MakeHuman sparse clone (see build_players.py docstring) rebuilds the old file byte for byte.
- Face/head code must read `PACK.DG`/`DW` (old 16-bone dominant group), not `SI`: head vertices now sit on `head`, not `neck`.
- #204 uniforms (lane B, items 1-4 done: PRs #206 and feat/204-gear): `makeKit`/`setKit` in players.js (one shared kit per side; game.js `kitOf`/`paintKit`, side 1 = home white). Trim/belt cut from the pack's jersey/dark groups at load (`cutKitGroups`). Marks: `logoMat`, `numFront`, `setName`. `TEAMS[].color2` in league/teams.js.
- #204 colours are rule-based, not per team: `kitInk(team, home)` picks trim (>= `KIT_TRIM_MIN` contrast on the jersey) and letter fill (>= `KIT_INK_MIN`) from the team colours, outline = the kit colour farthest from the fill; `numMat(n, ink)`/`nameMat` cache per ink, `dressSync` swaps game.js's plain number for the inked one. A new team colour needs no code, only `color`/`color2`. Heavy build moves chest/clavicle pivots a few mm; the pack keeps normal's pivots (`NEW_JOINT_SLACK`).
- #204 catcher gear: `setGear('catcher')` (chest protector wedge in `deco`, shin guards on the knee bones, `PROTECTOR`/`SHIN_GUARD`), material `kit.gear`; hides chest logo and front number. Protector is a plain curved plate: straps, a back harness, or a throat guard would be the next look. Scratch studio (8 players, `PL.makeKit` per player) ~4 s on swiftshader.
