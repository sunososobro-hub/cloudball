# league/ handoff (roster window: league/ + tests/)

## Done
- #50 names, #52 staff, #47 recorder, #113 slots, #137 banter + #102 audio checks, #71 fan
  slots/share (10..30%) in `commentary.mjs`; booth names (4 guests + pbp/color) in `names.check.mjs`.
- #54 wave 1: `league/bios.js` lines + tags for the 28 starters/SP of the default pairing
  (pheasants vs owls); `tests/bios.check.mjs` runs from `static.mjs`. Owner strikes lines in the PR.

## Next
1. #54 wave 2 (after the owner's strike list on wave 1): the other 44 players, same rules.
2. #37 (tests README). Queue order lives in issue #68.

## Known traps
- The engine looks players up by `name`: full names must stay unique per team or games change.
- Do not hand-edit names: change the blocklist or the seed and rerun `--write`.
- Staff and bio lines are owner-approved content: change them only with his strike list from the PR.
- Bio tags[0] is computed from ratings: if ratings change (ledger), the check names the new tag.
- Bio superlatives ("全隊最快" etc.) are checked by hand, not by the test: recheck on roster edits.
- Team names (#60) belong to the interface window; do not touch `teams.js` strings.
- Blocklist lists 3 and 4 are hand-made and incomplete; extend them when a real name is spotted.
