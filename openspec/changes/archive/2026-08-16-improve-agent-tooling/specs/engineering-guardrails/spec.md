## ADDED Requirements

### Requirement: hook 邏輯必須可獨立執行與檢查

AI 工具的 hook 邏輯 SHALL 放在工具無關的 script 檔中，設定檔只負責註冊。script MUST 能在不經由 AI 工具的情況下直接執行，且 MUST 納入語法檢查。

#### Scenario: 撰寫或修改 hook

- **WHEN** 需要新增或修改 hook 行為
- **THEN** 修改 `.agents/hooks/` 下的 script，而非設定檔中的字串

#### Scenario: hook script 語法錯誤

- **WHEN** 任一 hook script 有 shell 語法錯誤
- **THEN** 架構測試以 `bash -n` 檢出並失敗，不必等到 hook 實際觸發

#### Scenario: 非 Claude 工具呼叫

- **WHEN** 其他 AI 工具或 git hook 需要相同檢查
- **THEN** 可直接呼叫同一支 script；script 自行推斷專案根目錄，不相依特定工具的環境變數

### Requirement: 產物連動契約由 Stop hook 強制

當來源檔與其產生物存在連動關係時，系統 SHALL 於對話結束前檢查兩者是否一起變更，未同步 MUST 阻止結束並說明修正方式。

#### Scenario: 改了 swagger 來源但未重新產生

- **WHEN** `docs/swagger/**/*.yaml` 有變更，而 `openapi.bundle.yaml` 與 `api-client/src/schema.ts` 皆無變更
- **THEN** Stop hook 以非零狀態阻止結束，並提示應執行的指令

#### Scenario: 來源與產物一起變更

- **WHEN** 來源 yaml 與產物皆有變更
- **THEN** 檢查通過

### Requirement: CI 環境可於本機重現

專案 SHALL 提供以容器重現 CI 測試環境的方式，使 CI 相關改動不必推送即可驗證。

#### Scenario: 修改 CI 設定後

- **WHEN** 開發者調整 CI 的測試 job
- **THEN** 可在本機以容器執行等價的驗證，不需等待實際 pipeline
