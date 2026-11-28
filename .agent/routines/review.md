# Reviewer routine (Opus, hourly): watch auto-merge, review protected paths, revert, sweep orphans, triage

Read after `common.md`. Writes no product code except a merge of `dev` into a PR branch and a revert (E). Order: E, A, S, B, C, D.
First read the level: `gh api repos/$R/issues/275 --jq .body | head -1`. Level 0 -> only E, A and S, skip B and C.
Merging is automatic (rules W9): the dev ruleset merges a PR once the check runs `test` and `gate` pass
(`gate` = the `merge-gate.yml` job; the `merge-gate` commit status it also posts is not required). You keep PRs moving.

## A. Pull requests (every open PR, oldest first)
- List: `gh api "repos/$R/pulls?state=open&per_page=100"`. Base `main` or a release PR -> never touch.
- Outside PR (head repo is a fork, or `user.login` is not `sunososobro-hub`): rules W9 (outside PRs). Label `needs-owner` once,
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
  `merge-gate.yml` matches it) and the reason on the next line. A comment-triggered run attaches its `gate` check to
  the `main` sha, so the head's `gate` stays red: re-run it on the head (common.md `gate re-run`), then turn auto-merge on
  (common.md); it merges once that run is green. Not sound -> `Opus review: CHANGES <sha>`, the fix on
  the next line, and requeue. Pre-season (`PRESEASON = true` in `merge-gate.yml`): (c) is suspended for `engine/` only. A PR
  touching `.agent/`, `.github/` or `tests/replay/run.mjs` always needs the PASS. Trap: comment-triggered `merge-gate`
  runs use the `main` copy (they only update the `merge-gate` status, never the head's `gate`), which passes every protected path pre-season until the next release; so such a PR must not
  have auto-merge on before your PASS (found on without one -> turn it off). A PASS on an older head counts only when nothing under
  those paths changed since.
- Hard stops (rules W9): linked issue `needs-owner` / `status:frozen`, an open `needs owner` / `blocking` comment. When
  you post `needs owner` / `blocking`, turn auto-merge off in the same step.
- No protected path (or `engine/` only), `test` green, `clean`, auto-merge off (the worker missed it): turn it on.
  Never merge by hand, except when turning auto-merge on answers that the PR is already `clean` (common.md).
- Owner question: a PR body that starts with `請 so 哥看` or `owner:` -> once per PR (search open `needs-owner` issues
  for `PR #N` first) open an issue `[owner] <question in plain Traditional Chinese>`, body `From PR #N.` + the question
  and a recommendation, label `needs-owner`; comment `owner question: #<issue>` on the PR. The PR still merges when ready.
- Requeue: issue `status:review` -> `status:todo`, comment `requeue: <red test | conflict | CHANGES> PR #N`. After the
  third requeue of the same PR add `model:opus`.

## S. Merged sweep (rules W10: dev is not the default branch, so GitHub closes nothing)
- `gh api "repos/$R/pulls?state=closed&base=dev&sort=updated&direction=desc&per_page=100"`, keep `merged_at` in the
  last 3 h. For each linked issue still open: `Closes` -> remove `status:review`, comment `merged into dev, PR #N`,
  close. `Refs` -> `status:todo`, comment what is left; if it got closed anyway (a `fix/closes #N` in a title or
  commit), reopen and comment `reopened: part PR #N only`. Copy any 「沒驗到」 / owner-look list from the PR top into
  that comment. PRs with head `fix/817-s*` are stamp PRs (F): skip them, never reopen or requeue #817 for them. An issue already closed with a `merged into dev` comment, or a `Refs` one already in `status:todo` with
  a later comment: done, skip.

## E. dev red (rules W15)
- `gh api "repos/$R/commits?sha=dev&per_page=20" --jq '.[].sha'`; for each, `full` from
  `gh api repos/$R/commits/<sha>/check-runs --jq '.check_runs[]|select(.name=="full")|.conclusion'`. The newest
  finished `full` is `success` -> nothing to do. Running -> skip E this run.
- Red: find the oldest red merge whose first parent's `full` is `success`. The failed step:
  `gh api repos/$R/actions/jobs/<check run id>/logs | tail -80`.
  - Playability (browser smoke, or a `run.mjs` rule / determinism check): claim the next free `fix/N-rK` of that PR's
    issue on the dev tip, `git revert -m 1 --no-edit <merge sha>`, the three checks, push, open PR `revert PR #P (#N):
    <failed step>` with `Refs #N` and the `cb-usage:` line (window=reviewer); auto-merge on (protected path: review the
    revert yourself, PASS, then on). Requeue the issue (reopen it if closed): `status:todo`, comment `requeue: reverted PR #P, full red: <step>`.
  - Rates only (league-rate tolerance): open `[P1] dev full: <rate> out of band since PR #P`, `area:engine`, `P1`,
    `status:todo`, body with the numbers from the log. No revert.
  - No single merge to blame (every parent red, flaky step) or the dev tip red > 2 h: open (once; search first)
    `[P0] dev red: <step>`, `P0`, `status:todo`. Workers take P0 first.

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

## F. Deploy stamp (#817; last step of every run, after D's owner-queue read)
- `STAMP_MIN_HOURS = 2`. Cloudflare builds dev only when `.deploy-stamp` changes. If the last commit touching it on dev is older than STAMP_MIN_HOURS
  (`gh api "repos/$R/commits?sha=dev&path=.deploy-stamp&per_page=1" --jq '.[0].commit.committer.date'`) and dev has newer commits: claim `fix/817-s<UTC yyyymmddHHMM>` (unique per run, e.g. `fix/817-s202611280907`; `claim_branch.sh`),
  write `<UTC time> <dev sha>` as the only line of `.deploy-stamp`, open a stamp-only PR (`Refs #817`, `cb-usage` line), auto-merge on (not a protected path). Delete the stamp branch after it merges.

## D. Report
- One line on GitHub only where you acted (PR or issue comments above). Chat: `搞定` or `卡住：<reason>`.
- Owner queue first: `O=$(gh api -X GET search/issues -f q="repo:$R is:issue is:open label:needs-owner" -f per_page=1 --jq .total_count)`.
  O > 0 -> the chat line is exactly `卡住：O 張等你決定` (with the number), whatever else happened.
