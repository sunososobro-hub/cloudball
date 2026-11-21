# commentary/ handoff

## Done
- Bank (`lines.json`, gags, `validateBank`), personas 游明凱/周國棟 + four fans, frozen game script
  with pregame, sheet + `synth.mjs` (transcript gate #99, keyless cloud mode, `--cap` US$), wiring (#96).
- #108: sheet rows carry `ctx` (neutral if reused). #82 part 1: people slots from `league/staff.js`.
- #115: whole frozen game recorded (351 clips, 19 MB, US$2.09 for 306 new); 3 delays moved so
  every line fits except `先發投手…` at event 0 (no room; it belongs in the pregame, #56).
- #129: conversation trial: spoken rewrite of 3 exchanges (`tools/converse-trial.json`), `synth.mjs --converse`
  (previous clips as `input_audio`, required-word gate), A/B files. Verified on `at` 142 (US$0.03). Owner listens.

## Next (board order)
1. #82 part 2 (after #113 adds the slots to `KNOWN_SLOTS`): name the coach in the
   `pitching_change` exchanges. Any reworded line orphans its clip: re-run synth (missing rows only).
2. #45 owner edits; #61 leftovers; #56 pregame (move `先發投手…` there).
3. #129 verdict: if the owner likes B, carry the mode into the sheet (per-exchange rows) before any re-record.

## Known traps
- `tests/` is not this folder: new slots in exchanges need `KNOWN_SLOTS` in `tests/replay/commentary.mjs` (issue).
- Every trigger draws two RNG values even when silent; keep that, or drafts shift.
- `needs` lines win over `when` lines; give them `once` or they repeat every time they fit.
- Timing: `wire-audio.mjs --report 320` over the whole game; fix drops by delaying the next call.
- Late batter intros (up to +10 s after a long exchange) are not drops; words fixed until a re-record.
