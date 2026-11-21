# render/ handoff (max 20 lines)

## Done
- Tools: `tools/studio_shot.py` (contact sheets; needs `npm i three@0.186.1`, THREE_DIR; run one at a time, parallel runs time out),
  `tools/studio_probe.py` (prints a JS expression per time, ~20 s a run). #3 comments translated (PR #12).
- #5 bunt (PR #22): squared stance, level bat on the pitch line (`buntContact`); batter-runner leaves from the box (`BAT_LEAVE_BLEND`).
- #5 steal (PR #24): `catcherThrow` pop-up, transfer, hold when plan.t0 is late (#23), step, throw at plan.t0, re-crouch.
- #5 tag (feat/5-tag): `tagPose` for steal receiver, bunt-FC and tag-up plays. Out = engine `plan.actions` a:'tag' time, then
  shows the ball; safe = late swipe at arrive+TAG_LATE_SWEEP. Glove on the runner's lane. Studio acts `sbout`, `tagfc` (400 seeds).

- #5 pitcher cover (feat/5-cover, stacked on feat/5-tag): fielding/covering pitcher starts from the stride at contact
  (`kf(ARRIVE,PK.dz)`), run grows out of the follow-through (`P.mix`, P_RUN_BLEND). Probed on studio act `dp3`: no jump.

## Next
- #5 is done once PRs #24, #39 and the cover PR merge (in that order). Not yet screenshotted: `dp3` pitcher run (only probed).

## Traps
- Engine's second-base tag spot is in the runner's lane (issue #35): runner slides through the SS until the engine moves it.
- Batter-local frame: +z faces the plate, +x faces the pitcher. No left-handed bunt in the studio seed bank yet.
- Engine sets `e.swing=true` on bunts; guard with `e.play.bunt`. Shell env does not persist: re-export THREE_DIR each call.
- `gh` GraphQL is blocked: use `gh api repos/...` REST for issues/PRs.
