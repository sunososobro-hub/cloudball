# commentary/ handoff

## Done
- Bank (`lines.json`, gags, `validateBank`), personas 游明凱/周國棟 + four fans, frozen game script
  with pregame, sheet + `synth.mjs` (transcript gate #99, keyless cloud mode, `--cap` US$), wiring (#96).
- #108 sheet `ctx`; #82 part 1 people slots, part 2 coach named in `pitching_change` exchanges (bank only; check in `banter.check.mjs`); #115 whole game recorded (351 clips); #129 `--converse` dropped. #171: checks run seed 704 on `OPENING_ROSTERS`.
- #134 step 1 `banter.js` + check; #175: banter weights tuned to the owner's picks (`CUE_POINTS`: analyst before guest; gag once per gag); check holds his verdict.
- #140: `tools/post-trial.mjs` free A/B (gain per emotion, silence trim, tempo, turn gaps) on at 30/142/1296; files in `audio/_trial/post/` (force-added; `_trial/` is git-ignored).

## Next (board order, #68 queue wins)
1. #68 line is empty after #82 part 2: report 「沒單可做」 unless the manager adds an issue.
2. Frozen game (seed 704) keeps its recorded pitching-change lines; naming coaches there needs a re-synth (owner's paid call).
3. #140 voice parked by the owner; #134 step 2 (render); #45 owner edits; #56 pregame. No paid call by a worker.

## Known traps
- `tests/` is not this folder: new slots in exchanges need `KNOWN_SLOTS`; `banter.check.mjs` is not in CI yet (issue).
- Every trigger draws two RNG values even when silent; keep that, or drafts shift.
- `needs` lines win over `when` lines: give them `once`. Timing: `wire-audio.mjs --report 320`; fix drops by delaying the next call (late batter intros are not drops).
- Banter: a reworded line can lose its gag mark (`GAG_MARKS`); rerun the check. Excited clips stay slow (long vowels).
