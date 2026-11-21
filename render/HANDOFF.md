# render/ handoff (max 20 lines)

## Done
- Tools: `tools/studio_shot.py` (contact sheets; `npm i three@0.186.1`, THREE_DIR; one run at a time), `tools/studio_probe.py`.
- #5 bunt/steal/tag/pitcher cover, 1B waits off the bag (`rtF`, PR #48); #36 acts `tag3`, `sf23` (PR #51); #33 (PRs #62, #63): seated crowd, cheer bodies, seat width .55 m, outfield bleachers r 111.5, fov cap (`fitFov`), `CROWD_DENSITY`.
- #43 HBP (PR #49: `hbpSpot`, `hbpReact`, `hbpBall`, act `hbp`); plate pose (PR #69: C_HIGH_*, BAT_REST, act `hiball`).
- #47 player bar (feat/47-bar, mode `opening` only): `seekTo` snaps to a play start, `seekFloor` drops lines bound before the jump,
  `paused`/`scrubbing` stop time and booth; markup in index.html, `ui/player.css`; fires `cloudball:seek` (stats side: #117).
- #43 item 4 overlaps at the plate (fix/43-overlap): scorers peel off to their dugout (`peelAt`, also drawn in later events), C and plate ump stand after contact and re-crouch before the play ends, ump steps aside (`placeUmp`), walk arc in front. Act `homeplay`.
- #101 (fix/101): recorded game = no browser voice (`sayHello` waits for the script, `setBooth` -> `VOICE.setRecorded`), crowd `talkDuck`, "AI 語音" tag; #70 (fix/70): `cast`/`aside` passed to `VOICE.say`.

## Next
- #43 items 2, 3, 5 (HBP thud: `wip/43-hbp-pickup`), #42, #105 (tools), then #57/#73. 21:00 showing is not render's.

## Traps
- Batter-local frame: +z faces the plate, +x faces the pitcher. World: pitcher at -z, catcher at +z (MITT_Z), righty at x=-.9.
- Engine sets `e.swing=true` on bunts; guard with `e.play.bunt`. Shell env does not persist: re-export THREE_DIR each call.
- Node materials multiply instanceColor into every vertex (crowd: instanced 'shirt' + 'tint' mask). Swiftshader frame ~90 s.
- Booth is null while its script loads (silent on purpose); `BOOTH_PRIME` keeps the t 0 recorded hello. Headless frames >6 s = seek, no lines.
- Runner pool is 6. Peelers vanish if the half inning changes before the dugout. Default camera collapses depth near the plate. Poses are a pure function of (event, time): keep it so (a jump must equal playing there; bar test compared both).
