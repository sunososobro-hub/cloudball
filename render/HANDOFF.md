# render/ handoff (max 20 lines)

## Done
- Tools: `tools/studio_shot.py` (contact sheets, about 10 s a frame; needs `npm i three@0.186.1`, THREE_DIR; one run at a time),
  `tools/studio_probe.py` (prints a JS expression per time, ~25 s a run; `X.batter.sockets`, `V(obj)` give world positions).
- #5 (merged): bunt (`buntContact`), steal (`catcherThrow`), tag (`tagPose`), pitcher cover (`P.mix`).
- #43 item 1, hit by pitch (fix/43-hbp): the pitch ends on the batter (`hbpSpot`: shoulder blade or thigh from the pitch height,
  read off his posed body), he turns his back and jolts (`HBP`, `hbpW/J/S`), the ball drops and dies at `HBP_REST` (`dropBall`),
  the catcher leans out, picks it up and returns it. Watched: studio 觸身球 clips 1 (low) and 4 (high), both right-handed.

## Next
- #43 items 4, 2, 3, 5 (bunt ball floats: `dropBall` is a ready bounce-and-roll path), then #42, #36, #33.
- Hit by pitch, not yet watched: a left-handed batter (clips 6, 8, 9, 11), the lowest pitches (clip 9), the dress-rehearsal camera.

## Traps
- A skinned arm with `scale.y >= 1` gets an automatic elbow bend unless `f.auto=false`: a reach then stops well short of its target.
- `hbpSpot` poses the batter at ARRIVE to read the spot, so call it before the frame's own `poseBatter`/`batterWalk`.
- Batter-local frame: +z faces the plate, +x faces the pitcher (the figure's left). Catcher's mitt (`arms[0]`) is on world -x.
- Engine `e.zx` on a hit by pitch is on the far side of the plate half the time; the renderer ignores it there (uses `e.zy` only).
- Engine sets `e.swing=true` on bunts; guard with `e.play.bunt`. Re-export THREE_DIR each call. `gh`: REST only (`gh api repos/...`).
