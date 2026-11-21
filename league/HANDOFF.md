# league/ handoff (roster window: league/ + tests/)

## Done
- #50 names, #52 staff, #47 recorder, #113 slots, #137 banter + #102 audio checks, #71 fan slots/share.
- #54 wave 1: `league/bios.js` for the 28 starters/SP of pheasants vs owls (`tests/bios.check.mjs`).
- #169 half: `league/preseason/rosters-opening.js` (frozen rosters of seed 704; opening.check and the
  registered-script check simulate against it) and `league/tools/abilities.mjs` (the draw; not written yet).

## Next
1. #169 second half, after #171 (commentary checks use the frozen rosters) is merged: run
   `node league/tools/abilities.mjs --write`, then the three checks. Fix the bio superlatives that the
   draw breaks (dry run, seed 201: owls-b2 no longer fastest, owls-b8/owls-b2 "weak arm" lines, owls-b3
   長打 vs build) and list every changed line at the top of the PR; owner table + win rates + stars/holes.
2. #37 (tests README). #54 wave 2 after the owner's strike list. Queue order lives in issue #68.

## Known traps
- The engine looks players up by `name`: full names must stay unique per team or games change.
- Never edit `league/preseason/rosters-opening.js`: it is the record of the demonstration game.
- Staff and bio lines are owner-approved content: change them only with his strike list from the PR.
- Team names (#60) belong to the interface window; do not touch `teams.js` strings.
