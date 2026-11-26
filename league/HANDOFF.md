# league/ handoff (roster window: league/ + tests/)

## Done
- #50 names, #52 staff, #47 recorder, #113 slots, #137/#102 banter + audio, #71 fan slots, #54 wave 1 bios (28).
- #169 halves (PRs #172, #173): frozen rosters of seed 704, `tools/abilities.mjs`, `ratings.js`. #178: `freeagents.js` (drawName, CREATE budget, validateCreate, makePlayer), `namepool.js`, `ratingsOf.raw`. #369: `training.js` + `tools/train_sim.mjs` (first-guess constants), `train` split on created players.
- #378: roles SP/MR/RP/CL (`ROLE_SPLIT` training by role; bullpen = non-SP); optional `pitches` list (1..3, fastball always), a rating per pitch, `PITCH_SHARE` % each in the split, off the overall; train_sim by 1/3/5 pitches. Part 5: `learnPitch`/`knownPitches` (new pitch 0 -> LEARN_AT, potential never holds it). Part 6: optional `points.def` (pool budget + `defBudget` over six), raw `def` via `defRaw` (mid 62 = 1.0, not in the overall), `positionFit` text (`POS_NEED`).
- #433: decline after the peak in `training.js` (`DECLINE_CURVE` from 31, `DECLINE_PER_SEASON`, per-key `DECLINE_RATE`, `DECLINE_FLOOR`; no RNG draw, so seeds and the 540-day sim are unchanged); train_sim prints overall by age 25/30/34/38. Active fans refill up to the potential, so their players barely decline (bonus is not age-scaled).
- #169 written (PR #188): seed 201, rating knees (stars 95..98, nobody 1 or 100), CREATE bat 305/70, pit 183/66.
- #54 wave 2 (PR #194): the other 44 lines; bios.check needs all 72 players. #37: `tests/replay/README.md`. #336: `tools/site.mjs` -> `site/*.json`. #276: commentary checks take seed 704 from `opening.json`, never re-simulate it.

- #436 part 1: `bench` list of 4 per team in `players.js` (`tools/bench.mjs`, ids `<team>-x1..x4`); `bat` stays the lineup, the engine ignores the bench (`tests/bench.check.mjs`).
- #437 part 1: `tools/season_sim.mjs` + `tests/season_sim.check.mjs` (model of who plays and the audition are the tool's own rules, not the product's).
- #500 part 1: `callup.js` (pure: ready by ability at the weakest 一軍 starter of the position; a slot opens only on retirement at `RETIRE_AGE` or a new team; queue by overall then days waited) + `tests/callup.check.mjs`; `train_sim` prints days to ready and ready -> called up. Real numbers: ready at day 0 for 962/1000, then 720/720/1260 days (p25/median/p75) to a slot.

## Next
0. #437 part 2 done in code: `system: true` in `site.mjs` export + 系統 tag on cards, pure `placeFan` in `freeagents.js` (`tests/system.check.mjs`). Part 3: D1 store seeds `SYSTEM_PER_KIND` 系統 rows per kind (`agent_id` `sys:<pid>`, `system:true`, table `meta` marker) and `create` deletes the oldest filler of the fan's kind (`tests/agent.check.mjs`). Part 4: `site.mjs` `systemSecond()` puts `SYSTEM_SECOND_PER_KIND` (3) 系統 players per kind into each team's 二軍 in `players.json` (tier 2, `system:true`; leaguesite check). Part 5: `site.mjs` `placeFans(second, fans)` + `--fans fans.json` ([{team, player}]) put real fans in place of 系統 二軍 players (`tests/system.check.mjs`). Left: nothing reads the D1 store into that json yet (server side, out of scope of #437).
1. If the owner strikes wave-2 lines (list at the top of the #54 wave-2 PR), rewrite only those; then #54 closes. Order: issue #68.
2. #336 follow-ups: fill 二軍/free agents (`buildSite({second, free})`) once placement exists; add each new recorded game to `RECORDED_GAMES`.

## Known traps
- The engine looks players up by `name`: full names must stay unique per team or games change.
- Never edit `league/preseason/rosters-opening.js`. Seed 704 in a check = the recording, never `simGame` + `OPENING_ROSTERS`.
- Any change to `players.js`, `ratings.js`, `teams.js` or a recording: rerun `node league/tools/site.mjs --write` (leaguesite check).
- Any change to `players.js` or `ratings.js` moves the free-agent overall: retune `CREATE.budget`/`cap` (keep each
  budget divisible by its ability count: the UI splits it evenly), never the check; fixtures in agent/freeagents checks.
- Free agents may share names (uniqueness is the store's job, #179). Staff and bio lines: change only with the owner's strike list.
- Team names (#60) belong to the interface window; do not touch `teams.js` strings.
