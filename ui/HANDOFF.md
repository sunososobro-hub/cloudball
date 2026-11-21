# ui / root files: HANDOFF (2026-11-21)
Agent: the interface window: `ui/` and root files (#47 round 1 also touched `league/`, `tests/`, a few lines of `render/game.js`).

## Done
- #60 rename, #25 entry screen, #58 poster, #53 part 1 (guide page), #89 viewing counts (PR #91), #117 jumps do not count as watched innings (`ui/stats.js` listens to `cloudball:seek`).
- #47 round 1 (branch `feat/47`): `league/tools/record.mjs 704 --write` made `league/preseason/opening.json` (crew + both staffs inside);
  index.html loads it into `window.OPENING`; enter starts it from the top (`startOpening` in `render/game.js`, mode `opening`, no votes).
  `ui/site.js` decides dev/production by host; development tools carry class `dev-only`. Guards: `tests/opening.check.mjs`, `tests/site.check.mjs`.
- Guide page staff block fixed (`staffOf`, `ROLES`, umpire `years`).

## Next
- #47 round 2 / #55: 21:00 synchronized showing + countdown (A3), YouTube-style progress bar (jump = start of a play, state from `s0`/`s1`), viewing-count flag for the two kinds of showing. Pregame segments come from #55's `league/` timeline module.
- #53 part 2: box score block from `boxFromStream` on `opening.json`.
- #122 menu wording: waits for the render window's open PRs on `render/game.js` (two lines there).
- #4 HUD/voting out of `render/game.js`: not started (needs the render agent idle on that file).

## Traps
- `ui/stats.js` (#117): `prev`/`live` state; the seek event fires before the scorebug changes, and a same-inning jump is learned by a 600 ms timer. No guard in `tests/` yet (that folder is the roster window's).
- `render/game.js` hooks of #47 (all `mode==='opening'`): `subscribeGame` early return, `findVote` returns null, no `resolveVote`, `startOpening`, `statusText`, `enter`.
- Re-recording is a remaster: `--remaster` plus the pin `FROZEN` in `tests/opening.check.mjs`. JSON turns `Infinity` into null; use `league/recording.js` to read or write the game.
- New development control? Give it class `dev-only` and add its id to `DEV_ONLY_IDS` in `tests/site.check.mjs`.
- `#introStatus` stays hidden on purpose. The scorebug footer still says 「開發版」 on production (owner's call).
