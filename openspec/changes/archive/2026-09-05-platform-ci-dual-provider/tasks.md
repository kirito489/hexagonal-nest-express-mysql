> 每一塊（`##` 標題）須能獨立通過驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`。
> 本 change **不動任何 production 程式碼**，因此不需要 `test:e2e` 與 `pnpm build`
> 的既有路徑驗證。
> 全部完成後給**一個** commit 指令，由使用者手動執行。
>
> **塊的依賴**：
> - 塊 1（GitHub Actions）與塊 2（修 GitLab 的 build rules）互相獨立。
> - **塊 3（一致性守則）必須排在 1、2 之後**——它比對的正是那兩塊的產物。
>
> ⚠️ **本 change 有一個驗不到的部分**：GitHub 的設定沒有在真的 GitHub repo 上跑過。
> 語法正確性可以驗（YAML 解析 + 指令存在），但 runner 行為、cache 命中、
> service container 的啟動時序只能在實際 pipeline 觀察。收尾要把這件事寫進 `todo.md`，
> **不要在 tasks 裡假裝它被驗證了**。

## 1. GitHub Actions

- [x] 1.1 新增 `.github/actions/setup-workspace/action.yml`：Node 取自 `.nvmrc`、pnpm 取自 `packageManager`（corepack）、pnpm store 快取、`pnpm install --frozen-lockfile`
- [x] 1.2 註解寫明**為何抽成 composite action**（複製出去的設定必然漂移，同 `x-app-base` anchor）與**為何不硬釘版號**（多一處要與本機同步的地方）
- [x] 1.3 註解寫明平行 job 共用 cache key 時「另一邊會印 Failed to save」是**預期行為**——該步驟的 outcome 仍是 success，要消除它得把平行變序列，代價更大
- [x] 1.4 新增 `.github/workflows/ci.yml`：`quality` / `e2e` / `build` 三個 job，觸發於對 `develop` / `master` 的 PR 與推送
- [x] 1.5 e2e 用 `mysql:9` service container，healthcheck 用 `mysqladmin ping`（與 `compose.yml` 的 `mysql-verify` 同一個判定指令）
- [x] 1.6 `DB_TEST_DATABASE` 的庫名必須含 `test`，註解寫明理由（`globalSetup` 守門防誤連 dev / prod）
- [x] 1.7 `build` 的 `needs: [quality]`，且 e2e **不列入 needs**——它較慢不該阻塞產出，但失敗仍會使整個 workflow 失敗
- [x] 1.8 workflow 檔頭寫明：**本檔只負責執行檢查並回報**，要讓失敗擋住合併必須設 branch protection，而那不在版控內
- [x] 1.9 用 `js-yaml` 解析三份設定確認語法有效（`.github/workflows/ci.yml`、`.github/actions/setup-workspace/action.yml`、`.gitlab-ci.yml`），並印出頂層鍵確認結構如預期
      —— ⚠️ `js-yaml` 只裝在 `apps/api`，要從那個 workspace 跑；在 repo 根目錄跑會 `MODULE_NOT_FOUND`
- [x] 1.10 **不搬 `integration` job**（衍生專案用來驗跨實例 WebSocket 廣播，模板沒有 WS 層）與部署 job（綁各自基礎設施）

## 2. GitLab：建置也要在 MR 跑

- [x] 2.1 `prepare-production` 的 rules 由「只認 `$CI_COMMIT_BRANCH`」改為沿用 `.quality_rules`
- [x] 2.2 註解寫明理由：`nest build` / `vite build` 抓得到 path alias 解析、decorator metadata 與 emit 階段的錯誤，而 `tsc --noEmit` 抓不到；只在 push 跑等於「PR 綠、合併完才紅」
- [x] 2.3 確認 `needs: [npm-install, quality-check]` 仍在——建置只在品質過了才開始，拉長的只有那條路徑

## 3. 一致性守則（必須排在 1、2 之後）

- [x] 3.1 新增 `ci-parity.spec.ts`：比對兩份設定裡出現的 pnpm 指令集合
- [x] 3.2 必要指令清單**由測試自己宣告並附理由**，不從設定檔反推——反推會讓「兩份都漏掉同一項」看起來正常
- [x] 3.3 比對資料庫映像的版本線（兩份的 MySQL 大版本必須相同）
- [x] 3.4 **只有一份設定時通過**：fork 後刪掉不用的那份是預期行為
- [x] 3.5 加「掃描範圍有效」的自我檢查——兩份都讀不到時要失敗而非靜默通過
- [x] 3.6 **反向驗證**（三項都符合設計）：
      (a) `pnpm test:cov` 改成 `pnpm test` → 紅，訊息精確到「`.github/workflows/` 缺少 `pnpm test:cov`」並附上為什麼
      (b) `mysql:9` 改成 `mysql:8` → 版本線那條紅
      (c) 整個 `.github/workflows/` 移走 → **4 條全綠**，證明「fork 後只留一份」不會誤報
      逐一還原後 4 條全綠

## 4. 文件

- [x] 4.1 `openspec/project/tooling.md` 的「CI」節改為涵蓋兩份：各自的 job 對照表、共同的檢查集合、以及「fork 後刪掉不用的那份」
- [x] 4.2 `README.md` 提到兩份 CI 並存與如何選一份
- [x] 4.3 `openspec/project/testing.md` 的規則表補 `ci-parity.spec.ts`

## 5. 收尾

- [x] 5.1 完整驗證鏈實際輸出：

      ```
      typecheck   api / web / api-client 皆 Done
      lint        api / web 皆 Done
      test:cov    api  單元 53 suites / 349 tests；守則 24 suites / 110 tests（本 change 前 23 / 106）
                       All files 87.36 | 64.65 | 78.85 | 87（門檻 70/60/70/70）
                  web  94 | 96.15 | 87.5 | 92.85（門檻 75/75/60/75）
      YAML        三份設定皆解析成功，頂層鍵如預期
      ```
- [x] 5.2 更新 `tasks/todo.md`：勾掉 C5；**把「GitHub 側首次 pipeline 需人工觀察」寫進「需人工處理」段**——那是本 change 驗不到的部分
- [x] 5.3 新踩到的坑寫進 `tasks/lessons.md`
