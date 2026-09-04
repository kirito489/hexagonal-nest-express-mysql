## ADDED Requirements

### Requirement: 本機驗證分為 commit 與 push 兩層

專案 SHALL 提供兩支 git hook，各自承擔不同的把關密度，MUST NOT 併成一層：

| Hook | 執行內容 | 定位 |
| --- | --- | --- |
| `pre-commit` | `lint-staged`（只檢查改動的檔案） | 快到每次 commit 都跑得起 |
| `pre-push` | `pnpm typecheck && pnpm lint && pnpm test:cov` | 與 CI 品質檢查同一條鏈 |

`pre-push` SHALL 與 CI 的品質 job 跑同一條指令鏈，讓「本機沒跑就推」在推之前就紅，
而不是等 review 已經開始才由 CI 報錯。

完整驗證 MUST NOT 移進 `pre-commit`：一分鐘乘上一天的 commit 次數會讓所有人開始用
`--no-verify`，連 lint 都跟著失效——**把關太嚴會讓整道關卡被繞過，比只擋一半更糟**。

兩支 hook SHALL 沿用同一套 nvm PATH 補救（`pnpm` 不在 PATH 時載入 `nvm.sh`），
不得各自實作。

#### Scenario: 本機未跑驗證即推送

- **WHEN** 開發者在型別錯誤或測試未通過的狀態下執行 `git push`
- **THEN** `pre-push` 失敗並中止推送

#### Scenario: hook 未被觸發

- **WHEN** `git config --get core.hooksPath` 沒有值（husky 未註冊）
- **THEN** 兩支 hook 都不會執行且 git **不會報錯**——這是已知且無法由靜態檢查偵測的缺口，
  診斷依據是該設定有沒有值，而不是 `.husky/` 有沒有檔案

## MODIFIED Requirements

### Requirement: CI 必須執行完整品質檢查

CI pipeline SHALL 執行型別檢查、lint 與測試（含架構規則）。任一項失敗 MUST 使 pipeline 失敗，且 MUST NOT 僅依賴開發者本機執行或 git hook。

#### Scenario: 提交含型別錯誤的程式碼

- **WHEN** 推送的程式碼無法通過 `pnpm typecheck`
- **THEN** CI 的品質 job 失敗，pipeline 中止

#### Scenario: 提交違反架構規則的程式碼

- **WHEN** 推送的程式碼違反任一架構守則（如 controller 直接相依持久層）
- **THEN** CI 的品質 job 失敗，訊息包含違規的檔案與行號

#### Scenario: 繞過 git hook 提交

- **WHEN** 開發者以 `--no-verify` 略過 `pre-commit` 或 `pre-push` 並推送
- **THEN** CI 仍執行完整檢查並攔截問題——git hook 不是安全邊界，真正的強制在 CI
