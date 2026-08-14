## ADDED Requirements

### Requirement: 產生器產出物必須通過所有護欄

`gen:module` 產出的模組 MUST 在不經任何手動修改的情況下通過 `typecheck`、`lint` 與全部架構守則測試。產生器 MUST 同步維護其產出物所相依的共用檔（錯誤碼、訊息表、swagger 索引）。

#### Scenario: 產生新模組後立即驗證

- **WHEN** 執行 `gen:module <name>` 後隨即執行 `pnpm typecheck`、`pnpm lint` 與架構守則測試
- **THEN** 三者皆通過，開發者只需補 Prisma model 與實際欄位

#### Scenario: 新增護欄規則時

- **WHEN** 新增任何架構守則或型別約束
- **THEN** 必須一併確認 `gen:module` 的產出物仍符合該規則

#### Scenario: 共用檔注入重複執行

- **WHEN** 對同一模組名稱重複執行產生器
- **THEN** 共用檔的注入為冪等，不產生重複項目
