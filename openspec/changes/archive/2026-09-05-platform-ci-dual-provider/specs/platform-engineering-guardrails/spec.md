## ADDED Requirements

### Requirement: 多份 CI 設定的一致性檢查

系統 SHALL 在專案提供多份 CI 設定時，檢查它們執行的**檢查集合**一致。

比對對象 MUST 是「出現了哪些 pnpm 指令」與「資料庫映像的版本線」，
MUST NOT 解析 YAML 結構做比對——兩個平台的結構本來就不同
（stage 與 needs、service container 的宣告方式、快取機制），
比對結構會逼兩份寫成同一個形狀，而那是不必要的耦合。

**只有一份設定時 MUST 通過。** fork 後刪掉不用的那份是預期行為。
檢查 MUST NOT 因為「另一份不存在」而失敗——但兩份都在時 MUST 一致。

檢查 MUST 涵蓋的指令至少包含：`pnpm typecheck`、`pnpm lint`、`pnpm test:cov`、
`test:e2e`、`pnpm build`。清單 MUST 由測試自己宣告並附「為何這幾條」的理由，
MUST NOT 從設定檔反推（那會讓「兩份都漏掉同一項」看起來正常）。

#### Scenario: 只在一份設定加了新檢查

- **WHEN** 其中一份出現另一份沒有的必要指令
- **THEN** 檢查失敗並指出是哪一份缺哪一個

#### Scenario: 兩份的資料庫版本線不同

- **WHEN** 兩份宣告的資料庫映像大版本不一致
- **THEN** 檢查失敗——差異在版本不在程式碼，是最難查的那種

#### Scenario: 兩份都漏掉同一個必要檢查

- **WHEN** 兩份設定都沒有執行覆蓋率門檻
- **THEN** 檢查失敗——必要清單由測試宣告，不是從設定檔反推

#### Scenario: 專案只保留一份設定

- **WHEN** `.gitlab-ci.yml` 與 `.github/workflows/` 只存在其一
- **THEN** 檢查通過
