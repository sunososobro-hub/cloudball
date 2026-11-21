# commentary/ handoff

## Done
- Bank (`lines.json`, gags, `validateBank`), personas 游明凱/周國棟 + four fans, frozen game script
  with pregame, sheet + `synth.mjs` (transcript gate #99, keyless cloud mode, `--cap` US$), wiring (#96).
- #108 sheet `ctx`; #82 part 1 people slots; #115 whole frozen game recorded (351 clips, US$2.09).
- #129: `synth.mjs --converse` trial; owner verdict: not better, approach dropped (tool stays, unwired).
- #134 step 1: `banter.js` (score per exchange, `topBanter` with gap and full line range) + check.

## Next (board order)
1. #134: owner verdict on the top 8 tunes the weights in `banter.js`; then the render issue (step 2).
2. #82 part 2 (after #113 `KNOWN_SLOTS`): coach named in `pitching_change` exchanges (re-synth missing rows).
3. #45 owner edits; #56 pregame (move `先發投手…` there). No paid call by a worker (#68 Money).

## Known traps
- `tests/` is not this folder: new slots in exchanges need `KNOWN_SLOTS`; `banter.check.mjs` is not in CI yet (issue).
- Every trigger draws two RNG values even when silent; keep that, or drafts shift.
- `needs` lines win over `when` lines; give them `once` or they repeat every time they fit.
- Timing: `wire-audio.mjs --report 320`; fix drops by delaying the next call (late batter intros are not drops).
- Banter: a reworded line can lose its gag mark (`GAG_MARKS`) or bank match; rerun the check after edits.
