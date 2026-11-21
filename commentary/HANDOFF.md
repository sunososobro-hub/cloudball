# commentary/ handoff

## Done
- Bank (`lines.json`, gags, `validateBank`), personas 游明凱/周國棟 + four fans, frozen game script
  with pregame, sheet + `synth.mjs` (transcript gate #99, keyless cloud mode), wiring/timing (#96).
- #108: sheet rows carry `ctx` (neutral if reused), sent as delivery context; WAV, one mp3 q0 encode.
  Opening + inning 1 top remade with it (45 clips, ~US$0.29, 0 re-takes); 12.3 s clip now 3.5 s.

## Next (board order)
1. Full game only after the owner approves the test listen and the budget (~USD 2.5): missing rows.
   Timing: `color-08ccb2ddb3` (event 64) is dropped (no room before the inning-end call); the
   batter call after the HR exchange is 10 s late (`wire-audio.mjs --report 30`). Fix `delay`s.
2. #45 owner line edits; #82 staff names; #56 pregame; #61 third seat leftovers.

## Known traps
- `tests/` is not this folder: new slots go in `KNOWN_SLOTS` in `tests/replay/commentary.mjs` (issue).
- Every trigger draws two RNG values even when silent; keep that, or drafts shift.
- `needs` lines win over `when` lines; give them `once` or they repeat every time they fit.
- On `substitution` events `team` is the team making the change: use `{team}`, not `{fieldTeam}`.
