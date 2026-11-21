# cloudball (雲端職棒, Cloud Pro Baseball)

A baseball league that only exists in the browser. Games are simulated by a deterministic
engine and shown as a 3D night-game broadcast: stadium, players, scorebug, two commentators,
fan votes on a few manager decisions.

Only the engine decides what happens. The 3D view, the commentary and the UI replay the
engine's event stream; none of them can change a result or a statistic. No AI or other paid
service is called while you watch.

## Status: pre-season (warm-up)

The league has not started. What you see now are **pre-season games**: each one is computed
ahead of time and then shown to everybody at the same moment, like a video premiere. Results
do **not** count and are **not** written to the league ledger. Rules, players and visuals are
still being tuned.

## Run locally

No build step. Serve the folder with any static server and open it:

```sh
python3 -m http.server 8080      # then open http://localhost:8080
```

Opening `index.html` straight from disk does not work (textures and modules need http).
The page loads three.js from a CDN, so it needs internet. WebGPU is used when available;
the settings panel has a compatibility (WebGL) switch.

Headless checks (plain Node, no browser, no dependencies):

```sh
node tests/replay/run.mjs          # 1000 full games: rules, outs, scores, determinism + league rates
node tests/replay/commentary.mjs   # commentary bank and scripts
node tests/replay/static.mjs       # no missing files, scripts parse
```

Deployment is Cloudflare Pages connected to this repository (no build command, output
directory `/`). There is no deploy workflow.

## Layout

| Path | What lives there |
| --- | --- |
| `engine/` | Pure game logic: `rules/`, `sim/`, `stats/`. No DOM, no three.js. |
| `league/` | Factory settings: teams and players (data, CC0). |
| `render/` | 3D: field, players, animation, cameras. |
| `ui/` | Scorebug/HUD, landscape mode, voting. |
| `commentary/` | The two commentators: personas, script format, fallback lines. |
| `assets/` | CC0 models and textures only. |
| `tests/replay/` | Headless whole-game checks. |
| `.agent/rules.md` | The rules every contributor (human or agent) follows. |

## Two lanes

- **`dev` is the fast lane.** Every PR targets `dev` and merges when tests are green
  (changes to `engine/`, `.agent/`, `.github/` also need a review pass).
- **`main` is the quality lane.** It only moves through `release/vX.Y.Z` PRs.

## The league ledger

Official game records live in a separate, append-only repository:
[cloudball-league](https://github.com/sunososobro-hub/cloudball-league). A player's current
ability is the factory settings in `league/` plus everything recorded in that ledger, and
nothing else. Pre-season games are never written there.

## Licenses, and what they do not cover

- Code: MIT (`LICENSE`).
- `assets/` and `league/` data: CC0 1.0 (`assets/LICENSE`, `league/LICENSE`).
- **Not covered by either license: the league name (雲端職棒 / Cloud Pro Baseball), the team
  names, and the team logos and mascots.** You are welcome to fork the engine and the data
  and run your own league: that is a *parallel universe*. You may not present a fork as the
  original league or its teams. Give your universe its own names and marks.

## Anonymous viewing counts

The site counts how people watch, without knowing who they are: a random id made for each page load (never stored in a cookie or in the browser), the milestone reached (entered, sound on, inning, game end, fast-forward, leaving), the game seed, and the seconds watched. No IP address, user agent or account is stored by us. Code: `ui/stats.js`, `functions/api/v.js`, `ui/stats-report.mjs`.
