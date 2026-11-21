# league/ handoff (roster window: league/ + tests/)

## Done
- #50: all 72 players renamed with `tools/names.mjs` (MOI market names, blocklist-filtered,
  given name max 2 in the league, never twice on a team). Only `name` changed; streams are
  identical apart from names (seed 704 still 6:5). `tests/names.check.mjs` runs from `static.mjs`.

## Next (owner order on #50)
1. #52 `league/staff.js`: use `drawNames(people, {taken: <player names>})` with real ages so
   coaches and umpires get older pools (1950s-1980s). Add real CPBL coaches and umpires to
   `tools/blocklist.txt` first. The check already reads `staff.js` once it exists.
2. #54 `league/bios.js`, keyed by player id (ids are stable, names are now final).

## Known traps
- The engine looks players up by `name` (e.g. speed for steals): full names must stay unique
  per team or games change. The check enforces league-wide uniqueness.
- Do not hand-edit names: change the blocklist or `NAME_SEED` and rerun `--write`, then show
  before/after streams in the PR.
- Team names (#60) belong to the interface window; do not touch `teams.js` strings.
- Blocklist list 3 is hand-made and incomplete; extend it when a real athlete is spotted.
