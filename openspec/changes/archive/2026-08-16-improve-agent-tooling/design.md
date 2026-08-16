## Context

參考來源是 `times-account-backend`（Laravel 專案，同一位開發者維護）。它的 AI 工程設置有幾個本專案沒有的模式，且都能直接對應到本專案的實際痛點。

本專案現況：3 支 PostToolUse hook（邏輯全在 `settings.json` 的字串）、`"Stop": []` 空的、CI 無法本機驗證（todo 有記）、規則只有 Claude 讀得到。

## Goals / Non-Goals

**Goals:**

- hook 邏輯可讀、可單獨執行、可被語法檢查
- swagger 產物過期在對話結束前就被擋下，不必靠人記得
- CI 的測試環境能在本機重現
- 規則對非 Claude 工具也可讀，且標明哪些是機器強制

**Non-Goals:**

- 不引入 Playwright 前端 E2E（前端已有 vitest + 94% 覆蓋，瀏覽器層另案評估）
- 不新增 `ARCHITECTURE.md`（`openspec/project.md` 已扮演此角色，再開一份會分散）
- 不把 CLAUDE.md 拆成 `.agents/rules/*.md`（目前 195 行仍可讀；等膨脹到難以掌握再拆）

## Decisions

### 決策 1：hook script 放 `.agents/` 而非 `.claude/`

`.claude/` 是 Claude Code 專屬目錄。把**邏輯**放進去等於綁定單一工具；而 hook 檢查的內容（swagger 產物是否過期、prisma schema 是否要 migrate）本質上與 AI 工具無關，git pre-commit 或其他 agent 也該能用。

因此：`.agents/hooks/*.sh` 放邏輯，`.claude/settings.json` 只負責註冊。專案根目錄以 `${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}` 取得——有 Claude 的環境變數就用，沒有就用 git 推斷。

### 決策 2：Stop hook 的判斷條件必須保守

`exit 2` 會**阻止對話結束**，誤判的代價比漏判高得多（漏判只是少一層保護，誤判會讓人無法收工）。

因此條件設為：**來源 yaml 有變更 AND 產物完全沒有變更**才擋。以下情況一律放行：

- 來源與產物都變更了（正常流程）
- 只有產物變更（可能是手動重跑 bundle）
- 兩者都沒變更（沒動 swagger）

用 `git status --porcelain` 判斷，涵蓋 staged / unstaged / untracked。

*替代方案：* 在 Stop hook 跑 `swagger:check`（實際比對內容）。否決——那要執行 `swagger-cli` 與 `openapi-typescript`，數秒起跳，而 Stop hook 每次對話結束都會跑。git 比對是毫秒級，涵蓋 90% 的情境（忘記重跑）；內容層級的漂移仍由 `swagger:check` 與架構測試負責。

### 決策 3：hook script 納入架構測試以 `bash -n` 檢查

本輪的教訓是「設定寫了但沒有執行路徑」與「`.js` 設定檔不在檢查範圍」。把 hook 從 settings.json 抽成 `.sh` 後，若不納入任何檢查，等於把同一個問題換個地方重演。

`bash -n` 只做語法解析、不執行，安全且毫秒級，加進既有的架構測試即可。

### 決策 4：`compose.verify.yml` 用 healthcheck 而非手動等待

現行 `.gitlab-ci.yml` 的 `wait_for_mysql_script` 是手寫的 30 次 × 2 秒 node 迴圈——當初這樣寫是因為不確定 GitLab runner 對 service 的就緒判斷。docker compose 的 `healthcheck` + `depends_on: condition: service_healthy` 是標準做法，宣告式、由 daemon 負責重試。

本機 compose 用 healthcheck；GitLab CI 的 services 沿用手動等待（GitLab 的 service 不支援 compose 的 healthcheck 語法），但兩邊的 MySQL 版本與初始化參數保持一致。`tmpfs: /var/lib/mysql` 讓測試庫跑在記憶體，加速且免清理。

### 決策 5：`AGENTS.md` 用 symlink 而非複製

複製會立刻產生同步問題（改了 CLAUDE.md 忘了改 AGENTS.md）。symlink 是 git 原生支援的物件類型，clone 後仍是連結。

同時在 Hard Rules 每條標註強制方式（`hook` / `測試` / `型別` / `自律`），讓讀者知道哪些違反了會立刻失敗、哪些只是約定。

## Risks / Trade-offs

- **[Stop hook 誤判擋住收工]** → 條件保守（見決策 2），且訊息直接給出解法指令；真的誤判時開發者可自行判斷後再結束。
- **[`.agents/` 多一層目錄]** → 換得工具無關與可測試性；且 hook 邏輯本來就不該綁 Claude。
- **[compose.verify 與 GitLab CI 不完全等價]** → 明確定位為「測試環境重現」而非「pipeline 模擬」；runner 行為、cache 仍只能在實際 pipeline 觀察，todo 那條待辦不會因此消除，但範圍縮小。

## Migration Plan

分四塊，每塊獨立可驗證：

1. hook 抽成 `.agents/hooks/*.sh` + settings.json 改為註冊 + 架構測試加 `bash -n`
2. 新增 swagger 連動的 Stop hook（含反向驗證：改 yaml 不重跑產物 → 應被擋）
3. `compose.verify.yml` + `verify:ci` script（實際跑一次）
4. `AGENTS.md` symlink + Hard Rules 標註 + 文件同步
