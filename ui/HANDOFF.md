# ui / root files / functions: HANDOFF (2026-11-22)
Agent: the interface window: `ui/`, `functions/`, root files.

## Done
- #60, #25, #58, #53 part 1, #89 (PR #91), #117, #122 menu words, #47 round 1 (opening.json, `ui/site.js` dev/production by host, class `dev-only`).
- #179 (PR feat/179): fan agents on D1 `DB` (Preview only). Routes `functions/api/{agent,player,freeagents}.js`, `agent/draw.js`; all logic in `functions/lib/agents.js`; page `agent.html` + `ui/agent.js`. Guard `tests/agent.check.mjs` (fake D1 over `node:sqlite`).

## Next
- #179 after merge: open the dev site, make one agent and one player by hand (the first real D1 run: tables are created on the first call).
- #47 round 2 / #55 (21:00 showing), #53 part 2 (box score), #4 HUD out of `render/game.js` (needs the render window idle). Queue lives in issue #68.

## Traps
- Production has no `DB`: the API also answers closed by host (`isDev` in `functions/lib/agents.js` must equal `ui/site.js`; the check compares them).
- Abuse caps (`AGENTS_PER_DAY`, `AGENTS_PER_ADDRESS_PER_DAY`) and the name-draw cap (`DRAW_CAP`) are named in that file. Address hash: per-day salt in `reg_salt`, rows in `reg_seen` (day + hash only), older days deleted on the next sign-up.
- New development control? Class `dev-only` + add its id to `DEV_ONLY_PAGES` in `tests/site.check.mjs`. `ui/stats.js`: `prev`/`live` state, seek fires before the scorebug changes.
- Re-recording opening.json is a remaster (`--remaster`, pin `FROZEN` in `tests/opening.check.mjs`); read it through `league/recording.js`.
- `#introStatus` stays hidden on purpose; the scorebug footer says 「開發版」 on production (owner's call).
