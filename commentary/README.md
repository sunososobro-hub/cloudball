# commentary

The two commentators. Commentary is produced after a game is simulated, only reads past engine
events and never feeds back into the engine. No AI or paid service is called while watching.

- `personas/`: the two voices (placeholders until the owner casts them).
- `SCRIPT_FORMAT.md`: the per-game script format and the fallback bank format.
- `lines.json`: fallback bank, call-and-response pairs with slots.
- `player.js`: picks the line for each moment (pure, runs under Node). `voice.js`: plays a
  pre-rendered audio file when a line has one, otherwise the browser's speechSynthesis.
- `scripts/`: per-game scripts and their index. `audio/`: pre-rendered voice files.
