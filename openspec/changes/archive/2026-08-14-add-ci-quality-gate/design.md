## Context

`.gitlab-ci.yml` 目前是「裝依賴 → 建置 → 清理 → PR 審查」的骨架，沒有任何品質檢查。既有結構有幾個要沿用的設計：

- `npm-install` 用 `package_cache` + `build_artifacts_cache` 兩層 cache 傳遞 `node_modules`
- `.copy_env_script` 依分支複製 `.env.develop` / `.env.production`，不存在時建立空 `.env`
- `workflow.rules` 已限定「MR 目標為 develop / master」或「push 到 develop / master」才啟動 pipeline
- `prepare-production` 的 rules 只認 `$CI_COMMIT_BRANCH`，因此 **MR 階段實際上只跑 `npm-install`**

e2e 的環境需求（讀 `test/helpers/e2e-env.ts` 確認）：`applyE2EDbEnv()` 以 dotenv 載入 `apps/api/.env`，但 **dotenv 不覆寫既有 `process.env`** —— 因此 CI 只要用 job variables 供應 DB 連線與 `DB_TEST_DATABASE` 即可，不需要偽造 `.env` 檔。守門條件是庫名必須含 `test`。

## Goals / Non-Goals

**Goals:**

- 已存在的檢查（typecheck / lint / 234 單元 / 20 架構 / 138 e2e）在 CI 全部執行
- MR 階段就攔截，而非合併後才發現
- 品質未過就不浪費資源建置

**Non-Goals:**

- 不新增任何檢查項目（本 change 只負責「讓既有檢查在 CI 跑」）
- 不改變覆蓋率門檻（維持 70/60/70/70）
- 不處理部署 job（仍為註解狀態的範本）
- 不導入 GitHub Actions 等其他 CI 平台

## Decisions

### 決策 1：拆成 `quality-check` 與 `e2e-test` 兩個 job，而非合併

| job | 需要的資源 | 預估耗時 |
| --- | --- | --- |
| `quality-check` | 無外部服務 | 數十秒 |
| `e2e-test` | MySQL service container | 1–2 分鐘 |

拆開的理由是**回饋速度**：大部分錯誤（型別、lint、架構違規、單元測試）由不需要資料庫的 job 抓到，開發者不必等 MySQL 起來才看到結果。同一個 stage 下兩個 job 可平行執行，總時間取決於較慢者，不會比合併更慢。

*替代方案：* 合併成單一 `test` job。否決 —— 失敗時無法一眼看出是「程式碼問題」還是「e2e 環境問題」，且 e2e 的 service container 會拖慢所有失敗的回饋。

### 決策 2：e2e 的 DB 設定走 job variables，不造 `.env`

`applyE2EDbEnv()` 用 dotenv 載入 `.env`，而 dotenv 的語意是**不覆寫既有環境變數**。CI 以 job variables 設定 `DB_HOST` / `DB_PORT` / `DB_USERNAME` / `DB_PASSWORD` / `DB_TEST_DATABASE` 即可被正確採用。

這比「在 CI 產生一份假 `.env`」乾淨：不必維護兩份格式相同的環境設定，也不會讓 `.env` 的內容散落在 CI 腳本裡。

`DB_TEST_DATABASE` 設為 `hexagonal_e2e_test`（含 `test`，通過既有守門）。

### 決策 3：`quality-check` 沿用 `.copy_env_script`

`typecheck` / `lint` 都有 `pre` script 觸發 `db:generate`，而 `scripts/prisma-env.ts` 需要讀 `.env` 組出 `DATABASE_URL`。

`prisma generate` **不連線資料庫**，因此 `.copy_env_script` 在 `.env.develop` 不存在時建立的空 `.env` 已足夠——沿用既有機制即可，不需要為 CI 另設 DB 變數。

### 決策 4：rules 明確涵蓋 MR 與分支推送

```yaml
rules:
  - if: $CI_MERGE_REQUEST_TARGET_BRANCH_NAME == "develop" || $CI_MERGE_REQUEST_TARGET_BRANCH_NAME == "master"
  - if: $CI_COMMIT_BRANCH == "develop" || $CI_COMMIT_BRANCH == "master"
```

與 `workflow.rules` 一致。刻意**不**沿用 `prepare-production` 只認 `$CI_COMMIT_BRANCH` 的寫法 —— 那正是造成「MR 階段幾乎不檢查」的原因。

### 決策 5：`prepare-production` 加 `needs: [quality-check]`

品質未通過就不建置。不把 `e2e-test` 也列入 `needs`，是為了讓 e2e 較慢時不阻塞建置產出；e2e 失敗仍會使整體 pipeline 失敗。

## Risks / Trade-offs

- **[pipeline 時間增加]** → 兩個 job 平行；`quality-check` 不需 service container，多數失敗會在數十秒內回報。若團隊仍嫌慢，可先把 `e2e-test` 限定在 MR 觸發。
- **[MySQL service container 版本與本機不符]** → 使用 `mysql:9`（對齊 `openspec/project.md` 記載的本機版本）；認證方式差異已由 `prisma.service.ts` 的 `allowPublicKeyRetrieval` 處理。
- **[模板使用者不用 GitLab CI]** → `project.md` 需明列每個 job 對應的本機指令，讓使用者能移植到其他 CI 或至少手動執行。
- **[CI 無法在本機驗證]** → 這是本 change 最大的限制：`.gitlab-ci.yml` 的正確性只能在實際 pipeline 執行時確認。緩解方式是本機先逐一跑過每個 job 的 script 內容（指令本身可驗證），YAML 結構則以 `gitlab-ci-local` 或 GitLab 的 CI Lint API 檢查；**不得宣稱「CI 已驗證通過」**，只能宣稱「指令在本機可執行、YAML 語法合法」。

## Migration Plan

1. 新增 `quality` stage 與兩個 job，本機逐一驗證 script 內容可執行
2. 驗證 YAML 語法合法
3. 文件更新
4. 推送後觀察第一次 pipeline，依實際結果調整（此步驟由使用者執行）

回滾：單一檔案的設定變更，`git revert` 即可。

## Open Questions

- 是否要加 coverage 報告上傳（GitLab 的 coverage 視覺化需要 `artifacts:reports:coverage_report`）？本次不做，待 CI 穩定後再議。
- `e2e-test` 是否該只在 MR 跑以節省時間？先兩者都跑，觀察實際耗時再調整。
