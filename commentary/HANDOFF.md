# commentary/ handoff

## Done
- Fallback bank (`lines.json`) + `player.js` draft, `voice.js` (audio file or speechSynthesis).
- #11: running gags with setup before payoff (`gag`/`sets`/`needs`/`once`), `validateBank()`.
- #46: point-of-view rules in `README.md`; personas 游振宇 (`pbp`) and 周國棟 (`color`),
  casting waiting for owner approval; bank rewritten (wiring unchanged, 69 of 148 lines no slot).
  Fixed: pitching change named the wrong team; 「三上三下」 said after any scoreless inning.

## Next (board order)
1. #45 owner line edits, on top of the #46 rewrite (edit 1 call wording still to apply).
2. #61 third seat (four fan personas, third speaker), then #26 voiced frozen game, then #56.

## Known traps
- `tests/` is not this folder: new slots go in `KNOWN_SLOTS` in `tests/replay/commentary.mjs`
  by its owner (open an issue), or the test fails.
- Every trigger draws two RNG values even when silent; keep that, or drafts shift.
- `needs` lines win over `when` lines; give them `once` or they repeat every time they fit.
- On `substitution` events `team` is the team making the change: use `{team}`, not `{fieldTeam}`.
- `{desc}` is engine text; HR, double play, bunt hit end in 「！」: no punctuation after it there.
