# render

3D only: field, players, animation, cameras. Consumes engine events; never decides an outcome.

- `game.js`: the game page script migrated from the original single-file page. It still contains the HUD, voting and commentary code; those move to `ui/` and `commentary/` in follow-up PRs.
- `players.js`: skinned player bodies (ES module). `players_test.html`: standalone viewer for them.
