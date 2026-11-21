# engine/ handoff

## Done
- #6 (0.4.0): tuned against MLB 2025; pitches and swings follow the count; `run.mjs` plays all 12
  pairings and fails when the default sample leaves the tolerance around the reference league.
- #35 (0.4.1): tag spot at second moved beside the lane from first (`SECOND_TAG_OFF`). Results are
  unchanged, only cover times on steals move (under 0.1 s). `run.mjs` now fails when a fielder
  waits to tag closer than `TAG_LANE_CLEAR` to the arriving runner's lane.

## Next
1. #23 catcher holds the ball on steals. Not fixable in `engine/` alone, numbers are in the issue.
2. #38 advancement not modelled (wild pitch first): the last 0.25 runs/game. Needs a render animation.
3. #7 determinism across JavaScript engines (`Math.sin`/`Math.cos` in `rules/field.js`).
4. Called third strikes are about 19% of strikeouts; real baseball is nearer a quarter.

## Known traps
- Never judge tuning on 1000 games (runs/game moves +-0.3 by chance): use 20,000+ on other seeds.
- K% and BB% are set by the split by count, not by the overall zone, swing and whiff rates.
- Any change to results or times changes every stream: bump `ENGINE_VERSION`.
- Steals: the draw decides, the throw is timed to fit. The runner needs 4.2 s, the defence 1.8 s.
