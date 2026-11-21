# Commentary script format

A script is the booth's text for **one** game. It is written **after** the game has been
simulated, by reading the finished engine event stream.

## The three rules

1. **After the fact.** Every line is bound to the index of an engine stream event and may only
   talk about events at or before that index. No predictions, no hints about what comes next.
2. **One way.** Commentary reads the game; it never feeds back into it. The engine does not
   import this folder, and nothing a commentator says can change a result or a statistic.
3. **Free to watch.** No AI or other paid service is called while someone watches. Scripts are
   prepared ahead of time and shipped as static JSON (and, optionally, audio files).

## File

`commentary/scripts/<name>.json`, registered in `commentary/scripts/index.json`:

```json
{ "scripts": { "2779036373": "preseason-0001.json" } }
```

The key is the game's seed as an unsigned decimal integer.

```json
{
  "version": 1,
  "seed": 2779036373,
  "engine": "0.3.0",
  "events": 1129,
  "lines": [
    { "at": 0,  "speaker": "pbp",   "text": "各位球迷晚安。", "delay": 1 },
    { "at": 0,  "speaker": "color", "text": "今天誰輸誰買鹹酥雞。" },
    { "at": 37, "speaker": "pbp",   "text": "三振！", "audio": "audio/preseason-0001/0003.mp3", "priority": 2 }
  ]
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `version` | yes | Format version, `1`. |
| `seed`, `engine`, `events` | recommended | Seed, engine version and stream length the script was written against. If any of them does not match the game being shown, the whole script is ignored and the fallback bank is used: a script for a different game would describe things that did not happen. |
| `lines[].at` | yes | Index (`i`) of the engine stream event the line is bound to. Lines are ordered by `at`. |
| `lines[].speaker` | yes | `pbp` (play-by-play) or `color`. See `personas/`. |
| `lines[].text` | yes | What is said. Also the text read by the browser voice when there is no audio. |
| `lines[].delay` | no | Seconds after the event before the line is due. Default 0. |
| `lines[].audio` | no | Pre-rendered audio file, path relative to `commentary/`. Played when present; if it is missing or fails to load, the browser's speechSynthesis reads `text`. |
| `lines[].priority` | no | `2` = also spoken when the viewer fast-forwards. Default 0. |

Validate with `validateScript(script, stream)` from `player.js`; the test suite runs it on every
script that is registered.

## The fallback bank (`lines.json`)

Games without a script are voiced from `lines.json`. The viewer drafts a script from it on the
spot, deterministically for a given seed.

- `triggers.<name>`: what the booth may say when that thing happens (`strikeout`, `home_run`,
  `batter_up`, `half_end`, ...). The list of triggers is in `player.js` (`triggerOf`).
- `exchanges`: **call and response** pairs. `call` is spoken by the play-by-play voice,
  `response` (optional) by the colour voice right after it.
- `when`: conditions on slots, e.g. `{ "batterKToday": { "min": 3 } }`. Exchanges whose
  condition holds are preferred over generic ones.
- Slots, filled from the game so far: `{batter}` `{pitcher}` `{runner}` `{team}` `{fieldTeam}`
  `{away}` `{home}` `{inning}` `{half}` `{outs}` `{awayScore}` `{homeScore}` `{margin}`
  `{leadTeam}` `{runs}` `{halfRuns}` `{desc}` (the play as shown on screen), this batter today:
  `{batterKToday}` `{batterHits}` `{batterAb}` `{batterHrToday}` `{batterPrev}` (his previous
  plate appearance), this pitcher today: `{pitcherK}` `{pitchCount}`, and the callback to the
  previous inning: `{lastInningRuns}` (what this team scored the last time it batted).
- **Sometimes nobody talks.** Every trigger has a `silence` probability, and after the booth
  has spoken, routine triggers stay quiet for `rules.minGapSec` seconds. Silence is part of the
  broadcast; do not tune it to zero.
- An exchange is not reused within the last `rules.noRepeatWindow` exchanges.
