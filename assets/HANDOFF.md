# assets/ handoff (max 20 lines)

## Done
- #3: Chinese comments/docstrings in `tools/*.py` translated (PR #12).
- #16: team logos in `logos/<id>_{128,512}.webp`, cut from the owner's PNGs by `tools/make_logos.py` (not CC0).
- #185 first half (feat/185, lane B): rig 16 -> 24 bones (chest, clL/clR, wrL/wrR = forearm twist, toeL/toeR, head appended; old indices kept). Pack v2 header has `bones`/`parent`/`group`; weights are the old u8 split per old bone, so `tools/rig_check.mjs` shows 0.0000 mm on 72 random poses.

## Next
- #185 second half (pick up here): turn the new bones, one act per round: pitcher delivery (chest vs pelvis, clavicle, wrist snap), swing (hips lead chest), running (toe push-off). Poses are set in `sync()` of `makeRealPlayer` (players.js); the acts live in game.js (lane A): name the call site in the PR. Back number socket is on `spine`: move it to `chest` once the chest turns.
- Any new third-party file must be CC0 and listed in SOURCES.md (rule 16).

## Traps
- Logos: macaque may be replaced again; rerun `tools/make_logos.py <dir> macaques`, no code change. Source PNGs are not in the repo.
- `players.b64.txt` is generated: rebuild with tools/build_players.py -> glb2gltf.py -> pack_players.py, never hand-edit. MakeHuman sparse clone (see build_players.py docstring) rebuilds the old file byte for byte.
- Heavy build moves the chest/clavicle pivots a few mm (torso depth target); the pack keeps normal's pivots (`NEW_JOINT_SLACK`).
- Face/head code must read `PACK.DG`/`DW` (old 16-bone dominant group), not `SI`: head vertices now sit on `head`, not `neck`.
