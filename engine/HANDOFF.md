# engine/ handoff

## Done
- #6 (0.4.0): tuned against MLB 2025 by count; `run.mjs` fails outside the reference tolerances.
- #35 (0.4.1): tag spot at second beside the lane from first; `run.mjs` checks `TAG_LANE_CLEAR`.
- #7 (0.4.2, PR open): `sinCosDeg` (`+ - * /` only) replaces `Math.sin`/`Math.cos`; streams are the
  same but for the version. `run.mjs` bans `Math.sin`, `Math.pow`, `**` in `engine/`, pins `TRIG_PRINT`.

## Next
1. `fix/7` and `fix/59` (PR #277: #59, #65) stay red until #276 is merged; then merge `dev` into each,
   rerun, push. Both say 0.4.2 and both rewrite this file: the second to land takes 0.4.3, keeps both.
2. #23 catcher holds the ball on steals. Not fixable in `engine/` alone, numbers are in the issue.
3. #38 advancement not modelled (wild pitch first): the last 0.25 runs/game. Needs a render animation.
4. Called third strikes are about 19% of strikeouts; real baseball is nearer a quarter.

## Known traps
- Never judge tuning on 1000 games (runs/game moves +-0.3 by chance): use 20,000+ on other seeds.
- K% and BB% are set by the split by count, not by the overall zone, swing and whiff rates.
- Any change to results or times changes every stream: bump `ENGINE_VERSION`.
- Steals: the draw decides, the throw is timed to fit. The runner needs 4.2 s, the defence 1.8 s.
