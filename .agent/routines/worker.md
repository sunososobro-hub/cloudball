# Worker routine: slots A, B (Sonnet) and C (Opus)

Read after `common.md`. One worker kind for every area: render, ui, engine, league, commentary, assets, tests.

## Pick
- Level and focus: `gh api repos/$R/issues/275 --jq .body | head -2` (rules W1). Level 0 -> end. Level 1 and not slot A -> end.
- Candidates: `gh api -X GET search/issues -f q="repo:$R is:issue is:open author:sunososobro-hub label:status:todo -label:needs-owner -label:needs-opus -label:status:frozen -label:status:blocked" -f per_page=100`.
  Sonnet slots drop `model:opus` items; slot C takes `model:opus` first, then the rest. Order per rules W3 (P, focus, number).
- Skip an item with an open PR whose body says `Closes/Refs #N`, unless its last comment is a `requeue:` (fix round, below).
- How many: 1 (level 3: up to 3, one after another). Nothing left -> `搞定`, post nothing.

## Claim
- Clone / fetch and set the identity (common.md). `git fetch origin dev && D=$(git rev-parse origin/dev)`.
- `B=fix/N` (exists from a closed PR -> `fix/N-r2` .. `-r5`). `bash scripts/claim_branch.sh $B $D N <session>`;
  exit 1 -> next item; exit 3 -> `卡住`. Then remove `status:todo`, add `status:doing`, comment `doing (<slot>)`.
- Fix round on an open PR: `git fetch origin pull/<PR>/head`, claim `claim/N-<head sha7>` on that head, check out
  the PR branch (not the claim branch), fix what the newest `requeue:` / `Opus review: CHANGES` names, push to the PR branch.

## Work
1. `git checkout -B $B origin/$B`. Read the issue and ALL comments; later owner comments win, "don't" wins.
   Read the `HANDOFF.md` of the folders you touch.
2. Find the cause by reading code, fix it, add or extend a check under `tests/` when the change has behaviour a check
   can see. A check runs the code; grepping source is not a check. Changed constants need their data source in the PR.
3. Budget: at 25 minutes, or when it clearly will not fit, stop adding. Make what you have pass and ship it as a part
   (`Refs #N`, first PR line `半張：做完 …／還沒做 …`, the rest as one comment on the issue).
4. Just before the last check run: `git fetch origin dev && git merge --no-edit origin/dev`, resolve conflicts keeping
   both sides (rules W6). Then the three checks (common.md); all must pass.
5. Hard stops (rules W12) -> `needs-owner` + one-line question with your recommendation, `status:blocked`, no PR.

## Open the PR
- `git push origin HEAD:refs/heads/$B`; PR base `dev`, head `$B`, title `fix #N: …`.
- Body: 1-3 lines of what changed; `run.mjs` numbers; for picture changes the URL to open (`?prop=…`, `?q=max`);
  anything the owner must look at, in plain Traditional Chinese at the top; `Closes #N` or `Refs #N`;
  last line `cb-usage: window=<worker A|B|C> model=<sonnet|opus> minutes=<claim to PR>`.
- Issue: `status:doing` -> `status:review`. End the run (never wait for CI or the merge). Fix round: PR comment
  whose last line is the `cb-usage:` line, issue back to `status:review`.

## Side findings (max 2 per run, search duplicates first)
- Title `[bug]` / `[feat]` / `[test]` + a short English line; body `Found while fixing #N.`, `Goal:`, `Acceptance:`,
  `Verify:`; labels one `area:*`, `P2` or `P3`, and `status:todo` only for a bug with evidence. Ideas get no status.
