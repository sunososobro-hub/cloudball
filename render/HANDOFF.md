# render/ handoff (max 20 lines)

## Done
- #3 comments translated (PR #12). `tools/studio_shot.py`: headless contact sheets of a studio clip (needs `npm i three@0.186.1`,
  THREE_DIR). `tools/studio_probe.py`: same page, prints a JS expression per time (world positions), ~20 s a run, no screenshots.
- #5 bunt: squares around, knees bend by pitch height, bat level over the plate in the batter's ground frame (`groundToUp`),
  sweet spot on the pitch line; the pitch ends on the bat and the bunted ball starts there (`buntContact`). Bunter rises out of
  the crouch as he runs. Batter-runner now leaves from the box, not plate center (`BAT_LEAVE_BLEND`), for every ball in play.

- #5 steal (PR #24, stacked on #22): `catcherThrow` pops him up, transfers, holds at the chest when plan.t0 is late (issue #23),
  steps toward the bag, throws at plan.t0 from `throwRelease`, sinks back into the crouch over the last 0.7 s of the event.

- #5 tag (feat/5-tag, stacked on #24): `tagPose` for the steal receiver, bunt-FC tags and tag-up throws home/third. Out = engine's
  `plan.actions` a:'tag' time, then he shows the ball; safe = late swipe at arrive+TAG_LATE_SWEEP. Studio acts `sbout`, `tagfc` (400 seeds).

## Next in #5 (one PR each, base dev. Remote feat/5 is a stale WIP, ignore it)
- (c) pitcher ~1 m jump covering first on 3-6-3: cover position ignores the delivery stride `kf(u,PK.dz)`.

## Traps
- Batter-local frame: +z faces the plate, +x faces the pitcher. No left-handed bunt in the studio seed bank yet.
- Engine sets `e.swing=true` on bunts; guard with `e.play.bunt`. Shell env does not persist: re-export THREE_DIR each call.
- `gh` GraphQL is blocked: use `gh api repos/...` REST for issues/PRs.
