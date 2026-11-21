# render/ handoff (max 20 lines)

## Done
- Tools: `tools/studio_shot.py` (contact sheets; `npm i three@0.186.1`, THREE_DIR; one run at a time), `tools/studio_probe.py`.
- #5 bunt (PR #22), steal (PR #24), tag (`tagPose`), pitcher cover (no jump on 3-6-3); 1B waits off the bag (`rtF`, PR #48).
- #36 studio acts `tag3`, `sf23` (PR #51).
- #43 item 1 hit by pitch (fix/43-hbp): ball ends on the body (spot from pitch height, pitcher side), flinch + turn (`hbpReact`),
  ball drops and hops (`hbpBall`), runner leaves at engine st0. Seen on studio act `hbp` clips 0 (R), 3 (high), 5 (L).

## Next
- #43 items 4 (overlaps at the plate), 2 (bat), 3 (HR flip), 5 (bunt ball floats): open; owner order is 1, 4 first. HBP has no thud
  sound: `wip/43-hbp-pickup` has a thud, a catcher pickup and body-socket hit spots to borrow (not for merge as is).

## Traps
- Batter-runner on a fly out runs onto an occupied first base and vanishes 0.6 s later (sf23 clip 0, t 6.6 s): #42.
- Batter-local frame: +z faces the plate, +x faces the pitcher. World: pitcher at -z, catcher at +z (MITT_Z), righty at x=-.9.
- Engine sets `e.swing=true` on bunts; guard with `e.play.bunt`. Shell env does not persist: re-export THREE_DIR each call.
- `gh` GraphQL is blocked: use `gh api repos/...` REST for issues/PRs. One render window at a time (double claim on #43).
