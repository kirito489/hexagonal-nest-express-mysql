## MODIFIED Requirements

### Requirement: 品質檢查必須在 Merge Request 階段執行

品質檢查 SHALL 於 Merge Request（或 Pull Request）觸發，不得只在合併後的分支推送才執行。

**建置 job 同樣 MUST 在此階段執行。** `nest build` / `vite build` 會抓到 path alias 解析、
decorator metadata 與 emit 階段的錯誤，而 `tsc --noEmit` 抓不到——
只在推送分支時才建置等於「PR 是綠的，合併完才紅」，
把問題推到最不該爆的地方。

建置仍 MUST 相依於品質檢查（見「品質未通過不得進入建置階段」），
因此拉長的只有「品質已經通過」那條路徑的回饋時間。

#### Scenario: 開啟 Merge Request

- **WHEN** 對 develop 或 master 開啟 Merge Request
- **THEN** 品質檢查隨即執行，結果呈現於該 MR

#### Scenario: PR 階段的建置

- **WHEN** 對 develop 或 master 開啟 Merge Request，且品質檢查通過
- **THEN** 建置 job MUST 執行——`tsc --noEmit` 抓不到的錯誤要在此顯現

## ADDED Requirements

### Requirement: CI 設定可有多份但檢查集合必須一致

多份 CI 平台設定（例如 GitLab 與 GitHub Actions）並存時 SHALL 執行同一組檢查：型別、lint、覆蓋率門檻（含架構守則）、e2e、建置。專案 MAY 只提供其中一份。

理由是**CI 設定的錯誤方式全是靜默的**：

| 漏掉什麼 | 症狀 |
| --- | --- |
| 用 `test` 而非 `test:cov` | 覆蓋率門檻**不執行**，數字掉了沒人知道 |
| 建置 job | path alias / decorator metadata 的錯誤延到合併後才爆 |
| e2e 的測試庫名不含 `test` | `globalSetup` 守門中止，job 紅得莫名其妙 |

沒有一項會在「設定寫錯的當下」出聲，因此一致性 MUST 由機器檢查。

兩份 MUST 使用**同一條資料庫版本線**——不同的大版本會產生「本機過、CI 掛」，
而那個差異在版本不在程式碼，最難查。

**只提供一份時本需求自動滿足。** fork 這個專案後刪掉不用的那份是預期行為，
不得因此失敗；但兩份都在時 MUST 一致——
這讓「有意識地只留一份」與「不小心讓兩份漂移」有不同的結果。

各平台的**寫法**不必一致（stage 與 needs、service container 的宣告方式、
快取機制本來就不同），要求一致的只有「跑了哪些檢查」。

#### Scenario: 新增檢查只補了一邊

- **WHEN** 在其中一份 CI 設定加入新的檢查指令，另一份沒有
- **THEN** 一致性檢查失敗並指出缺哪一個

#### Scenario: 兩份用不同的資料庫版本

- **WHEN** 兩份設定宣告的資料庫映像大版本不同
- **THEN** 一致性檢查失敗

#### Scenario: fork 後只留一份

- **WHEN** 專案只有一份 CI 設定
- **THEN** 一致性檢查通過，不得因為「另一份不存在」而失敗
