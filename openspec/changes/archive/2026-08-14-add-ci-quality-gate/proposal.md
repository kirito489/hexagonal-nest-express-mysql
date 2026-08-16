# CI 品質關卡（add-ci-quality-gate）

## Why

專案累積了完整的品質檢查——20 條架構規則、234 支單元測試、138 支 e2e、86.91% 覆蓋率與 70/60/70/70 門檻——但 **CI 一條都不跑**：

```
現況 stages: prepare(pnpm install) → optimize(pnpm build) → cleanup → pr_agent(預設停用)
```

`grep -cE "pnpm (test|lint|typecheck)" .gitlab-ci.yml` 的結果是 **0**。

唯一的自動把關是 husky pre-commit，而它只執行 `lint-staged`（`eslint --fix`），不含型別檢查與任何測試，且 `git commit --no-verify` 即可繞過。

這對一個**會被複製到多個專案的模板**而言是最嚴重的結構性缺口：所有護欄都只在「開發者本機、且記得跑」的前提下有效。護欄的價值會隨著參與人數與時間推移衰減——而模板的整個賣點正是「規則被機器守住」。

## What Changes

- **新增 `quality` stage 與 `quality-check` job**：執行 `pnpm typecheck`、`pnpm lint`、`pnpm test`（含 20 條架構規則），不需要任何外部服務。
- **新增 `e2e-test` job**：以 MySQL service container 跑 `pnpm --filter @app/api test:e2e`。e2e 的 DB 連線由 job variables 供應（`applyE2EDbEnv` 讀 `process.env`，CI 不需要偽造 `.env` 檔）。
- **兩個 job 都在 Merge Request 觸發**：現況 `prepare-production` 只在 develop / master 的 push 跑，MR 階段幾乎不做事——但 MR 正是最該擋下問題的時機。
- **`prepare-production` 加上 `needs: quality-check`**：品質未通過就不浪費資源建置。
- 文件補充：`openspec/project.md` 說明 CI 各 job 的職責與本機對應指令。

## Capabilities

### New Capabilities

- `platform-ci-quality-gate`: CI 對品質檢查的執行保證——哪些檢查必須在 CI 執行、在哪個時機觸發、失敗時是否阻擋後續 stage，以及 e2e 在 CI 的資料庫隔離要求。

## Impact

**修改檔案**

- `.gitlab-ci.yml`（新增 `quality` stage、`quality-check` 與 `e2e-test` 兩個 job）
- `openspec/project.md`（CI 章節）

**不受影響**

- 任何程式碼、測試、依賴；本 change 只調整 CI 設定

**風險**

- e2e 在 CI 需要 MySQL service container，pipeline 時間會增加（本機 e2e 約 6 秒，CI 含 service 啟動與 migrate 預估 1–2 分鐘）。若團隊認為太慢，可改為只在 MR 或只在 develop 觸發——但**不建議完全移除**，e2e 是唯一涵蓋真實 DB 與完整 DI 的測試層。
- `pnpm typecheck` / `lint` 會觸發 `db:generate`（pre-script），需要 `.env` 才能組出 `DATABASE_URL`。沿用既有的 `.copy_env_script`；該腳本在 `.env.develop` 不存在時會建立空檔，而 `prisma generate` 不連線，因此空 `.env` 不影響。
- 模板使用者若不使用 GitLab CI，這些 job 不會生效——`README` / `project.md` 需說明對應的本機指令，避免誤以為有保護。
