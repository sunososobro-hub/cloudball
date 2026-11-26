# tools/gpu_shots (#444)
Done (part 1): `lib.mjs`, the pure part: `scrub()` / `leaks()`, the dev-tip owner-merge + green `test` gate, run-folder
retention (7) and the 20 MB cap, the manifest shape, the strict request schema (`shots` / `probe` / `ping`) and
`requestRunnable()` (owner-authored on cloudball-shots main, no foreign open PR on `requests/`, once per id, 24 h).
Checked by `node tests/gpu_shots.check.mjs` (static.mjs runs it).
Next: `shots.mjs` on the PC (Chrome from registry App Paths, fresh temp profile, WebGPU flags, 127.0.0.1 static server
for this repo only, frames of play.html ?q=max / agent.html / baseball9.html, manifest, push to cloudball-shots gpu/
over the SSH deploy key, poll requests/ every 15 min); README.md in Traditional Chinese (setup PowerShell, deploy key,
Task Scheduler, Windows Sandbox / separate user, how an agent writes a request and reads results/<id>/).
Traps: every text that leaves the PC goes through `scrub()` with os.userInfo().username and os.hostname() in ctx;
`scrub()` runs the fixed patterns before the ctx values (an e-mail with the user name must still go). No regex with
nested quantifiers (long paths must not backtrack; the check times it). The browser part is never run in CI (no GPU).
