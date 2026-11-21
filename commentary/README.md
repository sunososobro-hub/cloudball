# commentary

The booth: two commentators and a fan guest. Commentary is produced after a game is simulated, only reads past engine
events and never feeds back into the engine. No AI or paid service is called while watching.

- `personas/`: the two fixed voices, 游明凱 (`pbp`) and 周國棟 (`color`), and the four fan guests
  (`fan-<team>.md`, speaker `fan`): the fan of the **home** team sits in for that game (#61).
- `SCRIPT_FORMAT.md`: the per-game script format and the fallback bank format.
- `lines.json`: fallback bank, call-and-response pairs with slots.
- `player.js`: picks the line for each moment (pure, runs under Node) and times a recorded game by
  its clip lengths. `voice.js`: plays the recorded files of a recorded game (never mixed with the
  browser voice), otherwise the browser's speechSynthesis. Check: `node commentary/audio.check.mjs`.
- `tension.js`: tension index, 0 to 100 per stream event, a pure causal function of the stream;
  `emotionFor()` turns it into a line's emotion tag. Check: `node commentary/tension.check.mjs`.
- `scripts/`: per-game scripts and their index. `audio/`: pre-rendered voice files.
- `tools/synth.mjs --converse`: conversation trial (#129) of `tools/converse-trial.json`: each speaker hears
  the clips before his and answers live; gate = required words; A/B files in `audio/_trial/converse/` (not wired).

## Point of view (binding for the bank and every script)

1. **They are in the booth tonight.** Two people at the ballpark, watching this game live,
   talking to the viewers and to each other. They do not know they are scripted. They never
   mention the product, the engine, seeds, builds or how voting works. A fan vote is "the
   fans have spoken", heard from the booth, never a feature description.
2. **Roles.** Play-by-play calls what he sees as it happens: who, where the ball went, what the
   runner did, the score. Colour reacts as a former player: why it happened, who did it right,
   a jab at his partner. They use each other's names (「明凱」, 「周哥」).
3. **Spoken, not written.** Short Taiwanese Mandarin as a TV booth sounds. No sentence that only
   works on paper, no forum slang, no stat read-out that sounds like a variable dump.
4. **No self-explaining.** A line never explains itself or announces what it is about to do.
5. **True.** Opinions may be wrong; facts may not. Never state something about the play that
   the event did not record (which base, which team, how the inning went).
6. **The third seat.** The fan guest is biased, loud and often wrong in his opinions, but like
   the other two he never states a false fact. He talks less (about one line in five), only
   once a play is over, and the two professionals answer him by his nickname.
7. **The test.** Read every line aloud. Would a real broadcaster say this exact sentence on
   air? If not, rewrite it.
