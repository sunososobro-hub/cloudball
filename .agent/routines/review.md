# Reviewer routine (Opus, hourly): merge, review protected paths, sweep orphans, triage

Read after `common.md`. Writes no product code except a merge of `dev` into a PR branch (rules W9 b). Order: A, B, C, D.
First read the level: `gh api repos/$R/issues/275 --jq .body | head -1`. Level 0 -> only A (merge green PRs), skip B and C.

## A. Pull requests (every open PR, oldest first)
- List: `gh api "repos/$R/pulls?state=open&per_page=100"`. Base `main` or a release PR -> never touch.
- Outside PR (head repo is a fork, or `user.login` is not `sunososobro-hub`): rules W9 d. Label `needs-owner` once,
  comment once `outside PR: left for the owner`, then never again. Do not review, push, merge or close it.
- Paperwork only (missing `Closes/Refs`, head `fix/N` names the issue, missing `cb-usage` line): fix the body yourself
  (`gh api -X PATCH repos/$R/pulls/N -f body=...`) and go on. Head not `fix/N*` / `feat/N`: still mergeable when the
  body links an issue; otherwise comment and skip.
- (a) CI once: `gh api repos/$R/commits/<head sha>/check-runs --jq '.check_runs[]|select(.name=="test")|.conclusion'`.
  Empty or null (running) -> skip this PR this run. `failure` -> requeue (below).
- (b) `gh api repos/$R/pulls/N --jq .mergeable_state`: `clean` go on; `unknown` skip; `dirty` -> merge `origin/dev`
  into the PR branch, resolve keeping both sides, run the three checks, push (then skip: CI reruns). If that would change
  more than ~50 lines or another PR's behaviour, requeue instead.
- (c) Files: `gh api "repos/$R/pulls/N/files?per_page=100" --jq '.[].filename'`. Any under `engine/`, `.agent/`,
  `.github/`, or `tests/replay/run.mjs`: read the whole diff against rules 9-24 (determinism, no `Math.random`/`Date`
  in `engine/`, named constants, `run.mjs` never loosened, two workflow files at most, no new network call, no secret).
  Sound -> comment whose first line is exactly `Opus review: PASS <full 40-char head sha>` (the sha ends the line, as
  `merge-gate.yml` matches it) and the reason on the next line. Not sound -> `Opus review: CHANGES <sha>`, the fix on
  the next line, and requeue. Pre-season (`PRESEASON = true` in `merge-gate.yml`): (c) is suspended for `engine/` only. A PR
  touching `.agent/`, `.github/` or `tests/replay/run.mjs` always needs the PASS, whatever `PRESEASON` says (the
  `merge-gate` status may show green; this routine is the gate). A PASS on an older head counts only when nothing under
  those paths changed since.
- Hard stops (rules W9): linked issue `needs-owner` / `status:frozen`, an open `needs owner` / `blocking` comment.
- Merge: `gh api -X PUT repos/$R/pulls/N/merge -f merge_method=merge -f sha=<head sha>`. Then the issue (rules W10):
  `Closes` -> remove `status:review`, comment `merged into dev, PR #N`, close. `Refs` -> back to `status:todo`, comment
  what is left; then `gh api repos/$R/issues/<N> --jq .state`: `closed` (a `fix/closes #N` in a title or commit) ->
  `gh api -X PATCH repos/$R/issues/<N> -f state=open` and comment `reopened: part PR #N only`. Copy any 「沒驗到」 / owner-look list from the PR top into that comment.
- Owner question: a PR body that starts with `請 so 哥看` or `owner:` -> once per PR (search open `needs-owner` issues
  for `PR #N` first) open an issue `[owner] <question in plain Traditional Chinese>`, body `From PR #N.` + the question
  and a recommendation, label `needs-owner`; comment `owner question: #<issue>` on the PR. The PR still merges when ready.
- Requeue: issue `status:review` -> `status:todo`, comment `requeue: <red test | conflict | CHANGES> PR #N`. After the
  third requeue of the same PR add `model:opus`.

## B. Orphan sweep (rules W13)
- Issues with `status:doing`: no open PR and the `fix/N*` branch tip (`git ls-remote origin 'refs/heads/fix/N*'`, then
  `gh api repos/$R/commits/<sha> --jq .commit.committer.date`) older than 60 min -> `status:todo`, comment `orphan claim
  released`; if that branch holds only its claim commit (`claim #N …` message, parent on dev), delete it.
- `claim/*` branches older than 60 min: delete.

## C. Triage (up to 10 issues per run, lowest number first)
- Issues with no `status:*` label and no `needs-owner`. Read body and all comments; owner comments win. Pick one:
  - issue opened by anyone but `sunososobro-hub` -> `needs-owner` only (never close or ready it);
  - already done on `dev` (a merged PR, the Acceptance holds) -> comment the evidence, close;
  - owner put it on hold, or it is meta / direction / a running list -> `status:frozen`;
  - waits on an owner choice of direction or taste -> `needs-owner` + one-line question with a recommendation;
  - otherwise -> one `area:*` (the folder it mostly touches), a `P0`-`P3`, `model:opus` when it is engine logic,
    concurrency or motion / rig work, and `status:todo`. Add a one-line `Acceptance:` comment when the issue has none.

## D. Report
- One line on GitHub only where you acted (PR or issue comments above). Chat: `搞定` or `卡住：<reason>`.
- Owner queue first: `O=$(gh api -X GET search/issues -f q="repo:$R is:issue is:open label:needs-owner" -f per_page=1 --jq .total_count)`.
  O > 0 -> the chat line is exactly `卡住：O 張等你決定` (with the number), whatever else happened.
