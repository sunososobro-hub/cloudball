# commentary/ handoff

## Done
- Fallback bank (`lines.json`) + `player.js` draft, `voice.js` (audio file or speechSynthesis).
- #11: running gags have a setup before the payoff (`gag`/`sets`/`needs`/`once`), one gag per
  game, `validateBank()`. Checked on 300 seeds: no payoff before its setup, never two gags.

## Next
1. Write the first per-game script (`scripts/`) for a preseason seed, to prove the format end to end.
2. More bank lines for late, close games (inning 8+, one-run margin) and for long droughts.
3. Personas are placeholders until the owner casts the two voices; do not treat them as canon.

## Known traps
- `tests/` is not this folder: new slots must be added to `KNOWN_SLOTS` in
  `tests/replay/commentary.mjs` by its owner (open an issue), or the test fails.
- Every trigger draws two RNG values even when silent; keep that, or drafts shift.
- `needs` lines win over `when` lines; give them `once` or they repeat every time they fit.
