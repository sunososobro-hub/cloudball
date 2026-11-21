# render

3D only: field, players, animation, cameras. It draws what the engine decided and never decides an outcome. If the picture and an engine event disagree, the event is right.

- `game.js`: the game page script, migrated from the original single-file page. A classic script that reads `window.ENGINE` (engine/) and `window.COMMENTARY` (commentary/). It plays back `game.ev` frames; for a ball in play it follows `frame.plan` (who fields, who covers, every throw and its timing) and `frame.moves[n][3]` (when each runner starts, slides and arrives). It still contains the HUD and voting code, which move to `ui/` in follow-up PRs, and its comments are still in Chinese (to be translated).
- `players.js`: skinned player bodies (ES module). `players_test.html`: standalone viewer for them.
