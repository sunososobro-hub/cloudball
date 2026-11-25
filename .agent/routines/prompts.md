# Scheduled prompt templates (paste as-is; the procedure lives in this folder, never in the prompt)

Suggested schedule (Asia/Taipei, hourly, each a fresh session, repo sunososobro-hub/cloudball):
| Task name | Minute | Model |
| --- | --- | --- |
| cloudball 工人 A | :07 | Sonnet |
| cloudball 工人 B | :27 | Sonnet |
| cloudball 工人 C | :47 | Opus |
| cloudball 審核班 | :37 | Opus |

## Worker (replace `<slot>` with A, B or C; slot C drops `-label:model:opus` from the query)
```
cloudball 工人 <slot>。R=sunososobro-hub/cloudball。gh 回 not enabled → 先 add_repo(owner sunososobro-hub, repo cloudball, access push)。附加訊息有 so 哥原話＋時間 → 跳過第 0 步，那是本輪主任務。
第 0 步（省錢閘，不讀檔）：L=$(gh api repos/$R/issues/275 --jq .body | head -1)；N=$(gh api -X GET search/issues -f q="repo:$R is:issue is:open label:status:todo -label:needs-owner -label:needs-opus -label:status:frozen -label:status:blocked -label:model:opus" -f per_page=1 --jq .total_count)。L 是 level: 1 → N 的 q 再加 label:P0,P1。L 是 level: 0、或 N=0 → 只回「搞定」結束。
第 1 步：讀 dev 上 .agent/rules.md、.agent/routines/common.md、.agent/routines/worker.md 並照做（gh api "repos/$R/contents/<path>?ref=dev" -H "Accept: application/vnd.github.raw"）。你是 slot=<slot>。
認領一張單 → 做一個小塊 → 開 PR 後收工；不等 CI、不等合併。
回覆只一行：「搞定」或「卡住：短原因」；細節寫 GitHub。
```

## Reviewer
```
cloudball 審核班。R=sunososobro-hub/cloudball。gh 回 not enabled → 先 add_repo(owner sunososobro-hub, repo cloudball, access push)。附加訊息有 so 哥原話＋時間 → 跳過第 0 步，那是本輪主任務。
第 0 步（省錢閘，不讀檔）：P=$(gh api -X GET search/issues -f q="repo:$R is:pr is:open base:dev -label:needs-owner" -f per_page=1 --jq .total_count)；D=$(gh api -X GET search/issues -f q="repo:$R is:issue is:open label:status:doing" -f per_page=1 --jq .total_count)；T=$(gh api -X GET search/issues -f q="repo:$R is:issue is:open -label:status:todo -label:status:doing -label:status:review -label:status:blocked -label:status:frozen -label:needs-owner" -f per_page=1 --jq .total_count)。P、D、T 都是 0 → 只回「搞定」結束。
第 1 步：讀 dev 上 .agent/rules.md、.agent/routines/common.md、.agent/routines/review.md 並照做（讀法同工人）。
合綠燈 PR（engine/.agent/.github/run.mjs 先審、外人 PR 不合）→ 收孤兒認領 → 分類新單，做完收工。
回覆只一行：「搞定」或「卡住：短原因」；細節寫 GitHub。
```

## Switching over (product window, once this file is on dev)
1. Create the four tasks above. 2. Turn off the old per-folder windows and the old patrol (介面窗, 球員窗, 巡邏班 and
the rest named in issue #68). 3. Close #68 as replaced by `.agent/rules.md`. The throttle stays issue #275.
