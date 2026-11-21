# commentary/ handoff

## Done
- Bank (`lines.json`, gags, `validateBank`), personas 游明凱/周國棟 + four fans, frozen game script
  with pregame, sheet + `synth.mjs` (transcript gate #99, keyless cloud mode), wiring/timing (#96).
- #108 (PR to dev): sheet rows carry `ctx` (neutral for reused rows, real neighbours otherwise),
  `synth.mjs` sends it as delivery context, `--show` prints a request; WAV from the API, one mp3
  encode at q0 (~18 MB per game). Points 1-3 only: api.openai.com was blocked here (proxy 403).

## Next (board order)
1. #108 point 4 once `synth.mjs --ping` passes: `--redo --only <opening + inning 1 top ids>`, wire,
   report to the owner. Never the whole game before he approves (~USD 2.5).
2. #45 owner line edits; #82 staff names; #56 pregame; #61 third seat leftovers.

## Known traps
- `tests/` is not this folder: new slots go in `KNOWN_SLOTS` in `tests/replay/commentary.mjs` (issue).
- Every trigger draws two RNG values even when silent; keep that, or drafts shift.
- `needs` lines win over `when` lines; give them `once` or they repeat every time they fit.
- On `substitution` events `team` is the team making the change: use `{team}`, not `{fieldTeam}`.
- Existing clips now show `STALE` (made without context): expected, `--redo` remakes them.
