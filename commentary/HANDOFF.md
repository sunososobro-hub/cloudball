# commentary/ handoff

## Done
- Bank (`lines.json`, gags, `validateBank`), personas 游明凱/周國棟 + four fans, frozen game script
  with pregame, sheet + `synth.mjs` (transcript gate #99, keyless cloud mode), wiring/timing (#96).
- #108: sheet rows carry `ctx` (neutral if reused); opening + inning 1 top remade (45 clips).
- #82 part 1: people slots from `league/staff.js` (`{manager}` `{pitchingCoach}` `{homeManager}`
  `{plateUmp}` + character lines), used in fan-guest lines; `validateBank` checks every slot.

## Next (board order)
1. Full game after the owner approves the test listen + budget (~USD 2.5). First fix `delay`s:
   `color-08ccb2ddb3` dropped, batter call after the HR exchange 10 s late (`wire-audio.mjs --report 30`).
2. #82 part 2 (after #113 adds the slots to `KNOWN_SLOTS`): name the coach in the
   `pitching_change` exchanges (「教練走出來了」). Then #45 owner edits; #61 leftovers.

## Known traps
- `tests/` is not this folder: new slots in exchanges need `KNOWN_SLOTS` in `tests/replay/commentary.mjs` (issue).
- Every trigger draws two RNG values even when silent; keep that, or drafts shift.
- `needs` lines win over `when` lines; give them `once` or they repeat every time they fit.
- On `substitution` events `team` is the team making the change: use `{team}`, not `{fieldTeam}`.
