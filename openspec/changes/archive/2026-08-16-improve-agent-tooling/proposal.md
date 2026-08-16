# AI 工程設置升級（improve-agent-tooling）

## Why

借鏡 `times-account-backend` 的 AI 工程設置，它比本專案成熟一個世代。四個具體落差：

**1. hook 邏輯塞在 `settings.json` 的字串裡** —— 現有 3 支 PostToolUse hook 都是一長串 `jq … | { read -r f; case … }`，無法加註解、無法單獨執行測試、不被任何 lint 檢查。本輪才踩過同型問題（`jest.arch.config.js` 的註解語法錯誤讓 config 爆掉，而 `.js` 不在檢查範圍）。

**2. `"Stop": []` 是空的** —— 沒有任何收尾檢查。而本專案有明確的**連動契約**沒有機器守：改了 `docs/swagger/**/*.yaml` 就必須重跑 `swagger:bundle` 與 api-client `generate`，否則產物過期。目前只能靠人記得跑 `swagger:check`。

**3. CI 正確性無法在本機驗證** —— `tasks/todo.md` 有一條待辦記著這件事。`times-account-backend` 用 `compose.verify.yml`（MySQL + healthcheck + tmpfs）在本機重現 CI 環境。它的等待機制也比本專案好：用 `depends_on: condition: service_healthy`，而本專案 CI 是手寫的 30 次 × 2 秒 node 迴圈。

**4. 只有 Claude 讀得到規則** —— 對方用 `AGENTS.md` → `CLAUDE.md` 的 symlink，一份內容兩個入口，Codex 等工具也讀得到；並在規則後標註「（hook 強制）」，讓人一眼看出哪些靠機器、哪些靠自律。

## What Changes

- **hook 抽成 `.agents/hooks/*.sh`**：工具無關的共用位置，`settings.json` 只留註冊。`ROOT` 以 `${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}` 取得，讓非 Claude 工具也能呼叫同一支。
- **新增 Stop hook `check-swagger-artifacts.sh`**：改了 swagger 來源 yaml 但 bundle / `schema.ts` 沒一起變更時 `exit 2` 擋下。用 `git status --porcelain` 比對，毫秒級、不跑外部工具。
- **新增 `compose.verify.yml`** 與 `pnpm verify:ci`：本機以容器重現 CI 的 e2e 環境（MySQL 9 + healthcheck + tmpfs）。
- **`.gitlab-ci.yml` 的手動等待迴圈改用 service healthcheck**。
- **`AGENTS.md` symlink 指向 `CLAUDE.md`**，並在 Hard Rules 標註每條的強制方式（hook / 測試 / 型別 / 自律）。

## Capabilities

### Modified Capabilities

- `engineering-guardrails`: 新增「hook 邏輯必須可測」與「連動契約由 Stop hook 強制」兩條要求。

## Impact

**新增檔案**

- `.agents/hooks/check-typescript.sh`、`check-prisma-schema.sh`、`check-domain-exception.sh`（由 settings.json 抽出）
- `.agents/hooks/check-swagger-artifacts.sh`（新增的連動檢查）
- `compose.verify.yml`、`AGENTS.md`（symlink）

**修改檔案**

- `.claude/settings.json`（只留註冊）、`.gitlab-ci.yml`、`package.json`（`verify:ci`）、`CLAUDE.md`、`openspec/project.md`

**風險**

- Stop hook 用 `exit 2` 會**阻止對話結束**。誤判會很惱人，因此判斷條件必須保守：只有「來源 yaml 有變更」且「產物完全沒變更」才擋，並在訊息中明確給出解法指令。
- `.agents/hooks/*.sh` 需納入檢查範圍才有意義（否則重蹈「設定沒有執行路徑」覆轍）—— 以 `bash -n` 語法檢查納入架構測試。
