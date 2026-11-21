# tests/replay

Headless checks, plain Node, no browser and no dependencies. CI runs all three.

- `run.mjs`: simulates 1000 full games and fails on any out without a legal reason, any half inning without exactly 3 outs (walk-offs excepted), a broken batting order, a score that differs from the runs recorded, a game that does not terminate or end legally, or a seed that does not replay identically. It re-derives each out from the fielder actions in the event stream instead of trusting the engine, and it checks that `engine/` stays pure. Prints league-wide rates for tuning. `GAMES=200 SEED=5000 node tests/replay/run.mjs` changes the sample.
- `commentary.mjs`: the fallback bank is well formed, drafts are deterministic, a line never depends on later events, commentary never changes the game, registered scripts match their game. It also runs `commentary/tension.check.mjs` (tension index: range, determinism, causality, bases vs engine frames, ordering of known situations) as a child process, so CI covers it.
- `static.mjs`: every file the page and its modules refer to exists, every script parses, the workflow folder and the rule files keep their limits. It also runs `tests/names.check.mjs` (league name rules: no real-athlete full name from `league/tools/blocklist.txt`, no repeated full name, a given name at most twice in the league and never twice on a team) as a child process.
