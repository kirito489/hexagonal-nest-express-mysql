## 1. quality-check job

- [x] 1.1 `.gitlab-ci.yml` 的 `stages` 加入 `quality`（置於 `prepare` 之後、`optimize` 之前）
- [x] 1.2 新增 `quality-check` job：`needs: [npm-install]`、沿用兩層 cache、`before_script` 用 `.copy_env_script`
- [x] 1.3 script 依序執行 `pnpm typecheck` → `pnpm lint` → `pnpm test`（`test` 已串接架構測試）
- [x] 1.4 rules 同時涵蓋 MR 與 develop / master 推送（不沿用 `prepare-production` 只認 `$CI_COMMIT_BRANCH` 的寫法）
- [x] 1.5 本機逐一驗證：`pnpm typecheck` ✓ / `pnpm lint` ✓ / `pnpm test` ✓（234 單元 + 20 架構）

## 2. e2e-test job

- [x] 2.1 新增 `e2e-test` job，`services` 加入 `mysql:9`，設定 `MYSQL_ROOT_PASSWORD` 等 service 變數
- [x] 2.2 job variables 供應 `DB_HOST` / `DB_PORT` / `DB_USERNAME` / `DB_PASSWORD` / `DB_TEST_DATABASE`（庫名含 `test` 以通過守門）
- [x] 2.3 script 執行 `pnpm --filter @app/api test:e2e`
- [x] 2.4 守門驗證：`DB_TEST_DATABASE=production_db` 時 globalSetup 如期中止（「名稱須含 test（防誤連 dev / prod）」）——**同時證明環境變數確實覆蓋 `.env`**，即決策 2 的核心假設成立
- [x] 2.5 以純環境變數指定另一測試庫（`hexagonal_ci_sim_test`）跑完整 e2e → 自動建庫 + migrate + 138 全綠；驗證後已清除該庫

## 3. 串接與文件

- [x] 3.1 `prepare-production` 加上 `needs: [quality-check]`
- [x] 3.2 以 js-yaml 載入驗證：stages 順序、兩個 job 的 script / needs、rules alias 展開為 2 條、before_script alias 已展開、services 設定、`prepare-production` 相依 `quality-check` —— 全數通過
- [x] 3.3 `openspec/project.md` 補 CI 章節：各 job 職責、觸發時機、對應的本機指令（供不使用 GitLab CI 的模板使用者）
- [x] 3.4 `tasks/todo.md` 記錄「首次 pipeline 需人工觀察」的待辦（CI 正確性無法在本機完全驗證）
- [x] 3.5 完整驗證鏈：typecheck ✓ / lint ✓ / 234 + 20 ✓ / e2e 138 ✓ / build ✓
