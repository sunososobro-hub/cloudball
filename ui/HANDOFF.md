# ui / root files: HANDOFF (2026-11-21)

Agent: the interface window. Covers `ui/` and root files only. The roster window owns `league/` and `tests/`; `tests/replay/run.mjs` is engine.

## Done
- #60, #25, #29, #58 merged (rename, entry screen, tension checks, matchup poster).
- #53 part 1 merged-ready (`guide.html`, `ui/guide.*`: teams, 72 players on a 20-80 grade; staff block hidden until `league/staff.js`).
- #89 viewing counts: PR from `feat/89`. `ui/stats.js` (DOM observer + sendBeacon), `functions/api/v.js` (Analytics Engine binding `VIEWS`, dataset `cloudball_views`), `ui/stats-report.mjs` (prints the table). No hook in `render/game.js`: it reads `#enter/#enterMute`, `#snd[aria-pressed]`, `#bin`, `#spd`, `#seedTag`; if those ids or texts change, fix `ui/stats.js`.

## Next
- #53 part 2: box score of the frozen game, after #47 has merged (`boxFromStream` on `league/preseason/opening.json`).
- When #52 merges: check the staff block in a browser. `ui/guide.js` GUESSES the shape (`STAFF` per team as array or by team id, `UMPIRES` list, fields `name/num/line`); fix it to the real one.
- Then #47 and #55 (only when the roster window has no open PR; say so on the issue first).
- #4 move HUD/voting code out of `render/game.js`: NOT started; needs the render agent idle on it.

## Traps
- `render/game.js` still fills `#mas` and writes `#introStatus` / `#status`; they stay hidden in `index.html` on purpose.
- The poster reads `TEAMS[0]` (left) vs `TEAMS[1]` (right) like `render/game.js`.
- `static.mjs` follows the entry-screen link into `guide.html`. The staff file is imported through a variable so a missing file does not fail it; keep it that way.
- Grades: 50 + (rating - 1) * 100, step 5, clamped 20-80. `avg` in players.js is a placeholder and is not shown.
