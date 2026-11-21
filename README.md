# cloudball (雲端職棒™, Cloud Pro Baseball™)

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
| `league/` | Factory settings: teams and players (data format and stats CC0; names and identities reserved). |
| `render/` | 3D: field, players, animation, cameras. |
| `ui/` | Scorebug/HUD, landscape mode, voting. |
| `commentary/` | The two commentators: personas, script format, fallback lines. |
| `assets/` | Third-party CC0 models and textures (sources listed); owner-original art will be CC BY 4.0; logos reserved. |
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
- `assets/`: third-party CC0 assets (ambientCG textures, MakeHuman-derived player mesh) stay
  CC0 1.0 with sources in `assets/SOURCES.md` (`assets/LICENSE`). The owner's own original 3D
  models, textures and art, from 2026-11-21, are CC BY 4.0, attributed as "cloudball
  (https://github.com/sunososobro-hub/cloudball)". None exists in `assets/` yet; the team logos
  are reserved, see below.
- `league/`: the data format and numeric/stat structure are CC0 1.0 (`league/LICENSE`). Player
  names and identities/personas are not licensed, like team names; public forks must replace them.
- **Reserved (not licensed): names, logos, mascots and characters** (league, teams, players,
  commentators, fans). Public forks must replace them; see [TRADEMARKS.md](TRADEMARKS.md).
- Versions already published under CC0 before this change remain CC0 for those versions (a CC0
  grant cannot be revoked). The terms above apply from 2026-11-21.
- Commentary audio (`commentary/audio/`): CC BY 4.0 (`commentary/audio/LICENSE`). Attribute as
  "Voices from cloudball (https://github.com/sunososobro-hub/cloudball). AI-generated with
  OpenAI gpt-audio-1.5, not human recordings." The voices are AI-generated (OpenAI
  gpt-audio-1.5). The site must show an "AI 語音" label wherever this audio plays (OpenAI usage
  policy disclosure).
