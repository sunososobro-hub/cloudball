# render/ handoff (max 20 lines)

## Done
- Tools: `tools/studio_shot.py` (contact sheets; `npm i three@0.186.1`, THREE_DIR; one run at a time), `tools/studio_probe.py`.
- #5 bunt (PR #22), steal (PR #24), tag (`tagPose`), pitcher cover (no jump on 3-6-3); 1B waits off the bag (`rtF`, PR #48).
- #36 studio acts `tag3`, `sf23` (PR #51).
- #33 part 1 PR #62 (feat/33, stacked on #49): seated crowd, cheer bodies, varied shirts, denim trousers; draw calls 2 -> 4.
- #43 item 1 hit by pitch (fix/43-hbp): ball ends on the body (spot from pitch height, pitcher side), flinch + turn (`hbpReact`),
  ball drops and hops (`hbpBall`), runner leaves at engine st0. Seen on studio act `hbp` clips 0 (R), 3 (high), 5 (L).

## Next
- #43 items 4 (overlaps at the plate), 2 (bat), 3 (HR flip), 5 (bunt ball floats): open; owner order is 1, 4 first. HBP has no thud
  sound: `wip/43-hbp-pickup` has a thud, a catcher pickup and body-socket hit spots to borrow (not for merge as is).

## Traps
- Batter-local frame: +z faces the plate, +x faces the pitcher. World: pitcher at -z, catcher at +z (MITT_Z), righty at x=-.9.
- Engine sets `e.swing=true` on bunts; guard with `e.play.bunt`. Shell env does not persist: re-export THREE_DIR each call.
- Node materials multiply instanceColor into every vertex: crowd shirts use an instanced 'shirt' attribute + per-vertex 'tint' mask.
- Close crowd shot: cam 'a=0,2.4,22.3/0,1.9,27/45'. Swiftshader frame ~90 s; screenshot timeout is 180 s.
- `gh` GraphQL is blocked: use `gh api repos/...` REST for issues/PRs. One render window at a time (double claim on #43).
