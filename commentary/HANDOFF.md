# commentary/ handoff

## Done
- Bank (`lines.json`), `player.js` draft, `voice.js`; #11 gags; #46 booth rules; #61 fan seat (`FAN_TRIGGERS`, own RNG).
- Tools: `add-intros.mjs` (bank `batter_up`), `add-lineup.mjs` (starters + short intro 「第N棒，位置名字。」, on the first pitch or while he walks up), `segment-script.mjs`, `make-sheet.mjs` (`.tts.json` for synth.mjs, id = hash of voice+tone+text, prints a rough reuse count). Rerun add-intros, add-lineup, make-sheet, wire-audio after every script edit. #96 `wire-audio.mjs`: `audio`+`dur` by sheet id; recorded game = only lines with a file (`planRecorded`); hooks #101 (render), #102 (CI).
- #99 (PR on `fix/99`): `synth.mjs` gate (`tools/transcript.mjs`: punctuation/spaces dropped, numbers one way; 3 tries, then no file, exit 1), no key needed (proxy adds it; `--ping` free check), `ffmpeg`/`FFMPEG` check; `wire-audio.mjs` refuses clips whose manifest transcript fails. Persona text = voice only: the 6 colour + 3 owls-fan clips now show STALE (kept; `--redo` only with owner OK).
- #94: booth renamed 游振宇 -> 游明凱 (「明凱」), owls fan 陳彥廷 -> 陳昱辰 (「阿辰」): no player/coach/umpire shares a character of the given names. Bank `alt`: other wordings of a response, said in turn. Script colour/fan lines made generic where names were not needed.

## Next (board order)
1. #99 point 7, after merge: generate in the cloud, missing rows only, files + manifest in their own PR. On 2026-11-21 the cloud proxy refused api.openai.com (CONNECT 403): the OpenAI network secret / host allowance is not on this environment yet. Re-takes waiting: color-2dcd3737c4, color-4f49145609, color-08ccb2ddb3 (dropped from #98), color-dcbde0f4f3 (12.3 s; `--only`).
2. #45 owner line edits (running list): apply new comments as written.
3. #26/#56: owner casting + synthesis of `scripts/preseason-opening.tts.json`; then `audio` fields per line. When the viewer plays the pregame (#55/#57), drop the six `at: 0` stand-in lines and rerun add-lineup: the game's leadoff man (劉立偉) then gets his intro (no room today).
4. #82 staff names (fan blames manager/umpire by name). Note: 黃建宏 shares a given name with coach 蕭建宏, 蔡文雄 with managers 游文雄/王文雄 (players are clear); use 「姓+教練」 for coaches. Then: voice for the whole bank (one `audio` file per line).

## Known traps
- `tests/` is not this folder: new slots go in `KNOWN_SLOTS` in `tests/replay/commentary.mjs` (open an issue). `{guest}` only in fan moments. The test does not read `alt`: `validateBank` checks its slots.
- Every trigger draws two main-RNG and two fan-RNG values even when silent; keep that (`alt` rotation draws none).
- `needs` lines beat `when` lines: give them `once`. Fan moments: max `fanMaxUses` per game.
- `substitution`: `team` = team making the change (`{team}`). `{desc}` = engine text, may end 「！」.
- Player given names 振宇/彥廷 exist (黃振宇, 潘振宇, 郭彥廷): never bulk-replace them in scripts.
