# league/ handoff (roster window: league/ + tests/)

## Done
- #50 names, #52 staff, #47 recorder, #113 slots, #137/#102 banter + audio, #71 fan slots, #54 wave 1 bios (28).
- #169 half (PRs #172, #173): frozen rosters of seed 704, `tools/abilities.mjs` (draw, not written yet), `ratings.js`.
- #178: `freeagents.js` (drawName, CREATE budget, validateCreate, makePlayer), `namepool.js`, `ratingsOf.raw`;
  `tests/freeagents.check.mjs` from `static.mjs`. #179 (ui/) builds on it.

## Next
1. #169 rest: `node league/tools/abilities.mjs --write`, the three checks, overall knee (no 100s, no 1s, stars
   differ), fix bio lines the draw breaks (seed 201: owls-b2 fastest, owls-b2/b8 weak arm, owls-b3 長打) atop the PR.
2. #54 wave 2 (wave 1 stays), then #37. Queue order lives in issue #68.

## Known traps
- The engine looks players up by `name`: full names must stay unique per team or games change.
- Never edit `league/preseason/rosters-opening.js`: it is the record of the demonstration game.
- After the `--write`, the free-agent overall may leave 50..58: retune `CREATE.budget`/`cap`, never the check.
- Free agents may share names with each other (1 588 distinct in 10 000): uniqueness is the store's job (#179).
- Staff and bio lines are owner-approved content: change them only with his strike list from the PR.
- Team names (#60) belong to the interface window; do not touch `teams.js` strings.
