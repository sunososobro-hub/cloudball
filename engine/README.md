# engine

Pure game logic. Runs under plain Node. Must never import `render/`, `ui/`, `commentary/`, three.js or touch the DOM.

- `sim/sim.js`: deterministic game simulation, `simGame(seed, decisions, opts)`.
- `sim/season.js`: season runner (`node engine/sim/season.js N`).
- `rules/`: rule decisions (outs and their legal reasons).
- `stats/`: box score and aggregate statistics.
