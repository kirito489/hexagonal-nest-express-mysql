## Why

前端 admin SPA 目前只有 `/login` + `/`（首頁佔位卡片），沒有任何真實業務頁面。後端 `/api/members` 一族 endpoint（list / create / get / update / delete + role options）已完整，是規模適中、可一次跑通「DataTable + Dialog form + 權限 + URL state + Toast」整條鏈的最佳「starter pack 第一個產品功能」。完成後其他模組（roles、security 等）能直接複製此 pattern。

## What Changes

- 新增 `apps/web/src/routes/members/`：以 `/members` 為列表頁，create/edit 走 shadcn `Dialog` modal、delete 走 `AlertDialog`、列上有 `Switch` 即時切換啟用狀態。
- DataTable 以 TanStack Table + shadcn `Table` 元件組成，**6 欄**：名稱 / Email / 角色 / 狀態（Switch）/ 最後登入時間 / 操作（dropdown）。
- 分頁 / 搜尋狀態 **同步到 URL query string**（`?page=1&limit=10&name=...&email=...`），重整與分享連結保留狀態。
- 搜尋輸入 **debounce 300ms** 後送請求，避免按鍵爆 API。
- 全域 **Sonner toast** 取代各頁手寫錯誤訊息；mutation 成功失敗統一回饋。
- Sidebar 加「會員管理」選項，連到 `/members`，覆寫既有 `_layout.tsx` 的單一首頁項。
- 權限檢查：使用者沒有 `BACKEND:ACCOUNT:EDIT` 權限時，「新增」按鈕與列上「編輯 / 刪除」會 disabled / 隱藏；沒有 `BACKEND:ACCOUNT:VIEW` 直接導向 `/`。
- 後端不動：所有 endpoint 沿用既有，僅消費 `@app/api-client` 的型別。

## Capabilities

### New Capabilities

- `ui-member-management`：apps/web 的會員管理介面（list / search / paginate / create / edit / delete / toggle status）的功能需求與互動規格。

### Modified Capabilities

- `platform-frontend-conventions`：補充三條既有 admin SPA 的延伸要求 — URL state 同步分頁與搜尋、Sonner toast 全域回饋、Sidebar 多項目導航與權限可見性控制。

## Impact

- **新增 shadcn 元件**：`dialog`、`alert-dialog`、`select`、`switch`、`dropdown-menu`、`table`、`sonner`（透過 `pnpm dlx shadcn@latest add ...`）。
- **新增 npm 依賴**：可能需要 `sonner`、`@radix-ui/*`（多由 shadcn add 自動安裝）。
- **既有檔案異動**：
  - `apps/web/src/App.tsx`：加 `/members` 路由、加 `Toaster` 元件
  - `apps/web/src/routes/_layout.tsx`：Sidebar 增加會員管理項目，依權限決定可見性
  - `apps/web/src/api/client.ts`：可能補一個 query key helper（如果走自定 retry / invalidate 策略）
  - `apps/web/src/components/ui/`：shadcn add 進來的 7 個元件檔
- **無後端異動**：endpoint 與 OpenAPI schema 維持原樣。
- **路由結構**：純 `/members`（list + 內嵌 dialog），不切 `/members/new` / `/members/:id`；URL state 只放 query string，pathname 不變。
- **不導入額外狀態管理**：TanStack Query 既有 cache + URL query 已足，不引入 zustand / redux。
