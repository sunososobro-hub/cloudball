# ui/baseball9 HANDOFF (2026-11-25)
## Done
- #332 part 1: `practice.js` = pure rules of the 9-grid prototype for the two practice modes (no DOM, no three.js, no engine/). `createPractice('bat'|'pitch', {rnd, batterType, con})`; `.swing({mode,r,c})` / `.pitch({pt,r,c})` return `{out, done, result}`; result `{side, mode:'practice', hits, pitches, tier}`.
- Constants: `PRACTICE_PITCHES` 10, `FULL_AT` 4 (tier full/half), `HIT_Q` .72. Guard `tests/baseball9.check.mjs` (in `tests/replay/static.mjs`).
- #332 part 2: `baseball9.html` + `ui/baseball9/screen.js` / `screen.css` / `text.js`: plain DOM (3x3 bat grid, 5x5 pitch grid, 44px cells, 390px phone ok), no three.js. Result kept in `window.baseball9Result`, nothing sent anywhere. Check extended in `tests/baseball9.check.mjs`.
- #332 part 3a: `ball.js` = batted-ball launch, flight (drag, bounce, fence, HR) and fielding, pure + seedable; `batBall(q,{app,pt,bunt,pow,F,rnd})` -> HR / caught / ground / gap. Check in `tests/baseball9.check.mjs`.
## Next
- Link the page from the player/agent pages once the owner says where (not linked yet; only `guide.html` links back).
- Part 3b: runners, throws, double plays, tag-ups (`play`/`hitPlay` of the prototype) on top of `ball.js`; part 3c: 3 innings, AI teams, screen. Source from `ui/ref/baseball_9grid/`.
## Traps
- Local only: no backend, no ability change; a created player's result may only feed #369's training bonus number.
- In bat practice a "hit" is contact with q >= HIT_Q (or a bunt); the ball physics decide base hits only in part 3.
