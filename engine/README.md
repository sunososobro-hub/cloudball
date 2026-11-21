# engine

Pure game logic. Runs under plain Node with no DOM and no three.js, and must never import
`render/`, `ui/` or `commentary/`. Only the engine decides what happens in a game.

```js
import { simGame } from './engine/index.js';
const game = simGame(seed, decisions, opts);   // same inputs + same commit = same game
```

- `seed`: unsigned 32-bit integer.
- `decisions`: `{ [decisionId]: choice }`, the resolved fan votes (`P0: 'stay'`, `I1: 'ibb'`...).
  A decision without an entry uses the coach's own pick and is marked `pending`.
- `opts`: `{ teams: [awayIndex, homeIndex], rosters, starters, pen }`. Rosters default to the
  factory settings in `league/`.

## What is where

| Path | Contents |
| --- | --- |
| `constants.js` | Every tunable number, named. Change behaviour here, not inline. |
| `rng.js` | The seeded RNG. All randomness goes through it. |
| `rules/outs.js` | The only place an out can be created. Each constructor checks its rule and throws on missing evidence. |
| `rules/fielding.js` | Turns a batted ball or a steal into a defensive play: who fields, who covers, every throw and when it arrives. Decides out or safe from travel times. |
| `rules/field.js` | Field geometry, defensive alignment, running and throwing kinematics. |
| `sim/game.js` | The game loop: pitch by pitch, inning by inning. |
| `sim/copy.js` | On-screen text that goes with each frame (game content). |
| `sim/season.js` | Season runner, a development tool: `node engine/sim/season.js 3`. |
| `stats/box.js` | Box score and league rates rebuilt from the event stream alone. |

## Why an out is always legal

The simulation only proposes what the defence tries (go for two, go for the lead runner on a
bunt, throw out a base stealer). `rules/fielding.js` then works out where the fielders are and
how long everything takes. An out is recorded only through `rules/outs.js`:

- **force**: the fielder holds the ball **and** is on the base before the forced runner arrives;
- **tag**: the fielder has the ball in his glove at the base before the runner arrives;
- **fly catch**: the fielder is under the ball when it comes down;
- **strikeout**: three strikes.

If the ball cannot be there in time the runner is safe: a double-play try becomes a fielder's
choice, a slow roller becomes an infield hit. A throw is never released to a base before the
receiver is standing on it. The out's time is the moment the ball is held on the base, never
earlier.

## Output

`game.ev` is the list of broadcast frames the viewer plays back (one per pitch, half-inning
break, pitching change, fan decision). A pitch frame carries the result (`r`), the batted ball
(`play`), the defensive plan (`plan`), the outs with their evidence (`outs`), each runner's
start/slide/arrival (`moves[n][3]`) and the game state before and after (`s0`, `s1`).

`game.stream` is the flat event stream. Every event has `i` (its index), `f` (the frame it
belongs to), `t` (seconds on the broadcast timeline) and `type`:

| `type` | Main fields |
| --- | --- |
| `game_start` | `seed`, `engine`, `teams`, `lineups`, `starters` |
| `half_start` / `half_end` | `inning`, `half`, `team`; on end also `runs`, `outs`, `score` |
| `runner_placed` | extra-inning runner: `runner`, `base` |
| `decision` | `id`, `team`, `kind`, `pick`, `pending` |
| `substitution` | `team`, `role`, `out`, `in` |
| `pitch` | `pitcher`, `batter`, `lineup`, `pitchType`, `kmh`, `inZone`, `count`, `n` |
| `swing` | `batter` |
| `call` | `call`: `ball`, `called_strike`, `swinging_strike`, `foul`, `hit_by_pitch`; `count` after it |
| `contact` | `ball` (`GB`/`LD`/`FB`/`PU`), `bunt`, `spray`, `dist`, `hang`, `land`, `fielder` |
| `fielder_action` | `action`: `field`, `catch`, `throw`, `cover`, `receive`, `touch`, `tag`; `fielder`, `base`, `to` |
| `out` | `reason` (`force`, `tag`, `fly_catch`, `strikeout_swinging`, `strikeout_looking`), `runner`, `base`, `fielder`, `ballAt`, `touchAt`/`fielderAt`, `runnerAt`, `outs` |
| `runner_advance` | `runner`, `from`, `to`, `how` (`batted`, `walk`, `steal`) |
| `run_scored` | `runner`, `team`, `runs` (team total) |
| `intentional_walk` | `batter`, `pitcher` |
| `pa_end` | `batter`, `lineup`, `pitcher`, `result`, `rbi` |
| `game_end` | `score`, `innings`, `winner`, `walkoff` |

Commentary scripts and the test suite bind to stream indices. Adding a field is fine; changing
the order or meaning of events changes every game and needs an engine version bump.

## Determinism

Same seed + same decisions + same rosters + same engine commit = the same stream, byte for
byte. Outcome draws and cosmetic draws (pitch type, speed, who slides at home) use separate
seeded RNGs, so looks can change without changing results. The engine never reads the clock
or `Math.random`.

Known limit: geometry uses `Math.sin`/`Math.cos`, whose last bit is not guaranteed to be equal
across JavaScript engines. Node and Chromium (both V8) agree; official games are computed once
under Node and recorded with their seed and engine commit in `cloudball-league`.

## Tuning

`node tests/replay/run.mjs` prints league-wide rates (runs/game, K%, BB%, AVG, OBP, SLG, BABIP,
HR/game). Tune the constants against real baseball, bump `ENGINE_VERSION`, put the new numbers
in the pull request.
