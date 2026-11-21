# assets/ handoff (max 20 lines)

## Done
- #3: Chinese comments/docstrings in `tools/*.py` translated (PR #12).
- #16: team logos in `logos/<id>_{128,512}.webp`, cut from the owner's PNGs by `tools/make_logos.py` (not CC0).

## Next
- Nothing open for assets/. Any new third-party file must be CC0 and listed in SOURCES.md (rule 16).

## Traps
- Logos: macaque may be replaced again; rerun `tools/make_logos.py <dir> macaques`, no code change. Source PNGs are not in the repo.
- `players.b64.txt` is generated: rebuild with tools/build_players.py -> glb2gltf.py -> pack_players.py, never hand-edit.
