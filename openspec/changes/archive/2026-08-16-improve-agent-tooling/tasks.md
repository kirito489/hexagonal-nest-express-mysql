> 每一塊（`##` 標題）須能獨立通過驗證鏈：
> `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter @app/api test:e2e && pnpm build && pnpm --filter @app/api swagger:check`
> 綠燈後給 commit 指令，由使用者手動執行，再進下一塊。
>
> 〔檔頭補寫於 2026-08-16 的 openspec 慣例整理。驗證鏈取自本檔各塊當時實際記錄的結果，塊與任務內容維持原樣未改。〕

## 1. hook 抽成 .agents/hooks

- [x] 1.1 建立 `.agents/hooks/`，把現有 3 支 PostToolUse hook 的邏輯抽成 `check-typescript.sh`、`check-prisma-schema.sh`、`check-domain-exception.sh`
- [x] 1.2 每支開頭加註解說明用途、觸發時機、exit code 語意；`ROOT` 用 `${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}`
- [x] 1.3 `.claude/settings.json` 改為只註冊（`bash "$CLAUDE_PROJECT_DIR/.agents/hooks/<name>.sh"`）
- [x] 1.4 架構測試新增 `hook-scripts.spec.ts`：所有 `.agents/hooks/*.sh` 需通過 `bash -n`，且含「掃描數 > 0」自我檢查
- [x] 1.5 **反向驗證**：探針 A（寫壞 case 語法）→ `bash -n` 檢查紅；探針 B（settings.json 註冊不存在的 script）→ 對應檢查紅；還原後 24 條全綠
- [x] 1.6 五個案例實測與抽出前一致：乾淨 .ts 靜默、含 any 給提示、schema.prisma / domain exception 各自觸發、main.ts 不誤觸發

## 2. swagger 連動的 Stop hook

- [x] 2.1 新增 `.agents/hooks/check-swagger-artifacts.sh`：來源 yaml 有變更且產物皆無變更時 `exit 2`
- [x] 2.2 訊息需直接給出解法（`swagger:bundle` + `api-client generate`），並說明可用 `swagger:check` 確認
- [x] 2.3 `.claude/settings.json` 註冊為 Stop hook
- [x] 2.4 **反向驗證**：改 `auth/login.yaml` 不重跑 → exit 2 並列出變更檔與解法指令；重跑 bundle 後 → exit 0；未動 swagger → exit 0
- [x] 2.5 還原所有探針，`git status` 須乾淨

## 3. compose.verify.yml 本機重現 CI

- [x] 3.1 新增 `compose.verify.yml`：mysql 9 + healthcheck + `tmpfs: /var/lib/mysql`，環境變數對齊 CI 的 e2e job
- [x] 3.2 `package.json` 新增 `verify:ci`（起容器 → 跑 e2e → 收容器）
- [x] 3.3 實際執行：144 tests 全過，**總耗時 62 秒**（含容器啟動），用完全獨立的容器 DB（`hexagonal_verify_test`）
- [x] 3.4 GitLab services 不支援 compose 的 healthcheck 語法，保留手動等待並在註解說明兩邊差異

## 4. AGENTS.md 與規則標註

- [x] 4.1 `AGENTS.md -> CLAUDE.md` symlink 建立並確認可讀到同一份內容（git add 受權限限制未執行，commit 時會記為 mode 120000）
- [x] 4.2 12 條 Hard Rules 全數標註：**5 條有機器守（型別 / 測試 / lint）、7 條靠自律**——這個比例本身就是有用的資訊
- [x] 4.3 `openspec/project.md` 補一節說明 `.agents/` 的用途與新增 hook 的作法
- [x] 4.4 `tasks/todo.md` 更新「CI 無法本機驗證」那條（範圍縮小為 runner / cache 行為）
- [x] 4.5 完整驗證鏈：typecheck ✓ / lint ✓ / 234+24+29 ✓ / e2e 144 ✓ / build ✓ / swagger:check ✓
