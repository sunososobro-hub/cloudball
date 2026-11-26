# 真顯卡截圖信箱（#444）

你的 Windows 電腦定時把 dev 的遊戲畫面用真顯卡拍下來，推到公開的 `sunososobro-hub/cloudball-shots`。
雲端代理只從 GitHub 讀照片，**沒有任何東西連進你的電腦**。

## 它會做什麼、不會做什麼

- 每 15 分鐘跑一次 `shots.mjs`：
  1. 先查 dev 最新一筆是不是 **你的帳號合併**、而且 `test` 檢查是綠的（只讀 GitHub 公開 API，不用 token）。不是就停，日誌寫一行。
  2. 看 `cloudball-shots` 有沒有新的請求（`requests/`）。沒有、也還沒到整點拍照 → 一秒內結束，不開瀏覽器。
  3. 大約每小時拍一輪：`play.html?q=max`（轉播視角、本壘觸殺、打者特寫）、`agent.html`（正面、背面）、`baseball9.html`，
     存到 `gpu/<UTC 時間>/` 和 `gpu/latest/`，只留最新 7 輪，每輪上限 20 MB。
  4. 只推到 `cloudball-shots` 的 `main`。
- Chrome 用**全新的空白暫存設定檔**（跑完就刪），不會碰你自己的 Chrome、cookie 或密碼。
- 只開本機 `127.0.0.1` 上的這個 repo 的頁面（外加 three.js 和字型），其他網址一律擋掉。
- 只拍網頁畫面本身，不拍桌面、不拍視窗。
- 日誌和 manifest 會先過 `scrub()`：拿掉使用者名稱、電腦名稱、本機路徑、IP、token、金鑰。
- 唯一的憑證是一把 **只能寫 `cloudball-shots`** 的 SSH deploy key。就算被偷，也只能寫照片，碰不到程式碼。

建議：在 **Windows Sandbox** 或 **另一個 Windows 使用者帳號** 底下跑，跟你平常用的帳號分開。

## 一次性設定（PowerShell，一段一段貼）

需要：Git for Windows（含 ssh）、Node 22 以上（你有 24）、Chrome。

1. 做資料夾、抓程式碼（唯讀，不用登入）：

```powershell
$H = "$env:LOCALAPPDATA\cloudball-gpu"
New-Item -ItemType Directory -Force $H | Out-Null
git clone --branch dev https://github.com/sunososobro-hub/cloudball.git "$H\code"
```

2. 產生 deploy key（只做一次，私鑰留在你的 `.ssh`，不進任何 repo）：

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.ssh" | Out-Null
ssh-keygen -t ed25519 -N '""' -C "cloudball-shots" -f "$env:USERPROFILE\.ssh\cloudball_shots_ed25519"
Get-Content "$env:USERPROFILE\.ssh\cloudball_shots_ed25519.pub" | Set-Clipboard
```

3. 到 https://github.com/sunososobro-hub/cloudball-shots/settings/keys → **Add deploy key**，
   標題 `gpu pc`，貼上剪貼簿的公鑰，**勾選 Allow write access**，存檔。

4. 先手動跑一次，看有沒有成功（第一次會拍照並推上去）：

```powershell
node "$env:LOCALAPPDATA\cloudball-gpu\code\tools\gpu_shots\shots.mjs" --force-capture
Get-Content "$env:LOCALAPPDATA\cloudball-gpu\log.txt" -Tail 20
```

   `cloudball-shots` 是空的也沒關係：第一次推送會建立 `main`。若 clone 空 repo 失敗，先在 GitHub 網頁上建一個 README 再跑。

5. 排程：每 15 分鐘一次（工作排程器）：

```powershell
$node = (Get-Command node).Source
$act  = New-ScheduledTaskAction -Execute $node -Argument "`"$env:LOCALAPPDATA\cloudball-gpu\code\tools\gpu_shots\shots.mjs`""
$trig = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 15)
$set  = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 20) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName "cloudball-gpu-shots" -Action $act -Trigger $trig -Settings $set
```

   要在使用者登入時才跑（需要顯卡和桌面工作階段）。停用：`Disable-ScheduledTask cloudball-gpu-shots`。

## 日誌在哪

- `%LOCALAPPDATA%\cloudball-gpu\log.txt`（只有「有事做」的那幾次會寫）。
- 每次請求的日誌也會推到 `results/<id>/log.txt`。

## 代理怎麼用（雲端那邊）

- 讀最新一輪：`https://raw.githubusercontent.com/sunososobro-hub/cloudball-shots/main/gpu/latest/manifest.json`，
  照片在同一個資料夾（`gpu/latest/<檔名>.png`，檔名在 manifest 的 `frames`）。
- 要特定畫面：在 `cloudball-shots` 的 `main` 上新增 `requests/<id>.json`（**必須是你的帳號推的**，別人的 PR 一律不跑）：

```json
{ "id": "r-268-lead", "job": "shots", "created": "2026-11-26T06:00:00Z",
  "shots": [ { "page": "play.html", "act": "broadcast", "tier": "max" } ] }
```

  - `job` 只有三種：`shots`（頁面 + 鏡頭 + 畫質，都要在白名單裡）、`probe`（量 #236 的 BOOT.t 和 WebGPU adapter，可給 `tier`）、`ping`。
  - 頁面 / 鏡頭：`play.html` → `broadcast` `tag` `batter`；`agent.html` → `front` `back`；`baseball9.html` → `default`。畫質：`max` `high` `low`。
  - 多一個欄位、路徑、網址、指令都會被拒絕並寫進日誌。每個 id 只跑一次；超過 24 小時的請求不理。
- 結果在 `results/<id>/`（`manifest.json`、PNG、`log.txt`）。代理寫完請求後排一次約 10 分鐘後的檢查，
  沒看到就在報告裡說「還沒有」，**不要一直等**。

## 電腦關機的話

請求就放著等，什麼都不會壞。電腦開機、排程跑到時就會處理（還沒超過 24 小時的話）。
