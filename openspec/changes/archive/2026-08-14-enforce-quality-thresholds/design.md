## Context

本 change 源於一次稽核：原本的假設是「前端護欄遠落後於後端」（依據是 103 個原始碼檔對 7 個測試檔），但實測推翻了這個推論——

- 前端覆蓋率 **94 / 96.15 / 87.5 / 92.85**，門檻 75/75/60/75
- 前端 coverage 採黑名單模式（`include: src/lib, src/components` + 明列排除），設計比後端的白名單式 `coveragePathIgnorePatterns` 更用心
- 三條候選的分層規則實測**各 0 違規**

檔案數比例之所以誤導，是因為 `src/components/ui/**`（shadcn 生成）與整合層本就不在覆蓋率分母內。

真正的問題在追查過程中浮現：**四個門檻數字沒有任何執行路徑**。

## Goals / Non-Goals

**Goals:**

- 覆蓋率門檻在 CI 真的會失敗
- 覆蓋率指令不遺漏架構規則
- 前端補上與後端對等的 import 邊界

**Non-Goals:**

- 不補測試（現況覆蓋率已遠高於門檻）
- 不調整門檻數字（調高應該是獨立決策，且需先觀察一段時間）
- 不改變 coverage 的 include / exclude 範圍

## Decisions

### 決策 1：`test` 與 `test:cov` 分開，CI 用後者

保留 `test`（快，開發時用）與 `test:cov`（慢，含門檻）兩個入口，CI 走 `test:cov`。

*替代方案：* 讓 `test` 直接帶 `--coverage`。否決——開發過程頻繁跑測試，覆蓋率的額外成本（v8 instrument、報告產生）會拖慢回饋；且本機通常只想跑單一 spec。

### 決策 2：`api` 的 `test:cov` 補上架構測試

原本 `test:cov` 是 `jest --coverage`，只跑單元測試。若 CI 改用 `test:cov` 而不修正，**20 條架構規則會被靜默略過**——這正是本 change 要消滅的那類問題（換了執行路徑卻沒發現檢查掉了）。

改為 `jest --coverage && jest --config test/jest.arch.config.js`，與 `test` 的組成保持一致。

### 決策 3：前端 import 邊界只立三條、且都經現況實測

只加實測過現況為 0 違規的規則，確保導入不需要任何豁免：

| 規則 | 方向 | 現況違規 |
| --- | --- | --- |
| `lib` / `hooks` / `components` 不得 import `routes` | 下層不反向相依上層 | 0 |
| `routes/A` 不得 import `routes/B` | 路由彼此獨立 | 0 |
| `components/ui` 不得 import 業務層 | shadcn 原子元件保持可重用 | 0 |

沿用 `apps/api` 已驗證的教訓：**flat config 同名規則後蓋前、不合併 patterns**，因此重疊的檔案範圍（`src/components/ui` 同時屬於 `components`）必須各自列齊完整限制。

### 決策 4：不把 coverage 報告上傳 GitLab

GitLab 的覆蓋率視覺化需要 `artifacts:reports:coverage_report` 與 cobertura 格式輸出，會牽動兩個 workspace 的 reporter 設定。本次只做「門檻會失敗」，視覺化待 CI 穩定後再議。

## Risks / Trade-offs

- **[CI 變慢]** → 覆蓋率的額外成本主要在 instrument 與報告產生；相較於 e2e job 的 MySQL 啟動，這部分佔比很小。
- **[門檻數字偏低，形同虛設]** → 現況覆蓋率遠高於門檻（api 86.91 vs 70、web 94 vs 75），門檻只擋「大幅退步」。是否調高應另案決定——先讓門檻能執行，再談要不要收緊。
- **[前端規則為預防性]** → 現況 0 違規，導入零成本；若未來出現正當的跨 route 共用，正解是把邏輯下沉到 `lib`，而非放寬規則。

## Migration Plan

單一塊：改 script、改 CI、加 eslint 規則、驗證（含反向驗證），再更新文件。

回滾：全為設定變更，`git revert` 即可。
