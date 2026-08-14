## ADDED Requirements

### Requirement: 覆蓋率門檻必須有執行路徑

每個設有覆蓋率門檻的 workspace MUST 提供執行該門檻的指令，且 CI 的品質檢查 MUST 執行它。設定了門檻卻無任何自動流程會執行，MUST 視為缺陷。

#### Scenario: 覆蓋率低於門檻

- **WHEN** 某 workspace 的覆蓋率低於其設定門檻
- **THEN** CI 的品質 job 失敗，pipeline 中止

#### Scenario: 新增設有門檻的 workspace

- **WHEN** 新增一個設有覆蓋率門檻的 workspace
- **THEN** 該 workspace 必須提供 `test:cov`，才能被 root 的遞迴指令與 CI 涵蓋

### Requirement: 覆蓋率指令必須涵蓋架構規則

執行覆蓋率的指令 MUST 一併執行架構守則測試，避免以覆蓋率取代測試時漏掉架構檢查。

#### Scenario: CI 執行品質檢查

- **WHEN** CI 執行覆蓋率指令
- **THEN** 單元測試、覆蓋率門檻與架構守則三者皆被驗證
