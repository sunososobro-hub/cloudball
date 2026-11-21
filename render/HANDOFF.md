# render/ handoff (max 20 lines)

## Done
- Tools: `tools/studio_shot.py` (contact sheets; `npm i three@0.186.1`, THREE_DIR; one run at a time), `tools/studio_probe.py`.
- #5 bunt/steal/tag/pitcher cover, 1B waits off the bag (`rtF`, PR #48); #36 studio acts `tag3`, `sf23` (PR #51).
- #33 (PRs #62, #63): seated crowd, cheer bodies, seat width .55 m, outfield bleachers r 111.5, fov cap (`fitFov`), `CROWD_DENSITY`.
- #43 item 1 hit by pitch (PR #49): ball ends on the body (`hbpSpot`), flinch + turn (`hbpReact`), ball drops (`hbpBall`). Act `hbp`.
- #43 plate pose (PR #69): catcher rises for high balls (C_HIGH_*), bat rests on the shoulder (BAT_REST). Act `hiball`.
- #43 item 4 overlaps at the plate (fix/43-overlap): scorers peel off to their dugout (`peelAt`, also drawn in later events),
  C and plate ump stand after contact and re-crouch before the play ends, ump steps aside (`placeUmp`), walk arc in front. Act `homeplay`.

## Next
- #43 items 2, 3, 5 (HBP thud: `wip/43-hbp-pickup`), #70 (fan voice args, one line), #42, then #57/#73.

## Traps
- Batter-local frame: +z faces the plate, +x faces the pitcher. World: pitcher at -z, catcher at +z (MITT_Z), righty at x=-.9.
- Engine sets `e.swing=true` on bunts; guard with `e.play.bunt`. Shell env does not persist: re-export THREE_DIR each call.
- Node materials multiply instanceColor into every vertex (crowd: instanced 'shirt' + 'tint' mask). Swiftshader frame ~90 s.
- Runner pool is 6. Peelers vanish if the half inning changes before they reach the dugout (shared team colour). `ump` is in the probe hook.
- Default camera is centre field: depth collapses, so people at the same world x near the plate look "inside" each other.
