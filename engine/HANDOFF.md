# engine/ handoff

## Done
- #6 (0.4.0): tuned against MLB 2025 by count; `run.mjs` fails outside the reference tolerances. #35 (0.4.1): tag spot
  at second beside the lane from first; `run.mjs` checks `TAG_LANE_CLEAR`.
- #59 + #65 (0.4.2): the coach keeps a starter to a pitch budget (`SP_LIMIT_*`), 5.02 -> 5.23 IP/start;
  `run.mjs` checks IP/start and the quick hook; walk-off line without the comma.
- #7 (0.4.3): `sinCosDeg` (`+ - * /` only) replaces `Math.sin`/`Math.cos`. `run.mjs` bans `Math.sin`, `Math.pow`, `**` in `engine/`, pins `TRIG_PRINT`.
- #378: optional batter `def` (missing = 1, factory games unchanged) scales chase speed, hit and error chance (`DEF_*`).

## Next
1. #23 catcher holds the ball on steals: needs a primary lead from `render/` first (see the issue).
2. #38 rest (0.4.4 wild pitch `WP_P`, 0.4.5 passed ball `PB_P`, 0.4.6 balk `BK_P`, frame `r: 'bk'`, no pitch event; 0.4.7 steal of 3rd `STEAL3_*`, `st.steal` = the base; 0.4.8 pickoff at first `PO_*`, frame `r: 'po'`; 0.4.9 throw-over that misses `POF_*`, frame `r: 'pof'`, `e.po`+`e.pof`, max 2 per PA): advancing on a throw or error, outs on the bases.
3. Staffs have 4 relievers: 5.3 changes/game against about 6.6 in MLB. 4. Called third strikes: 19% of K, real ~25%.

## Known traps
- Never judge tuning on 1000 games (runs/game moves +-0.3 by chance): 20,000+ on other seeds.
- K% and BB% follow the split by count, not the overall zone, swing and whiff rates.
- Any change to results or times changes every stream: bump `ENGINE_VERSION`.
- Steals: the draw decides, the throw is timed to fit. The runner needs 4.2 s, the defence 1.8 s.
