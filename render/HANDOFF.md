# render/ handoff (max 20 lines)

## Done
- Tools: `tools/studio_shot.py` (contact sheets; needs `npm i three@0.186.1`, THREE_DIR; run one at a time, parallel runs time out),
  `tools/studio_probe.py` (prints a JS expression per time, ~20 s a run). #3 comments translated (PR #12).
- #5 bunt (PR #22): squared stance, level bat on the pitch line (`buntContact`); batter-runner leaves from the box (`BAT_LEAVE_BLEND`).
- #5 steal (PR #24): `catcherThrow` pop-up, transfer, hold when plan.t0 is late (#23), step, throw at plan.t0, re-crouch.
- #5 tag (feat/5-tag): `tagPose` for steal receiver, bunt-FC and tag-up plays. Out = engine `plan.actions` a:'tag' time, then
  shows the ball; safe = late swipe at arrive+TAG_LATE_SWEEP. Glove on the runner's lane. Studio acts `sbout`, `tagfc` (400 seeds).

## Next in #5 (one PR each, base dev. Remote feat/5 is a stale WIP, ignore it)
- (c) pitcher ~1 m jump covering first on 3-6-3: cover position ignores the delivery stride `kf(u,PK.dz)`.

## Traps
- Engine's second-base tag spot is in the runner's lane (issue #35): runner slides through the SS until the engine moves it.
- Batter-local frame: +z faces the plate, +x faces the pitcher. No left-handed bunt in the studio seed bank yet.
- Engine sets `e.swing=true` on bunts; guard with `e.play.bunt`. Shell env does not persist: re-export THREE_DIR each call.
- `gh` GraphQL is blocked: use `gh api repos/...` REST for issues/PRs.
