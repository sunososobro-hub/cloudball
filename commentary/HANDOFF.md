# commentary/ handoff

## Done
- Bank (`lines.json`), `player.js` draft, `voice.js`; #11 gags; #46 booth rules; #61 fan seat (`FAN_TRIGGERS`, own RNG).
- Tools: `add-intros.mjs` (bank `batter_up`), `add-lineup.mjs` (starters + short intro 「第N棒，位置名字。」, on the first pitch or while he walks up), `segment-script.mjs`, `make-sheet.mjs` (`.tts.json` for synth.mjs, id = hash of voice+tone+text, prints a rough reuse count). Rerun add-intros, add-lineup, make-sheet, wire-audio after every script edit.
- #96 (PR on `feat/96`): `wire-audio.mjs` fills `audio`+`dur` from `audio/<name>/<id>.mp3` (id from `line-id.mjs`); recorded game = only lines with a file, timed by `planRecorded` (no overlap; a line that cannot end before the next non-aside `pbp` line of a later event is dropped; intros are asides). Render hooks: #101; CI hook: #102. When `feat/26-audio` lands: run `wire-audio.mjs <script> --report`, fix `delay` where it causes a drop.
- #94: booth renamed 游振宇 -> 游明凱 (「明凱」), owls fan 陳彥廷 -> 陳昱辰 (「阿辰」): no player/coach/umpire shares a character of the given names. Bank `alt`: other wordings of a response, said in turn. Script colour/fan lines made generic where names were not needed.

## Next (board order)
1. #45 owner line edits (running list): apply new comments as written.
2. #26/#56: owner casting + synthesis of `scripts/preseason-opening.tts.json`; then `audio` fields per line. When the viewer plays the pregame (#55/#57), drop the six `at: 0` stand-in lines and rerun add-lineup: the game's leadoff man (劉立偉) then gets his intro (no room today).
3. #82 staff names (fan blames manager/umpire by name). Note: 黃建宏 shares a given name with coach 蕭建宏, 蔡文雄 with managers 游文雄/王文雄 (players are clear); use 「姓+教練」 for coaches.
4. Voice for the whole bank: clip list (fixed lines + names/numbers), one `audio` file per line.

## Known traps
- `tests/` is not this folder: new slots go in `KNOWN_SLOTS` in `tests/replay/commentary.mjs` (open an issue). `{guest}` only in fan moments. The test does not read `alt`: `validateBank` checks its slots.
- Every trigger draws two main-RNG and two fan-RNG values even when silent; keep that (`alt` rotation draws none).
- `needs` lines beat `when` lines: give them `once`. Fan moments: max `fanMaxUses` per game.
- `substitution`: `team` = team making the change (`{team}`). `{desc}` = engine text, may end 「！」.
- Player given names 振宇/彥廷 exist (黃振宇, 潘振宇, 郭彥廷): never bulk-replace them in scripts.
