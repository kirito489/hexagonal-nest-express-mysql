> 每一塊（`##` 標題）須能獨立通過驗證鏈：
> `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter @app/api test:e2e && pnpm build && pnpm --filter @app/api swagger:check`
> 綠燈後給 commit 指令，由使用者手動執行，再進下一塊。
>
> 〔檔頭補寫於 2026-08-16 的 openspec 慣例整理。驗證鏈取自本檔各塊當時實際記錄的結果，塊與任務內容維持原樣未改。〕

## 1. 路由層級架構測試

- [x] 1.1 `apps/api/package.json` 將 `js-yaml` 加入 devDependencies（已存在於 lockfile，為 swagger-cli 傳遞依賴），並補 `@types/js-yaml`
- [x] 1.2 `test/architecture/allowlist.ts` 新增 `SWAGGER_EXEMPT_ROUTES`：`GET /api/health`、`GET /api/health/ready`（理由：監控用途，不屬對外 API 契約）
- [x] 1.3 新增 `test/architecture/swagger-sync.spec.ts`，實作路由正規化（`:param` → `{param}`、併上 servers 的 base path、去重複斜線）
- [x] 1.4 規則一：controller 路由都必須宣告於來源 yaml（套用豁免清單）
- [x] 1.5 規則二：來源 yaml 的 paths 集合 = `openapi.bundle.yaml` 的 paths 集合
- [x] 1.6 規則三：bundle 的 paths 集合 = `api-client/src/schema.ts` 的 `paths` key 集合
- [x] 1.7 三條規則各加「掃描數 > 0」自我檢查；失敗訊息須提示對應指令（`swagger:bundle` / `generate`）與「內容層級請另跑 swagger:check」
- [x] 1.8 豁免過期檢查：豁免的路由若已不存在於 controller，測試須失敗
- [x] 1.9 **反向驗證**：探針 1（controller 加未寫文件路由）→ 規則一紅；探針 2（來源 yaml 加 path）→ 規則二紅；探針 3（bundle 加 path）→ 規則二 + 三皆紅；三次還原後 `git status` 皆乾淨

## 2. 內容層級檢查指令

- [x] 2.1 新增 `apps/api/scripts/check-swagger-sync.ts`：於 `os.tmpdir()` 建暫存目錄產生 bundle 與 client 型別，與現有產物逐字比對
- [x] 2.2 `apps/api/package.json` 新增 script `swagger:check`
- [x] 2.3 失敗訊息區分「產物過期（請跑 swagger:bundle + generate）」與「工具執行失敗」
- [x] 2.4 **驗證不污染工作目錄**：執行後 `git status --short apps/api/docs packages/api-client` 無輸出，暫存目錄以 `finally` 確保清除
- [x] 2.5 **反向驗證（互補性實證）**：改 `auth/login.yaml` 的 summary（內容變、路由不變）→ `swagger:check` exit 1 並精準指出 `openapi.bundle.yaml` 過期，同時架構測試 20 全綠 —— 證明兩層檢查各司其職

## 3. 文件與收尾

- [x] 3.1 `openspec/project.md` 的 Swagger 章節補三段轉換鏈與兩層檢查的分工
- [x] 3.2 `CLAUDE.md` 的 Pre-Change Checklist 第 5 點改為引用 `swagger:check`
- [x] 3.3 `tasks/lessons.md` 記錄「OpenAPI yaml 不可用 regex 解析」
- [x] 3.4 完整驗證鏈：typecheck ✓ / lint ✓ / 234 單元 + 20 架構 ✓ / e2e 138 ✓ / build ✓ / swagger:check ✓
