# ui/baseball9 HANDOFF (2026-11-25)
## Done
- #332 part 1: `practice.js` = pure rules of the 9-grid prototype for the two practice modes (no DOM, no three.js, no engine/). `createPractice('bat'|'pitch', {rnd, batterType, con})`; `.swing({mode,r,c})` / `.pitch({pt,r,c})` return `{out, done, result}`; result `{side, mode:'practice', hits, pitches, tier}`.
- Constants: `PRACTICE_PITCHES` 10, `FULL_AT` 4 (tier full/half), `HIT_Q` .72. Guard `tests/baseball9.check.mjs` (in `tests/replay/static.mjs`).
## Next
- Part 2: screen (overlay/page, 5x5 zone, phone + desktop) using `practice.js`; reuse the three.js `play.html` loads (0.186.1), the prototype used r128, do not ship a second copy.
- Part 3: the full 3-inning game (batted-ball physics, fielders, AI teams) from `ui/ref/baseball_9grid/`.
## Traps
- Local only: no backend, no ability change; a created player's result may only feed #369's training bonus number.
- In bat practice a "hit" is contact with q >= HIT_Q (or a bunt); the ball physics decide base hits only in part 3.
