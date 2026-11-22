# ui / root files / functions: HANDOFF (2026-11-22)
Agent: the interface window: `ui/`, `functions/`, root files.

## Done
- #289 (PR fix/289): entry screen lost the 「今晚 A 對 B」 line (`#introMatch` gone from `index.html`). #53 part 2 is merged. #192 (`ui/compare.js`, PRs #193 and #198; the agent page needs D1, Preview only), #60, #25, #58, #53 part 1, #89, #117, #122, #47 round 1 (opening.json, `ui/site.js` dev/production by host, class `dev-only`).
- #179 (PR feat/179): fan agents on D1 `DB` (Preview only). Routes `functions/api/{agent,player,freeagents}.js`, `agent/draw.js`; all logic in `functions/lib/agents.js`; page `agent.html` + `ui/agent.js`. Guard `tests/agent.check.mjs` (fake D1 over `node:sqlite`).
- #189 (merged): live 3D preview on `agent.html`. `ui/agent-preview.js` (three + real `makePlayer`, loaded after first paint, silhouette meanwhile, numbers-only when no GL), `ui/preview-spec.js` (pure: choice or roster row -> spec). Guard `tests/preview.check.mjs`. Sticky ~40 % height; 看他 on a list row previews him. Next: skin and hair choices once #151's second PR defines what `look.skin`/`look.hair` draw. `look.head` is previewed as `HEAD_SHAPES[head % n]`; the game still uses `headOf(id)`: needs 畫面窗 to read `look.head` in `dress()` (issue opened).

## Next
- #197 half (`feat/197`, items 1-4): `ui/guide.js` star strip per team (best overall, pitcher or not) + nav chip 「球星 N」; from 1000 px a dense sortable table per group (`.tbl`, row tap = bio + 比較), 1500 px puts fielders and pitchers side by side; cards below 1000 px, compact under 700 px. `body.wide` + `agent.css` widen agent.html (forms 980 px, free-agent list 3 columns from 1400 px). Shots `ui/guide-1900.jpg`, `ui/guide-390.jpg`. Left: dense table for the `agent.html` free-agent list (still cards); no guard in `tests/` (roster window's folder).
- #332 (mini-game port) is first in the queue but BLOCKED: its source repo `yunlian-temple` is outside this session's GitHub scope. Needs the owner/manager to copy `docs/design/baseball_9grid/index.html` + `src/7xbs_baseball9.js` into this repo (or grant the repo). Do not rewrite it from scratch.
- #4 HUD out of `render/game.js` (needs the render window idle), #47 round 2 / #55. Queue lives in issue #68. #179: after merge, make one agent by hand on dev (first real D1 run).

## Traps
- Preview must stay a read-only user of `render/players.js`; heights are drawn at creation, so a choice previews the middle of the build's range.
- Production has no `DB`: the API also answers closed by host (`isDev` in `functions/lib/agents.js` must equal `ui/site.js`; the check compares them).
- Abuse caps (`AGENTS_PER_DAY`, `AGENTS_PER_ADDRESS_PER_DAY`) and the name-draw cap (`DRAW_CAP`) are named in that file. Address hash: per-day salt in `reg_salt`, rows in `reg_seen` (day + hash only), older days deleted on the next sign-up.
- New development control? Class `dev-only` + add its id to `DEV_ONLY_PAGES` in `tests/site.check.mjs`. `ui/stats.js`: `prev`/`live` state, seek fires before the scorebug changes.
- Re-recording opening.json is a remaster (`--remaster`, pin `FROZEN` in `tests/opening.check.mjs`); read it through `league/recording.js`.
- `#introStatus` stays hidden on purpose; the scorebug footer says 「開發版」 on production (owner's call).
