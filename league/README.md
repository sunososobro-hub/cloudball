# league

Factory settings: the teams and every player as created (data format and stats CC0; names and identities reserved).

- `teams.js`: team id, names, colours.
- `players.js`: per team, the batting order (`bat`) and the pitching staff (`pit`) with ratings.
- `staff.js`: per team a manager, a pitching coach and the two base coaches; the league pool of 8 umpires; `crewFor(seed)` gives the four umpires of a game (pure, seeded). Content only: the engine never reads it and no result depends on it.
- `bios.js`: one short on-air line of character and two or three tags per player, keyed by player id (wave 1: the starters and starting pitchers of the default pairing). Content only, like `staff.js`; rules in `tests/bios.check.mjs`.
- `ratings.js`: 1 to 100 display ratings on the factory scale (`ratingsOf`), and the inverse (`ratingsOf.raw`). Display only.
- `namepool.js`: surnames and given names by birth decade (pure data) for the name generator and the free agents.
- `freeagents.js`: created free agents (#178, first version of #167): `drawName`, the `CREATE` rules and point budget, `validateCreate`, `makePlayer`. Pure and seeded; never touches `ROSTERS` (rules in `tests/freeagents.check.mjs`).
- `preseason/opening.json`: the frozen first pre-season game (seed 704) as its recorded event stream, with that day's umpire crew and coaching staffs. `recording.js` reads and writes it; `tools/record.mjs` records it (a re-recording is a deliberate remaster, guarded by `tests/opening.check.mjs`). Pre-season games never go to the ledger.
- `site/` (#336): the publishable data of the text-first site (#335), written only by `node league/tools/site.mjs --write`, never by hand (`tests/leaguesite.check.mjs` fails on a stale file). Plain JSON, English keys:
  - `teams.json`: `{season: "0", teams: [{id, name, city, logo, record: {w, l}, roster: [playerId]}]}`; `roster` is the 一軍, `record` counts `games.json`.
  - `players.json`: `{"<playerId>": {name, num, age, role: "P"|"B", pos, hand, overall, abilities: {...}, team, tier}}`; `overall` and `abilities` are the 1 to 100 display ratings of `ratings.js`; tier 1 = 一軍, 2 = 二軍, 3 = free agent (`team: null`). Tiers 2 and 3 are empty until players are placed there.
  - `games.json`: `[{id, season, date, home, away, score: [home, away], replay}]`; `replay` is the recording's path from the site root. Season 0 holds the frozen pre-season game.
- `tools/`: the name generator and the real-athlete blocklist (see `tools/README.md`). Names follow the rules checked by `tests/names.check.mjs`.

Current player ability = these settings + the official ledger in `cloudball-league`. Nothing else is stored. Once official games exist, do not edit a player here: changes to ability belong in the ledger.

The league name, team names, player names and identities, and logos are not covered by the CC0 dedication (see the root README).
