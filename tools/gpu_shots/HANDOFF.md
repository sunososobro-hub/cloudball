# tools/gpu_shots (#444)
Done: `lib.mjs` (pure: `scrub()` / `leaks()`, dev-tip owner-merge + green `test` gate, retention 7, 20 MB cap, manifest
shape, strict request schema `shots` / `probe` / `ping`, `requestRunnable()`, local-server `safeFile()`, `allowedUrl()`,
`appPathFromReg()`, `runStamp()`, `captureDue()`); `shots.mjs` (the PC run: Chrome over DevTools with Node's WebSocket,
fresh temp profile, 127.0.0.1 server, hourly frames + `gpu/latest/`, requests -> `results/<id>/`, push over the deploy
key); `README.md` (Traditional Chinese, owner setup + agent how-to). `node tests/gpu_shots.check.mjs` (static.mjs runs it).
Next: the owner's first real run; tune the act steps (tag scrub 70 %, settle times) from what the frames show.
Traps: every text that leaves the PC goes through `scrub()` with the user name, host name and home path in ctx;
`scrub()` runs the fixed patterns before the ctx values. No regex with nested quantifiers (the check times it).
The browser part is never run in CI (no GPU): the check only proves `shots.mjs` parses. Never add a workflow (rule 19).
