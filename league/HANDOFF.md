# league/ handoff (roster window: league/ + tests/)

## Done
- #50 names, #52 staff, #47 recorder, #113 slots, #137/#102 banter + audio, #71 fan slots, #54 wave 1 bios (28).
- #169 halves (PRs #172, #173): frozen rosters of seed 704, `tools/abilities.mjs`, `ratings.js`. #178: `freeagents.js` (drawName, CREATE budget, validateCreate, makePlayer), `namepool.js`, `ratingsOf.raw`.
- #169 written (PR #188): seed 201, rating knees (stars 95..98, nobody 1 or 100), CREATE bat 305/70, pit 183/66.
- #54 wave 2 (PR #194): the other 44 lines; bios.check now needs all 72 players. #37: `tests/replay/README.md` rewritten.

## Next
1. If the owner strikes wave-2 lines (list at the top of the #54 wave-2 PR), rewrite only those; then #54 closes.
2. Nothing else queued for this window; order lives in issue #68.

## Known traps
- The engine looks players up by `name`: full names must stay unique per team or games change.
- Never edit `league/preseason/rosters-opening.js`: it is the record of the demonstration game.
- Any change to `players.js` or `ratings.js` moves the free-agent overall: retune `CREATE.budget`/`cap` (keep each
  budget divisible by its ability count: the UI splits it evenly), never the check; fixtures in agent/freeagents checks.
- Free agents may share names with each other (1 588 distinct in 10 000): uniqueness is the store's job (#179).
- Staff and bio lines are owner-approved content: change them only with his strike list from the PR.
- Team names (#60) belong to the interface window; do not touch `teams.js` strings.
