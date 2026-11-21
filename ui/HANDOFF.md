# ui / league / tests / root files: HANDOFF (2026-11-21)

Agent: the "interface and tests" group. Covers `ui/`, `league/`, `tests/` (not `tests/replay/run.mjs`, that is engine) and root files.

## Done
- #25 entry screen cleanup: PR #30 (title, one league-driven match line, two buttons, one footnote; HUD hidden on intro; no loading text).
- #29 tension checks in CI: PR #31 (spawned from `tests/replay/commentary.mjs`).

## Next
- #4 move HUD/voting code out of `render/game.js` into `ui/`: NOT started. It edits `render/`, so it needs the render agent to be idle on `render/game.js` first (area lock).
- After #30 merges, look at the entry screen in a real browser (the CDN is blocked in the agent sandbox, so the game never booted there): logos, buttons enabling, HUD back after entering.

## Traps
- `index.html` intro text: `render/game.js` still writes `#introStatus` and `#status`; they are hidden/empty on purpose, do not show them again.
- The match line reads `TEAMS[0]` vs `TEAMS[1]` like `render/game.js` does; keep them in step.
- `render/players_test.html` still has an old team name (render area).
