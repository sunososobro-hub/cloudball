# render/ handoff (max 20 lines)

## Done
- #3 comments translated to English (PR #12, branch fix/3). On-screen Chinese copy untouched on purpose.
- `tools/studio_shot.py`: headless Chrome screenshots of any action-studio clip with a fixed camera. Needs `npm i three@0.186.1`
  (set THREE_DIR); it serves the repo and three.js locally and patches a camera override into game.js in memory only.

## In progress: #5 (branch feat/5, pushed, NOT merged, NOT checked visually yet)
- Bunt stance is coded in `poseBatter` (BUNT constants): squares around, level bat, top hand up the barrel, gives at contact.
  Next: run studio_shot on act `bunt` at 1.0,1.6,2.05,2.25 s, tune BUNT numbers until it looks right.
- Still to do in #5: (a) steal: catcher pops up and throws with `throwPose` (xfer = plan.t0 - (ARRIVE+CATCH_SNAP)), ball
  from `throwRelease`, not from the mitt; (b) tag pose helper (crouch, glove low on the runner's side of the base) for the
  steal receiver and FC tags (`plan.actions` has `a:'tag'`); reuse it for the existing home-plate tagPlay code;
  (c) pitcher 1 m jump covering first on 3-6-3: cover code sets position from `c.pos` without the delivery stride
  `kf(u,PK.dz)`; set P.pos z += kf(ARRIVE,PK.dz) for in-play after ARRIVE, and let P animate legs once he moves (P.noAnim).

## Traps
- Batter-local frame: +z faces the plate, +x faces the pitcher; positive up yaw turns the chest toward the pitcher.
- Engine sets `e.swing=true` on bunts; guard with `e.play.bunt`.
- `gh` GraphQL is blocked: use `gh api repos/...` REST for issues/PRs.
