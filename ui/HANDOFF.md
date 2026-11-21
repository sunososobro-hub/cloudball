# ui / root files: HANDOFF (2026-11-21)

Agent: the interface window. Covers `ui/` and root files only. The roster window owns `league/` and `tests/` (split on #58); `tests/replay/run.mjs` is engine.

## Done
- #60 Kaohsiung team renamed to 高雄煞氣獼猴 (short 獼猴), branch `fix/60`. Only `league/teams.js` held the old name; no leftovers in `commentary/` or `render/`.
- #25 entry screen cleanup: PR #30 (title, one league-driven match line, two buttons, one footnote; HUD hidden on intro; no loading text).
- #29 tension checks in CI: PR #31 (spawned from `tests/replay/commentary.mjs`).

## Next
- Manager order (#58): #58 entry-screen matchup poster, then #53 guide page. #47 and #55 start only when the roster window has no open PR; say so on the issue first.
- #4 move HUD/voting code out of `render/game.js` into `ui/`: NOT started. It edits `render/`, so it needs the render agent to be idle on `render/game.js` first (area lock).
- After #30 merges, look at the entry screen in a real browser (the CDN is blocked in the agent sandbox, so the game never booted there): logos, buttons enabling, HUD back after entering.

## Traps
- `index.html` intro text: `render/game.js` still writes `#introStatus` and `#status`; they are hidden/empty on purpose, do not show them again.
- The match line reads `TEAMS[0]` vs `TEAMS[1]` like `render/game.js` does; keep them in step.
- `render/players_test.html` still has an old team name (render area).
