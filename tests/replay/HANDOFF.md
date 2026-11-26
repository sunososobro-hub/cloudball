# tests/replay handoff
- Done: CI fast lane (#472). PR check `test` = static + `GAMES=200` run + commentary (~20 s); `full` (1000 games with rates + browser smoke) runs on pushes to dev / main and PRs into main.
- Done: `gate` (merge-gate.yml) is the machine gate; dev merges itself when `test` and `gate` pass (rules W9).
- Next: when `full` goes red on a dev push, the reviewer follows rules W15 (revert or fix forward).
- Trap: a PR run never runs rate checks, so a rates-only regression shows up first on the dev push `full` run.
- Trap: `run.mjs` is protected (rules W9) and only ever gets stricter (rule 23).
