# engine/ handoff

## Done
- #6 (engine 0.4.0): tuned against MLB 2025. Pitch location and swings depend on the count
  (`ZONE_BY_COUNT`, `SWING_ZONE_BY_COUNT`, `SWING_CHASE_BY_COUNT`), hits retuned by batted-ball
  type, coach walks intentionally only late and close, runners tag from second to third on fly
  outs, a play closer than `CLOSE_PLAY_MARGIN` goes to the runner.
- `tests/replay/run.mjs` plays all 12 pairings, prints steals, sacrifices and plate discipline,
  and fails when the default sample leaves the tolerance around the reference league.

## Next
1. Advancement not modelled (wild pitch, passed ball, steal of third, outs on the bases): the
   last 0.25 runs/game and the sacrifice-fly gap. Needs a render animation.
2. #7: determinism across JavaScript engines (`Math.sin`/`Math.cos` in `rules/field.js`).
3. Called third strikes are about 19% of strikeouts; real baseball is nearer a quarter.

## Known traps
- Never judge tuning on 1000 games (runs/game moves +-0.3 by chance): use 20,000+ on other seeds.
- K% and BB% are set by the split by count, not by the overall zone, swing and whiff rates.
- Any change to results changes every game of every seed: bump `ENGINE_VERSION`.
