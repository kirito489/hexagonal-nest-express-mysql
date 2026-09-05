> 每一塊（`##` 標題）須能獨立通過驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`。
> 全部完成後給**一個** commit 指令，由使用者手動執行。
>
> **塊的依賴**：
> - 塊 1（權限碼常數）先做，塊 2、3 都引用它。
> - 塊 4（守則）必須排在 2、3 之後——提前寫會是紅的，而那不是「抓到缺陷」只是順序錯了。
>
> ⚠️ **本 change 不動後端行為**。真正的授權在 `PermissionsGuard` / `RolesGuard`，
> 前端這層是 UX。唯一動到 `apps/api` 的是新增一支守則測試。

## 1. 權限碼型別化

- [x] 1.1 新增 `apps/web/src/lib/permission-codes.ts`：`PERMISSION_CODE` 常數 + `PermissionCode` 型別，比照 `role-codes.ts` 的形狀
- [x] 1.2 只收前端用得到的碼（ACCOUNT / ROLE 的 VIEW 與 EDIT）——`BACKEND:ATTACHMENT:EDIT` 前端沒有對應頁面，收進來只會讓人以為有
- [x] 1.3 檔頭警告**必須維持字面物件的寫法**：守則用正規式讀值（跨 workspace 的 import 在 api 的 jest 設定下解不到 web 的路徑別名）
- [x] 1.4 `NavItem.requiredPermission` 型別由 `string` 收緊為 `PermissionCode`，`_nav-items.ts` 改引用常數
- [x] 1.5 `members/page.tsx`、`roles/page.tsx` 的裸字串（`PERM_VIEW` / `PERM_EDIT`）改引用常數

## 2. 「沒有權限」的統一呈現

- [x] 2.1 新增 `NoPermissionNotice`：狀態 + 出路 + **缺少的權限碼**
- [x] 2.2 就地渲染，不導頁也不做 `/403` 路由（design D5——導頁會讓返回鍵回到沒權限的網址再被踢一次）
- [x] 2.3 `RequireRole` 改用同一個呈現（**行為變更**：靜默導頁 → 顯示訊息），移除 `fallback` prop
- [x] 2.4 單元測試：有無 `required` 兩種渲染

## 3. `RequirePermission` 與路由掛載

- [x] 3.1 新增 `RequirePermission`，形狀比照 `RequireRole`（包在 `element` 外，不做 HOC 或 route config）
- [x] 3.2 載入中不渲染，避免先閃出頁面再被換掉
- [x] 3.3 `App.tsx` 的 `/members`、`/roles` 掛上守衛
- [x] 3.4 單元測試：有權限渲染 children、無權限顯示說明、載入中不渲染
- [x] 3.5 `RequireRole` 的既有行為若有測試，確認它反映新行為（行為變更是知情的，不是搬錯）

## 4. 守則（必須排在 2、3 之後）

- [x] 4.1 新增 `apps/api/test/architecture/permission-codes-sync.spec.ts`（放 api 側：前端守則用 `import.meta.glob` 讀不到 `apps/api`，見 design D6）
- [x] 4.2 「每個前端權限碼都必須存在於後端目錄」
- [x] 4.3 「路由與 sidebar 對同一 path 的權限碼必須一致」＋「sidebar 宣告了權限的 path 不得沒有守衛」
- [x] 4.4 **先把 `App.tsx` 切成單條 `<Route` 區塊再解析**——跨區塊的正規式會吃到下一條路由的守衛宣告，於是那條路由本身反而沒被比對到
- [x] 4.5 「掃描範圍有效」：讀得到檔案、解出的碼數量大於零、後端目錄非空——否則正規式一失效就靜默空轉成全綠
- [x] 4.6 **反向驗證**：(a) 前端權限碼打錯一個字 → 4.2 那條紅；(b) 拿掉 `/members` 的守衛 → 4.3 那條紅並說「隱藏不是保護」；(c) 把 sidebar 與路由的碼改成不同 → 4.3 那條紅。逐一還原
- [x] 4.7 `openspec/project/testing.md` 的規則表補這一支

## 5. 驗證與收尾

- [x] 5.1 `pnpm typecheck && pnpm lint && pnpm test:cov`、`pnpm build`，貼出實際輸出（前端行為變更不影響 e2e，但仍跑一次確認沒波及）
- [ ] 5.2 ⏸ 前端畫面待使用者實機確認（需 `pnpm dev`）：以非 SUPERADMIN 手動輸入 `/security/*` 與 `/members`，確認顯示說明而非彈回首頁
- [x] 5.3 更新 `tasks/todo.md`：勾掉 C6b，並註明 `RequireRole` 的行為變更
- [x] 5.4 新踩到的坑寫進 `tasks/lessons.md`
