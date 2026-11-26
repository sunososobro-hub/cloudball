# engine/ handoff

## Done
- #6 (0.4.0): tuned against MLB 2025 by count; `run.mjs` fails outside the reference tolerances. #35 (0.4.1): tag spot at second beside the lane from first; `run.mjs` checks `TAG_LANE_CLEAR`.
- #59 + #65 (0.4.2): the coach keeps a starter to a pitch budget (`SP_LIMIT_*`), 5.02 -> 5.23 IP/start; `run.mjs` checks IP/start and the quick hook; walk-off line without the comma.
- #7 (0.4.3): `sinCosDeg` (`+ - * /` only) replaces `Math.sin`/`Math.cos`. `run.mjs` bans `Math.sin`, `Math.pow`, `**` in `engine/`, pins `TRIG_PRINT`.
- #436 part 2: pinch hit behind `PINCH_HIT_ON` (off; `opts.pinchHit`), vote kind `H`, event `substitution` role `pinch_hitter`, frame `SUB`; `stats` gets a row per pinch hitter (`batters` names the rows); `tests/pinchhit.check.mjs`.
- #378: optional batter `def` (missing = 1, factory games unchanged) scales chase speed, hit and error chance (`DEF_*`); a pitcher's optional `pitches` list picks his pitch names from `PITCH_TYPES` at factory shares (`mixOf`, looks only).
- #378: optional batter `def` (missing = 1, factory games unchanged) scales chase speed, hit and error chance (`DEF_*`).
- #266 (0.4.11): home-run runners trot (kind `'trot'`, `HR_TROT_SPEED`); `tests/hr_trot.check.mjs`. #378: a pitcher's optional `pitches` list picks his pitch names from `PITCH_TYPES` at factory shares (`mixOf`, looks only).
- #81 (0.4.10): a "stay" pick on the pitching vote brings the pitching coach out (`VIS` frame, `MOUND_VISIT_DUR`, stream `mound_visit`), once per pitcher; no draw, outcomes unchanged, only later times move.

## Next
1. #23 part 1 (0.4.10): `LEAD_PRIMARY` 3.4 m between pitches (`leadAt` starts/ends there), tag-ups leave from the bag (`tagLeadAt`, `tl.tag`); hold median 1.62/0.98 s (safe/out). Part 2: break at the first move, jump from the draw, release at catch + `CATCHER_POP`.
2. #38 rest (0.4.4 wild pitch `WP_P`, 0.4.5 passed ball `PB_P`, 0.4.6 balk `BK_P`, frame `r: 'bk'`, no pitch event; 0.4.7 steal of 3rd `STEAL3_*`, `st.steal` = the base; 0.4.8 pickoff at first `PO_*`, frame `r: 'po'`; 0.4.9 throw-over that misses `POF_*`, frame `r: 'pof'`, `e.po`+`e.pof`, max 2 per PA): advancing on a throw or error, outs on the bases.
1. #23 catcher holds the ball on steals: needs a primary lead from `render/` first (see the issue).
2. #38 rest (0.4.4 wild pitch `WP_P`, 0.4.5 passed ball `PB_P`, 0.4.6 balk `BK_P`, frame `r: 'bk'`, no pitch event; 0.4.7 steal of 3rd `STEAL3_*`, `st.steal` = the base; 0.4.8 pickoff at first `PO_*`, frame `r: 'po'`; 0.4.9 throw-over that misses `POF_*`, frame `r: 'pof'`, `e.po`+`e.pof`, max 2 per PA; 0.4.10 batter takes 2nd on the throw home `THROW_HOME_ON_SINGLE_P`, `plan.throwHome`, `tests/onthrow.check.mjs`; 0.4.11 runner from 2nd sent home on a single `SEND_FROM_2ND_ON_SINGLE_P`, the throw decides, `play.outHome`, `tests/outhome.check.mjs`; 0.4.12 batter stretching a single `STRETCH_1B_P`, the throw to second decides, `play.outStretch`, `tests/stretch.check.mjs`; 0.4.13 outfield bobble on a single `OF_BOBBLE_*`, everyone +1 base, single + error, `play.errAdvance`, stream how `'error'`, `tests/bobble.check.mjs`; 0.4.14 wild throw past first on a GB error `WILD_THROW_*`, batter 2nd, runners +2, `play.wildThrow`, `plan.wild`, `tests/wildthrow.check.mjs`): tighten the runs tolerance.
3. Staffs have 4 relievers: 5.3 changes/game against about 6.6 in MLB. 4. Called third strikes: 19% of K, real ~25%.
5. #436 rest: render and commentary for frame `SUB` (then switch `PINCH_HIT_ON` on), pinch run, defensive replacement, bench season lines.

## Known traps
- Never judge tuning on 1000 games (runs/game moves +-0.3 by chance): 20,000+ on other seeds.
- K% and BB% follow the split by count, not the overall zone, swing and whiff rates.
- Any change to results or times changes every stream: bump `ENGINE_VERSION`.
- Steals: the draw decides, the throw is timed to fit. The runner needs 4.2 s, the defence 1.8 s.
