# league

Factory settings: the teams and every player as created (data format and stats CC0; names and identities reserved).

- `teams.js`: team id, names, colours.
- `players.js`: per team, the batting order (`bat`) and the pitching staff (`pit`) with ratings.
- `staff.js`: per team a manager, a pitching coach and the two base coaches; the league pool of 8 umpires; `crewFor(seed)` gives the four umpires of a game (pure, seeded). Content only: the engine never reads it and no result depends on it.
- `bios.js`: one short on-air line of character and two or three tags per player, keyed by player id (wave 1: the starters and starting pitchers of the default pairing). Content only, like `staff.js`; rules in `tests/bios.check.mjs`.
- `preseason/opening.json`: the frozen first pre-season game (seed 704) as its recorded event stream, with that day's umpire crew and coaching staffs. `recording.js` reads and writes it; `tools/record.mjs` records it (a re-recording is a deliberate remaster, guarded by `tests/opening.check.mjs`). Pre-season games never go to the ledger.
- `tools/`: the name generator and the real-athlete blocklist (see `tools/README.md`). Names follow the rules checked by `tests/names.check.mjs`.

Current player ability = these settings + the official ledger in `cloudball-league`. Nothing else is stored. Once official games exist, do not edit a player here: changes to ability belong in the ledger.

The league name, team names, player names and identities, and logos are not covered by the CC0 dedication (see the root README).
