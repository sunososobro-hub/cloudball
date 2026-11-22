# commentary/ handoff

## Done
- Bank (`lines.json`, gags, `validateBank`), personas 游明凱/周國棟 + four fans, frozen game script
  with pregame, sheet + `synth.mjs` (transcript gate #99, keyless cloud mode, `--cap` US$), wiring (#96).
- #108 sheet `ctx`; #82 part 1 people slots; #115 whole game recorded (351 clips); #129 `--converse` dropped. #171: checks run seed 704 on `OPENING_ROSTERS`.
- #134 step 1 `banter.js` + check; #175: banter weights tuned to the owner's picks (`CUE_POINTS`: analyst before guest; gag once per gag); check holds his verdict.
- #140: `tools/post-trial.mjs` free A/B (gain per emotion, silence trim, tempo, turn gaps) on at 30/142/1296; files in `audio/_trial/post/` (force-added; `_trial/` is git-ignored).

## Next (board order, #68 queue wins)
1. #175: tune `banter.js` weights so the owner's picks (8, 6, 3, 2) rank above 1, 4, 5, 7 on seed 704; add the check.
2. #140 parked by the owner (voice work); #134 step 2 (render) after #175.
3. #82 part 2 (after #113 `KNOWN_SLOTS`): coach named in `pitching_change` exchanges (re-synth missing rows).
4. #45 owner edits; #56 pregame (move `先發投手…` there). No paid call by a worker (#68 Money).

## Known traps
- `tests/` is not this folder: new slots in exchanges need `KNOWN_SLOTS`; `banter.check.mjs` is not in CI yet (issue).
- Every trigger draws two RNG values even when silent; keep that, or drafts shift.
- `needs` lines win over `when` lines: give them `once`. Timing: `wire-audio.mjs --report 320`; fix drops by delaying the next call (late batter intros are not drops).
- Banter: a reworded line can lose its gag mark (`GAG_MARKS`); rerun the check. Excited clips stay slow (long vowels).
