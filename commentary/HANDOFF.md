# commentary/ handoff

## Done
- Bank (`lines.json`), `player.js` draft, `voice.js`; #11 running gags (`validateBank()`).
- #46: point-of-view rules in `README.md`; personas 游振宇 (`pbp`), 周國棟 (`color`), approved.
- #61: third seat, speaker `fan` = home team's fan (`guests` + `fan` in bank, `personas/fan-*.md`;
  casting awaits owner, names unchecked until #50; open #70 render, #71 tests). ~1 line in 5, only on `FAN_TRIGGERS` (play over), own RNG stream, `aside` lines yield to pbp.
- Batter intros: `tools/add-intros.mjs <script>` (bank `batter_up`) and `tools/add-lineup.mjs <script>` (starters, slot/position/number from the game data) merge into a hand-written script (it replaces the bank for the whole game). Rerun after edits or a new batting order; `--check`.

## Next (board order)
1. #45 owner line edits (edit 1: only the owner wording of the `game_start` call is left).
2. #26: the frozen game's script is written (`scripts/preseason-opening.json`, seed 704, three voices, `emotion` per line; owner edits lines by hand). Left: voices/tool (`fix/26-voices`), synthesis after casting, staff names after #52, then #56.
3. After #52 (staff): fan blames manager/umpire by name.

## Known traps
- `tests/` is not this folder: new slots go in `KNOWN_SLOTS` in `tests/replay/commentary.mjs`
  by its owner (open an issue). `{guest}` is only filled in fan moments, never in exchanges.
- Every trigger draws two main-RNG and two fan-RNG values even when silent; keep that.
- `needs` lines beat `when` lines: give them `once`. Fan moments: max `fanMaxUses` per game.
- `substitution`: `team` = team making the change (`{team}`). `{desc}` = engine text, may end 「！」.
