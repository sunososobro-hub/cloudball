# ui / root files: HANDOFF (2026-11-22)
Agent: the interface window: `ui/` and root files.

## Done
- #60 rename, #25 entry screen, #58 poster, #53 part 1 (guide page), #89 viewing counts (PR #91), #117 jumps do not count as watched innings (`ui/stats.js` listens to `cloudball:seek`). #122 plain menu words (`畫面：精緻/順暢`, `畫面怪怪的？點這裡`).
- #47 round 1: `league/tools/record.mjs 704 --write` made `league/preseason/opening.json`; enter starts it (`startOpening`, mode `opening`, no votes). `ui/site.js` = dev/production by host (class `dev-only`).
  Guards: `tests/opening.check.mjs`, `tests/site.check.mjs`. Guide page staff block fixed (`staffOf`, `ROLES`).
- #170 guide page: 1 to 100 ratings from `league/ratings.js` (overall first, sorted by overall); needs keys ovr, con, pow, eye, spd, arm, stuff, ctrl, pot.

## Next
- #47 round 2 / #55: 21:00 synchronized showing + countdown (A3), viewing-count flag for the two kinds of showing. Pregame segments come from #55's `league/` timeline module. #53 part 2: box score from `boxFromStream` on `opening.json`.
- #122 menu wording: waits for the render window's open PRs on `render/game.js` (two lines there).
- #4 HUD/voting out of `render/game.js`: not started (needs the render agent idle on that file).

## Traps
- `ui/stats.js` (#117): `prev`/`live` state; the seek event fires before the scorebug changes, and a same-inning jump is learned by a 600 ms timer. No guard in `tests/` yet (that folder is the roster window's).
- `render/game.js` hooks of #47 (all `mode==='opening'`): `subscribeGame` early return, `findVote` returns null, no `resolveVote`, `startOpening`, `statusText`, `enter`.
- Re-recording is a remaster: `--remaster` plus the pin `FROZEN` in `tests/opening.check.mjs`. JSON turns `Infinity` into null; use `league/recording.js` to read or write the game.
- New development control? Give it class `dev-only` and add its id to `DEV_ONLY_IDS` in `tests/site.check.mjs`.
- `#introStatus` stays hidden on purpose. The scorebug footer still says 「開發版」 on production (owner's call).
