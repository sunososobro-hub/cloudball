# ui / root files: HANDOFF (2026-11-21)

Agent: the interface window. Covers `ui/` and root files only. The roster window owns `league/` and `tests/` (split on #58); `tests/replay/run.mjs` is engine.

## Done
- #60 Kaohsiung team renamed (merged). #25 entry screen cleanup (merged). #29 tension checks in CI (merged).
- #58 entry screen as a matchup poster: PR from `feat/58` (two 512 logos, VS, team names, one match line, big buttons, blurred dark backdrop, name tile when a logo fails).

## Next
- Manager order: #53 guide page (waits for the staff issue #52 and the names issue), then #47 and #55 (only when the roster window has no open PR; say so on the issue first).
- #4 move HUD/voting code out of `render/game.js`: NOT started; needs the render agent idle on `render/game.js`.
- Backdrop: a wide park shot with nobody behind the card needs a render issue (opened from the #58 PR). Until then the card blurs the live scene.
- Look at the entry screen in a real browser once the CDN is reachable (the agent sandbox blocks it, so the game never booted there; screenshots were taken with the scripts blocked).

## Traps
- `render/game.js` still fills `#mas` (old small logos) and writes `#introStatus` / `#status`. `#mas` and `#introStatus` stay in `index.html` as hidden nodes on purpose; do not show them or delete them (game.js would throw).
- The poster reads `TEAMS[0]` (left) vs `TEAMS[1]` (right) like `render/game.js`; keep them in step.
- The match line still says "今晚 A 對 B"; #55 replaces it with the start time and countdown.
- `render/players_test.html` still has an old team name (render area).
