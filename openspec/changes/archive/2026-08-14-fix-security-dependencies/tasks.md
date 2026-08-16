> 每一塊（`##` 標題）須能獨立通過驗證鏈：
> `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter @app/api test:e2e && pnpm build && pnpm --filter @app/api swagger:check`
> 綠燈後給 commit 指令，由使用者手動執行，再進下一塊。
>
> 〔檔頭補寫於 2026-08-16 的 openspec 慣例整理。驗證鏈取自本檔各塊當時實際記錄的結果，塊與任務內容維持原樣未改。〕

## 1. 修復 overrides 機制

- [x] 1.1 **實作中修正**：pnpm 10+ 起 overrides 要放 `pnpm-workspace.yaml`（先試 root `package.json` 的 `pnpm.overrides`，lockfile 沒出現 `overrides:` 區塊 → 證實無效）
- [x] 1.2 移除 `apps/api/package.json` 中無效的 `overrides`
- [x] 1.3 驗證生效：lockfile 出現 `overrides:` 區塊，`@hono/node-server` 由 1.19.11 → 1.19.17。**range 由 `>=` 改為 `^`** —— `>=1.19.15` 無上界導致 pnpm 拉到 2.1.0（major 跳躍，可能與上游 prisma 不相容）

## 2. 直接依賴升級

- [x] 2.1 `js-yaml` 升到 `>=4.3.0`（本輪 add-swagger-sync-guardrail 引入的版本帶 high 漏洞）
- [x] 2.2 `vite` 升到 `>=8.0.16`
- [x] 2.3 `nodemailer` 升到 `>=9.0.1`（major；影響面僅 `NodemailerEmailAdapter.ts`）
- [x] 2.4 確認升級後實際安裝版本符合預期

## 3. 驗證與收尾

- [x] 3.1 完整驗證鏈全綠：typecheck ✓ / lint ✓ / 234+20+29 測試 ✓ / e2e 138 ✓ / build ✓（vite 8.2.1）/ swagger:check ✓（js-yaml 4.3.1）
- [x] 3.2 漏洞 **85 → 77**（high 36→34、moderate 42→38；critical 2 個未變，屬深層傳遞依賴）
- [x] 3.3 `openspec/project.md` 註明 overrides 必須放 root 並附驗證方式
- [x] 3.4 `tasks/todo.md` 記錄「剩餘傳遞依賴漏洞」為已知狀態
- [x] 3.5 `tasks/lessons.md` 記錄「pnpm overrides 只在 root 生效」
