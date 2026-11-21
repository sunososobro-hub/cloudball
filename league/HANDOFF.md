# league/ handoff (roster window: league/ + tests/)

## Done
- #50: all 72 players renamed with `tools/names.mjs` (market names, blocklist-filtered).
- #52: `league/staff.js`: 16 coaches (4 per team), 8 umpires, `crewFor(seed)` (seed 704 crew:
  plate ump-7, 1B ump-1, 2B ump-6, 3B ump-4). Names from `names.mjs --staff` (STAFF_SEED 52).
  Blocklist list 4 = CPBL coaches and umpires. `tests/staff.check.mjs` runs from `static.mjs`.

## Next
1. After #52 merges: open short issues for render (#42: use staff/umpire ids and numbers) and
   commentary (names instead of "the coach"); #47 recorder stores crew + both staffs.
2. #71 (tests): fan guest lines checks, plus booth names through `names.check.mjs`.
3. #54 `league/bios.js`, keyed by player id. Then #37 (tests README).

## Known traps
- The engine looks players up by `name`: full names must stay unique per team or games change.
- Do not hand-edit names: change the blocklist or the seed and rerun `--write`.
- Staff lines are owner-approved content: change them only with his strike list from the PR.
- Team names (#60) belong to the interface window; do not touch `teams.js` strings.
- Blocklist lists 3 and 4 are hand-made and incomplete; extend them when a real name is spotted.
