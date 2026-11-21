# commentary/ handoff

## Done
- Bank (`lines.json`, gags, `validateBank`), personas 游明凱/周國棟 + four fans, frozen game script
  with pregame, sheet + `synth.mjs` (transcript gate #99, keyless cloud mode), wiring/timing (#96).
- #108 (PR to dev): sheet rows carry `ctx` (neutral for reused rows, real neighbours otherwise),
  `synth.mjs` sends it as delivery context, `--show` prints a request; WAV from the API, one mp3
  encode at q0 (~18 MB per game). Point 4: opening + inning 1 top remade with context (45 clips,
  ~US$0.29, 0 re-takes), incl. the 3 dropped colour lines; the 12.3 s clip is now 3.5 s.

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
- Existing clips now show `STALE` (made without context): expected, `--redo` remakes them.
