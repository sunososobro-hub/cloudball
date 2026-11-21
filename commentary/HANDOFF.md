# commentary/ handoff

## Done
- Bank (`lines.json`), `player.js` draft, `voice.js`; #11 running gags (`validateBank()`).
- #46: point-of-view rules in `README.md`; personas 游振宇 (`pbp`), 周國棟 (`color`), approved.
- #61: third seat `fan` (`guests` + `fan` in bank, `personas/fan-*.md`; names unchecked until #50). ~1 line in 5, only on `FAN_TRIGGERS`, own RNG stream.
- Batter intros: `tools/add-intros.mjs <script>` (bank `batter_up`) and `tools/add-lineup.mjs <script>` (starters, slot/position/number from the game data) merge into a hand-written script (it replaces the bank for the whole game). Rerun after edits or a new batting order; `--check`, `--text` (full lineup read-out). `tools/segment-script.mjs <script> <dir>` cuts a script into voice segments + clip list. `tools/make-sheet.mjs <script>` writes `<name>.tts.json` (synth.mjs input, whole sentences, id = hash of voice+tone+text); rerun after every script edit, `--check`, `--audio <dir>` lists orphans.

## Next (board order)
1. #45 owner line edits (edit 1: only the owner wording of the `game_start` call is left).
2. #26: the frozen game's script is written (`scripts/preseason-opening.json`, seed 704, three voices, `emotion` per line; owner edits lines by hand). Left: voices/tool (`fix/26-voices`), synthesis after casting, staff names after #52, then #56.
3. After #52 (staff): fan blames manager/umpire by name.
4. Voice: clip list for the whole bank (446 fixed lines + names/numbers; `{desc}` needs fixed phrasings); the viewer plays one `audio` file per line, so cut clips must be joined per line first.
5. #56 pregame: frozen game script (`scripts/preseason-opening.json`, seed 704) now has the 44-line `pregame` part (six segments) + `.tts.json` (339 files). Left: owner casting/synthesis, then `audio` fields per line; when the viewer plays the pregame (#55/#57), drop the six `at: 0` hello/starters lines from `lines` (same audio ids as `open`/`pitchers`); character lines after #54. Render notes need no issue (`aside` = #70, pregame length = #55/#57).

## Known traps
- `tests/` is not this folder: new slots go in `KNOWN_SLOTS` in `tests/replay/commentary.mjs` by its owner (open an issue). `{guest}` is only filled in fan moments.
- Every trigger draws two main-RNG and two fan-RNG values even when silent; keep that.
- `needs` lines beat `when` lines: give them `once`. Fan moments: max `fanMaxUses` per game.
- `substitution`: `team` = team making the change (`{team}`). `{desc}` = engine text, may end 「！」.
