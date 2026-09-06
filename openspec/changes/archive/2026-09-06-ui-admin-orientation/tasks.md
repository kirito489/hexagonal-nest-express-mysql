> 每一塊（`##` 標題）須能獨立通過驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`。
> 全部完成後給**一個** commit 指令，由使用者手動執行。
>
> ⚠️ **本 change 改了 `PERMISSION_CATALOG` 的 `name`，部署需重跑
> `pnpm --filter @app/api db:seed`**（upsert，重跑安全）。
> **忘了跑的症狀**：權限樹的群組標題是「管理者帳號」，項目名卻還是
> 「後台-帳號管理-檢視」——因為項目名讀的是 DB 的值。
>
> ⚠️ **不新增前台會員管理**。藍本的分組問題來自它有兩個帳號體系，
> 本模板前台側只有 `ping`，那個問題不存在。

## 1. 命名統一為「管理者帳號」（四處）

- [x] 1.1 `shared/constants/permissions.ts`：「後台-帳號管理-*」→「後台-管理者帳號-*」
- [x] 1.2 `routes/roles/lib/permission-labels.ts`：`MODULE_LABELS.ACCOUNT` → 管理者帳號
- [x] 1.3 `routes/_nav-items.ts`：label「會員管理」→「管理者帳號」
- [x] 1.4 `routes/members/page.tsx`：`PageHeader` 標題改「管理者帳號」，**副標一併檢查**（原本寫「管理後台帳號…」，與舊標題矛盾）
- [x] 1.5 **grep 全 repo** 確認沒有殘留的「會員管理」指涉後台帳號（含 README 與 openspec 文件）
- [x] 1.6 更新 `permission-labels.test.ts` 的斷言

## 2. Sidebar 分組

- [x] 2.1 group「使用者與權限」→「管理者與權限」
- [x] 2.2 確認「安全」group 不動（它已經是依對象切的）

## 3. 首頁

- [x] 3.1 拿掉佔位卡片（「管理後台骨架已建立完成…」）——那些模組全部接完了
- [x] 3.2 拿掉「示範：呼叫 /me…」的註解——它在說這段是暫時的，而它已經是正式的
- [x] 3.3 保留個人資料卡（Sidebar 給不了的東西）
- [x] 3.4 **不放功能捷徑**：Sidebar 常駐且不可收起，再列一次是純粹的重複
- [x] 3.5 **不做假的營運摘要**：模板沒有任何統計端點，硬做出來的數字是騙人的（design D3）
- [x] 3.6 單元測試：個人資料有渲染、**沒有描述開發進度的文字**、沒有功能捷徑清單

## 4. 驗證與收尾

- [ ] 4.1 ⏸ **重跑 `pnpm --filter @app/api db:seed`——本機無法代跑**：`hexagonal_express_db` 這個 dev 庫在這台機器上不存在（`prisma migrate status` 回 `P1003: Database does not exist`），e2e 能跑是因為它的 globalSetup 自建 `*_test` 庫。需使用者先備妥 dev 庫再跑
- [x] 4.2 `pnpm typecheck && pnpm lint && pnpm test:cov`、`pnpm build`，貼出實際輸出
- [x] 4.3 e2e 跑一次——`PERMISSION_CATALOG` 的 `name` 有被 seed 與守則讀取
- [ ] 4.4 ⏸ 前端畫面待使用者實機確認（需 `pnpm dev`）：sidebar 分組、權限樹四處用字一致、首頁
- [x] 4.5 更新 `tasks/todo.md`：勾掉 C6d，**修正 C6c 那條「側邊欄與目錄本來就一致」的錯誤敘述**
- [x] 4.6 新踩到的坑寫進 `tasks/lessons.md`
