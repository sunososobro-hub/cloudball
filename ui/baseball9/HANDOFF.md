# ui/baseball9 HANDOFF (2026-11-25)
## Done
- #332 part 1: `practice.js` = pure rules of the 9-grid prototype for the two practice modes (no DOM, no three.js, no engine/). `createPractice('bat'|'pitch', {rnd, batterType, con})`; `.swing({mode,r,c})` / `.pitch({pt,r,c})` return `{out, done, result}`; result `{side, mode:'practice', hits, pitches, tier}`.
- Constants: `PRACTICE_PITCHES` 10, `FULL_AT` 4 (tier full/half), `HIT_Q` .72. Guard `tests/baseball9.check.mjs` (in `tests/replay/static.mjs`).
- #332 part 2: `baseball9.html` + `ui/baseball9/screen.js` / `screen.css` / `text.js`: plain DOM (3x3 bat grid, 5x5 pitch grid, 44px cells, 390px phone ok), no three.js. Result kept in `window.baseball9Result`, nothing sent anywhere. Check extended in `tests/baseball9.check.mjs`.
- #332 part 3a: `ball.js` = batted-ball launch, flight (drag, bounce, fence, HR) and fielding, pure + seedable; `batBall(q,{app,pt,bunt,pow,F,rnd})` -> HR / caught / ground / gap. Check in `tests/baseball9.check.mjs`.
- #332 part 3b: `play.js` = `playBall(q,{batter,bases,outs,def,rnd,...})`: one batted ball with runners (fielding, throws, double plays, tag-ups, runner advance, runs), ported from the prototype's `play`/`hitPlay`, pure + seedable (the prototype's two `Math.random` calls now use `rnd`). Check in `tests/baseball9.check.mjs`.
- #332 part 3c-1: `game.js` = `createGame({rnd})`, 3 innings (+2 tie-break), score, half-run cap, AI approach / shift / pitch / swing, steals, walks, strikeouts, on top of `practice.resolve` (new `app` option) and `playBall`. `game.pitch(choice)` = one pitch. Check in `tests/baseball9.check.mjs`.
- #332 part 3c-2: `gamescreen.js` + `#gstage` in `baseball9.html`: the 3-inning game screen (approach / shift / mode / pitch type, 3x3 or 5x5 grid, steal / hold, count, bases, line score, log, result in `window.baseball9GameResult`). Check drives the real screen on a fake DOM through whole games.
- #430 part 1: `field.js` = canvas 2D field in the 三局比賽 screen: pitch leg, then the batted ball along `out.play.ball`; text beats (strikeout, walk, steal, HR); skip + 1x/3x buttons. `buildBeats` / `ballAt` pure and tested; no canvas = no picture. Reads results only.
## Next
- Link the page from the player/agent pages once the owner says where (not linked yet; only `guide.html` links back).
- #430 part 2: runners on the field from `sc.runners`; then the two practice screens (screen.js) still have no picture.
## Traps
- Local only: no backend, no ability change; a created player's result may only feed #369's training bonus number.
- In bat practice a "hit" is contact with q >= HIT_Q (or a bunt); the ball physics decide base hits only in part 3.
