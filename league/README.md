# league

Factory settings: the teams and every player as created (data, CC0).

- `teams.js`: team id, names, colours.
- `players.js`: per team, the batting order (`bat`) and the pitching staff (`pit`) with ratings.
- `tools/`: the name generator and the real-athlete blocklist (see `tools/README.md`). Names follow the rules checked by `tests/names.check.mjs`.

Current player ability = these settings + the official ledger in `cloudball-league`. Nothing else is stored. Once official games exist, do not edit a player here: changes to ability belong in the ledger.

The league name, team names and logos are not covered by the CC0 dedication (see the root README).
