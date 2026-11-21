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
| `guest` | no | Team id of the fan in the third seat. Default: the home team. |
| `lines[].speaker` | yes | `pbp` (play-by-play), `color`, or `fan` (the guest). See `personas/`. |
| `lines[].text` | yes | What is said. Also the text read by the browser voice when there is no audio. |
| `lines[].delay` | no | Seconds after the event before the line is due. Default 0. |
| `lines[].audio` | no | Pre-rendered audio file, path relative to `commentary/`. Filled by `tools/wire-audio.mjs`, never by hand. A script with any `audio` is a **recorded** game: only lines with a file are spoken; a line without one, or a file that fails to load, stays silent. The browser's speechSynthesis reads `text` only in games with no recorded audio at all. |
| `lines[].dur` | no | Length of the `audio` clip in seconds, written by `tools/wire-audio.mjs`. Times the recorded game (see Voice). |
| `lines[].emotion` | no | Delivery tag for voice synthesis: one of `EMOTIONS` in `tension.js` (`calm`, `excited`, `tense`, `thrilled`, `disappointed`, `amused`). The viewer ignores it. |
| `lines[].priority` | no | `2` = also spoken when the viewer fast-forwards. Default 0. |
| `lines[].aside` | no | `true` for the lines of a fan moment: the voice drops them, still queued, when a new play-by-play call comes. `fan` lines are asides by default. |
| `lines[].cast` | no | Voice of a `fan` line (`fan` or `fan_f`); filled from the guest when missing. |

## Pregame part

A showing is the pregame, then the recorded game (shared contract on #55/#56). The optional
`pregame` list holds what the booth says before the first pitch; the game clock starts after it.

```json
"pregame": [
  { "seg": "open",     "t": 6, "speaker": "pbp",   "text": "各位觀眾朋友晚安……", "emotion": "calm" },
  { "seg": "pitchers", "t": 1, "speaker": "pbp",   "text": "先發投手，……",       "emotion": "calm" }
]
```

| Field | Required | Meaning |
| --- | --- | --- |
| `seg` | yes | Segment id, in this order (`PREGAME_SEGMENTS` in `player.js`): `open` (the park, hello), `pitchers` (pregame analysis and the two starters), `lineup_away`, `lineup_home` (fielders take the field), `officials` (umpire crew, managers), `playball` (hand-over to the first pitch). |
| `t` | yes | Seconds from the start of the segment. Ordered inside a segment. Estimates until the audio exists; the real length of a segment follows its lines. |
| `speaker`, `text`, `emotion`, `audio` | | As in `lines`. |

Only what is known before the game may be said: ratings, age, handedness, numbers, batting
order, staff and crew (`league/staff.js`, `crewFor(seed)`), character lines. Nothing about the
result. Leave the first seconds of `open` free for the music bed.

## Voice

`tools/make-sheet.mjs <script>` writes `<name>.tts.json`, the input of `tools/synth.mjs`: one row
per distinct line (pregame first, then the game), whole sentences, `fan` voiced by the guest's
fixed voice, `tone` from `emotion`, and `id` = voice + hash of tone and text (same words, same
file; new words, new file). Rerun it after every edit of the script.

`tools/synth.mjs --in <name>.tts.json --out audio/<name>` makes the missing rows only. Every clip
must say its line and nothing more: the transcript is compared after dropping punctuation and
spaces and writing numbers one way (「五十九」 = 「59」, 「一比零」 = 「1比0」); a clip that adds or
loses a word is made again (three tries), then dropped, and the run exits 1 with the failed ids.
The persona in `voices.json` says how a voice sounds, never what it says. Without `OPENAI_API_KEY`
the request has no `Authorization` header (cloud: the proxy adds it from the environment's network
secret); `--ping` checks access for free. Needs `ffmpeg` (or env `FFMPEG`).

**Delivery context (#108).** So that lines sound like one conversation, not each starting from
zero, every sheet row carries `ctx`, which `synth.mjs` puts before the line as context for the
voice only (the clip must still say only its line). Context never changes the audio id, which
stays role + tone + text, so a clip stays reusable:
- A row that is reused in other games gets `"ctx": "neutral"`, one fixed text that fits anywhere:
  rows that name nobody and carry no count or score of this game (generic calls, colour and fan
  lines), and per-player introductions (game lines tagged `lineup` / `batter_up`, `pbp` lines of
  the pregame `lineup_*` segments).
- A row that belongs to this game only gets its real neighbours: `moment` (`pregame`, `big` when a
  line of that event is excited or thrilled, `tense` when the tension index is at least
  `TENSE_FROM` or a line is tense, else `routine`) and `prev`, the two lines said just before it in
  the same moment (same event, or same pregame segment), as `[speaker name, text]`.

The context is part of the manifest hash, so a clip made with other context shows as `STALE`
(made again only with `--redo`). `--show <ids>` prints the exact request of some rows for free.
Quality: the API returns WAV, loudness is set on it and the mp3 is encoded once, 24 kHz mono (the
model's own rate) at LAME VBR quality 0, about 90 kbit/s: a whole game is about 18 MB, loaded clip
by clip.

After synthesis, `tools/wire-audio.mjs <script>` fills `audio` and `dur` of every line (pregame
too) from the files in `audio/<name>/` by sheet id, and removes them when the file is gone, so the
viewer never asks for a missing mp3. It refuses a clip whose manifest transcript does not say
its line (or that has no manifest entry). `--check` fails when the script and the folder disagree;
`--report` prints how the first 25 game lines are timed by their clip lengths. Rerun it after
synth.mjs and after every edit of the script (`node commentary/audio.check.mjs` checks it).

A recorded game is timed by the clips (`planRecorded` in `player.js`): two lines never overlap; an
answer (a line on the same event as the line before it) follows after a short constant pause; a
line that cannot be over by the next play-by-play call (a `pbp` line of a later event that is not
an `aside`) is dropped, not played late (it may hold that call back by 1 s at most); a priority-2 call is said on its moment and cuts what is
still playing. Asides (lineup intros) may come late but never hold another line back.

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
- People slots (`league/staff.js`): `{manager}` `{pitchingCoach}` of the team in `{team}` (on a
  pitching change, the team making it) and `{homeManager}`, said on air as surname + 教練
  (「廖教練」); `{plateUmp}` (full name, crew from `crewFor(seed)`). Character lines:
  `{managerName}` + `{managerLine}`, `{plateUmp}` + `{plateUmpLine}`: only in `once` lines with a
  narrow `when`, so they come up now and then, never as a gag. `validateBank()` rejects any slot
  the player does not fill (`SLOTS` in `player.js`); exchanges also need them in `KNOWN_SLOTS`
  of `tests/replay/commentary.mjs` (tests owner).
- **Sometimes nobody talks.** Every trigger has a `silence` probability, and after the booth
  has spoken, routine triggers stay quiet for `rules.minGapSec` seconds. Silence is part of the
  broadcast; do not tune it to zero.
- An exchange is not reused within the last `rules.noRepeatWindow` exchanges.
- `alt` (optional): other wordings of the `response`, with the same slots. Each time the exchange
  is said in a game, the next wording is used (`response`, then `alt` in order), so one idea does
  not come back word for word. Keep each wording generic (no names, no scores) so its audio can be
  reused in any game.
- **Running gags** (see `personas/`): `gag` names the gag a line belongs to, `sets` lists flags
  the line raises when spoken, `needs` lists flags that must already be raised, and `once: true`
  means the line is spoken at most once per game. The first gag line spoken picks the game's gag;
  lines of other gags are skipped for the rest of the game, so a payoff always has its setup.
  A line with `needs` is preferred over a `when` line, which is preferred over a generic one.
  `validateBank(bank)` from `player.js` checks that every `needs` flag is set by the same gag.
- **The fan guest.** `guests.<teamId>` is the fan of that team (`name`, `nick` = the `{guest}`
  slot, `cast` = his voice). `fan` is a list of fan moments: `on` (triggers; only moments after
  the play is over, see `FAN_TRIGGERS` in `player.js`), `side` (`up` = the home team just
  gained, `down` = it just lost, `any`), optional `guest` (one fan's own line), `when`, `once`,
  and `lines`: `[speaker, text]` pairs, at least one by `fan`. After the two professionals have
  spoken, the guest takes the moment with probability `rules.fanChance`; a moment is not
  reused within `rules.fanNoRepeatWindow` and at most `rules.fanMaxUses` times a game (default
  2); his own lines get `rules.fanOwnShare` of his moments; after him routine calls wait
  `rules.fanGapSec` longer. He draws from his own random stream, so his picks never shift the
  other two's picks.
