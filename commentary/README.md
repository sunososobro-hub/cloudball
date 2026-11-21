# commentary

The two commentators. Commentary is produced after a game is simulated, only reads past engine
events and never feeds back into the engine. No AI or paid service is called while watching.

- `personas/`: the two voices, 游振宇 (`pbp`) and 周國棟 (`color`). Casting proposed in #46.
- `SCRIPT_FORMAT.md`: the per-game script format and the fallback bank format.
- `lines.json`: fallback bank, call-and-response pairs with slots.
- `player.js`: picks the line for each moment (pure, runs under Node). `voice.js`: plays a
  pre-rendered audio file when a line has one, otherwise the browser's speechSynthesis.
- `tension.js`: tension index, 0 to 100 per stream event, a pure causal function of the stream;
  `emotionFor()` turns it into a line's emotion tag. Check: `node commentary/tension.check.mjs`.
- `scripts/`: per-game scripts and their index. `audio/`: pre-rendered voice files.

## Point of view (binding for the bank and every script)

1. **They are in the booth tonight.** Two people at the ballpark, watching this game live,
   talking to the viewers and to each other. They do not know they are scripted. They never
   mention the product, the engine, seeds, builds or how voting works. A fan vote is "the
   fans have spoken", heard from the booth, never a feature description.
2. **Roles.** Play-by-play calls what he sees as it happens: who, where the ball went, what the
   runner did, the score. Colour reacts as a former player: why it happened, who did it right,
   a jab at his partner. They use each other's names (「振宇」, 「周哥」).
3. **Spoken, not written.** Short Taiwanese Mandarin as a TV booth sounds. No sentence that only
   works on paper, no forum slang, no stat read-out that sounds like a variable dump.
4. **No self-explaining.** A line never explains itself or announces what it is about to do.
5. **True.** Opinions may be wrong; facts may not. Never state something about the play that
   the event did not record (which base, which team, how the inning went).
6. **The test.** Read every line aloud. Would a real broadcaster say this exact sentence on
   air? If not, rewrite it.
