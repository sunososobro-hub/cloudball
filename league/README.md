# league

Factory settings: the teams and every player as created (data, CC0).

- `teams.js`: team id, names, colours.
- `players.js`: per team, the batting order (`bat`) and the pitching staff (`pit`) with ratings.
- `staff.js`: per team a manager, a pitching coach and the two base coaches; the league pool of 8 umpires; `crewFor(seed)` gives the four umpires of a game (pure, seeded). Content only: the engine never reads it and no result depends on it.
- `tools/`: the name generator and the real-athlete blocklist (see `tools/README.md`). Names follow the rules checked by `tests/names.check.mjs`.

Current player ability = these settings + the official ledger in `cloudball-league`. Nothing else is stored. Once official games exist, do not edit a player here: changes to ability belong in the ledger.

The league name, team names and logos are not covered by the CC0 dedication (see the root README).
