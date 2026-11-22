# league/ handoff (roster window: league/ + tests/)

## Done
- #50 names, #52 staff, #47 recorder, #113 slots, #137 banter + #102 audio checks, #71 fan slots/share,
  #54 wave 1 bios (28 players of pheasants vs owls).
- #169 half (PR #172): `league/preseason/rosters-opening.js` (frozen rosters of seed 704; opening.check and
  the registered-script check use it), `league/tools/abilities.mjs` (the draw, not written yet),
  `league/ratings.js` (1 to 100 display, `tests/ratings.check.mjs`; #170 in ui/ waits for it).

## Next
1. #169 rest, after #171 (commentary checks use the frozen rosters) is merged: `node league/tools/abilities.mjs
   --write`, the three checks, then fix the bio lines the draw breaks (seed 201: owls-b2 no longer fastest,
   owls-b2/owls-b8 "weak arm" lines, owls-b3 長打 vs build) and list every changed line atop the PR.
2. #37 (tests README). #54 wave 2 after the owner's strike list. Queue order lives in issue #68.

## Known traps
- The engine looks players up by `name`: full names must stay unique per team or games change.
- Never edit `league/preseason/rosters-opening.js`: it is the record of the demonstration game.
- Staff and bio lines are owner-approved content: change them only with his strike list from the PR.
- Team names (#60) belong to the interface window; do not touch `teams.js` strings.
