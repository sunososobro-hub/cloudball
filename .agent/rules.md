# cloudball agent rules (hard cap: 50 lines; edit, never append past the cap)

## Branches and merging
1. Work on `fix/N` or `feat/N` (N = issue number). Every PR targets `dev`.
2. `main` only receives `release/vX.Y.Z` PRs. Never push to `main` or `dev` directly.
3. Protected paths: `engine/`, `.agent/`, `.github/`. A PR touching them needs a PR comment
   `Opus review: PASS <full head sha>` from the repo owner account before merge. Pre-season
   (`PRESEASON` in `merge-gate.yml`): suspended by the owner; back on opening day.
4. Everything else merges as soon as the `test` check is green.
5. Never wait or poll for CI inside a session. Check once, then hand back.

## Area lock
6. One top-level folder = one agent at a time. Claim the folder in the issue before starting.
7. Stay inside your folder. Need a change elsewhere? Open an issue for that folder's agent.
   Keep `<folder>/HANDOFF.md` (max 20 lines: done, next, known traps); update it before you stop.
8. Root files (`index.html`, `README.md`, `LICENSE`, `CLAUDE.md`) count as the `ui/` area.

## Architecture
9. Dependency direction: `render/`, `ui/`, `commentary/` may import `engine/` and `league/`.
   `engine/` must never import them, and must never touch DOM, three.js or the network.
10. Only the engine computes game outcomes. Nothing else (AI, commentary, UI, votes outside
    the engine's decision inputs, renderer timing) may alter results or stats.
11. Determinism: same seed + same engine commit + same decisions = same game, byte for byte.
    All randomness goes through the engine's seeded RNG. No `Math.random`/`Date` in `engine/`.
12. The renderer is a consumer of the engine event stream. If the picture and the event
    disagree, the event is right and the renderer has the bug.
13. Baseball rules are real: an out exists only with a legal reason recorded by the engine
    (force = fielder holding the ball touching the base; tag = the tag; fly = the catch).
14. No magic numbers in `engine/`: use named constants.
15. Commentary is written after the game is simulated and can only read past events.

## Assets, cost, licensing
16. Assets must be CC0 or code-generated. No Mixamo, no unlicensed or "free for personal
    use" files. Record the source of every third-party file in `assets/SOURCES.md`.
17. No paid API calls anywhere at runtime (no LLM, no paid TTS in the viewer path).
18. Code is MIT; `assets/` and `league/` are CC0. League name, team names and logos are not
    licensed: forks are parallel universes and must not present themselves as the original.

## Workflow files
19. `.github/workflows/` holds at most two files, ever: `ci.yml` and `merge-gate.yml`.
20. No deploy workflow. Deployment is Cloudflare Pages Git integration.

## Style
21. All repo text is English (code, comments, docs, commits). Chinese only as game content
    (team names, player names, commentary lines, on-screen copy).
22. No build step: plain static files that run from any static server.
23. Run the three `node tests/replay/*.mjs` checks before every push; put the
    `run.mjs` numbers in the PR body.
24. Official game records live in `cloudball-league` (append-only). Pre-season games are
    never written there.
