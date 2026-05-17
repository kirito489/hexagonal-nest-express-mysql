## Context

`apps/web/` 目前狀態：login 頁與一個空殼 home。`@app/api-client` 已可從 OpenAPI 推導 `/api/members*` 全部型別。TanStack Query、react-hook-form、zod、TanStack Table、lucide 都已安裝。後端 endpoint 與 OpenAPI 文件已驗證並對齊。

本次是 starter pack 第一個產品功能，pattern 會被未來 roles / security 等模組複製。

## Goals / Non-Goals

**Goals：**

- 完整跑通「DataTable + 分頁 + 搜尋 + Dialog form + URL state + 權限可見性 + Toast」整條鏈，作為後續模組範本。
- 使用既有 `@app/api-client` hooks，**不再**手寫 fetch；型別錯誤要在 IDE 就能看到。
- 純前端 change：所有後端 endpoint 既有，OpenAPI bundle 不重打。
- 表格的版型、互動與錯誤處理建立明確 convention，未來新模組能 copy。

**Non-Goals：**

- 不導入新狀態管理函式庫（zustand / redux），TanStack Query + URL query 已足。
- 不導入伺服器端 CSV / Excel 匯出。
- 不做 bulk 操作（多選 + 批次啟用 / 停用 / 刪除），未來真有需要再加。
- 不導入 i18n 框架（UI 文字繼續繁中 hardcode）。
- 不做使用者頭像 / 上傳照片功能。
- 不導入 form library 抽象層（如 react-hook-form-mui），維持 shadcn `Form` + `useForm` 直接組合。

## Decisions

### D1：路由策略 — 單一 `/members` + Dialog

- **選擇**：`/members` 一條路由，create / edit 都用 shadcn `Dialog` modal。
- **替代方案**：`/members/new` + `/members/:id/edit` 拆三條路由；或 shadcn `Sheet` (drawer) 並排顯示。
- **理由**：admin 5 欄表單偏小，dialog 不需離開列表；保留分頁 + 搜尋上下文，UX 順暢。Edit 也用 dialog，狀態靠 URL query `?edit=<uuid>` 同步（可分享連結）。

### D2：表格 — TanStack Table + shadcn Table 自組

- **選擇**：用 TanStack Table 的 `useReactTable` + 自寫一份共用 `DataTable` 元件落地於 `components/data-table/`，渲染走 shadcn 的 `Table` 系列原語。
- **替代方案**：直接套 shadcn registry 的 `data-table` block；或用 AG Grid / TanStack Table 完整版。
- **理由**：shadcn 官方 DataTable 是「教學範例」，每個專案會有自己的需求差異（pagination 行為、操作欄等），直接抄一份放進 codebase 比每次裝一個 block 維護成本低。

### D3：URL state — query string only，pathname 不變

- **狀態**：`page`、`limit`、`name`、`email`、`edit`（編輯中的 member id）放 URL query。
- **替代方案**：用 path param（如 `/members/page/2`）或 client-only state。
- **理由**：query string 對「列表頁面」最自然，瀏覽器上一頁/下一頁能保留，分享連結有意義。`edit=<uuid>` 同時做為 dialog 開關，重整也能延續編輯狀態。

### D4：搜尋 debounce 300ms

- **選擇**：用 `useDebouncedValue` hook（自寫 ~10 行）。
- **替代方案**：lodash.debounce、`use-debounce` 套件、立即觸發無 debounce。
- **理由**：避免引入額外依賴。300ms 是常見體感「不滯後又不暴打 API」的甜蜜點。

### D5：權限可見性 — runtime 檢查 `member.permissions`

- **選擇**：寫一個 `useHasPermission(code: string)` hook 讀 React Router 的 `loaderData` 或從 TanStack Query 拿到的 me cache；無 `BACKEND:ACCOUNT:EDIT` 時：新增按鈕 disabled、列上 dropdown menu 不顯示「編輯/刪除」。
- **理由**：後端是真的權限來源（401/403 仍會擋下），前端做這層只是 UX 預防誤點。

### D6：Toast — `sonner`

- **選擇**：shadcn 官方推薦的 `sonner`（從 shadcn `add sonner` 安裝）。`App.tsx` 全域掛 `<Toaster />`，page 端透過 `toast.success(...)` / `toast.error(...)` 呼叫。
- **替代方案**：shadcn 自己的舊 `toast` 元件（已被 sonner 取代）、react-hot-toast。
- **理由**：與 shadcn 生態最對齊，無聞無問題、無 reducer 樣板。

### D7：Mutation 後的快取一致性

- **策略**：
  - Create / Update / Delete 成功後 → `queryClient.invalidateQueries({ queryKey: ['GET', '/members'] })` 重抓 list
  - Status toggle → optimistic update：先改 list cache 的 `status`，失敗 rollback + toast 報錯
- **理由**：對 list 表格而言 invalidate 比 manual update cache 簡單可靠；optimistic 用在 toggle 因為頻率高且失敗罕見。

### D8：API client query key 慣例

- TanStack Query 的 queryKey 由 `useApiQuery` factory 統一產生為 `[method, path, init]`，調用端不自訂 key。
- Mutation invalidate 用 `['GET', '/members']` 為 prefix 一次 invalidate 所有 page/search 變體。

### D9：刪除確認 — 簡單 AlertDialog

- 一行說明 + 兩個按鈕（取消 / 確認刪除），不需 type-to-confirm。後端是軟刪除可恢復，無需高摩擦。

### D10：表單欄位設計

- **新增**：email（required）/ 名稱（required）/ 密碼（required, 8-30 字元）/ 角色（select required）/ 狀態（default true）
- **編輯**：email / 名稱 / 密碼（**選填，空字串不改**）/ 角色 / 狀態
- 角色選項從 `GET /members/role/options` 拉，cache key `['GET', '/members/role/options']`，TanStack Query 的 staleTime 設較長（10 分鐘）。

### D11：列上 Status Switch 行為

- 點 Switch 即時觸發 `PATCH /members/:id`，body 帶當前所有欄位 + 翻轉的 status。
- 因為 PATCH 是「整包替換」（spec 看 update DTO 全欄位 required），所以前端要先 cache 該 row 的完整資料；最簡單的做法是把當前 row 物件直接展開塞進 PATCH body。
- 失敗 → optimistic rollback + toast。
- 同樣的列若被使用者自己（actor.sub === row.id）切換 status，後端有 `CannotDisableSelfException` 會擋；前端先檢查並把 Switch disabled。

## Risks / Trade-offs

- **[Risk] PATCH 全欄位 required → Switch toggle 必須帶完整 body**：前端要小心 row 資料來源（list response 是否含所有 PATCH 必要欄位）。**Mitigation**：實作前驗證 list endpoint 回的 row shape 與 PATCH 必填欄位對齊；若缺，list 增加欄位（後端調整）或先 GET 單筆後再 PATCH（兩次往返）。傾向前者。
- **[Risk] URL `edit=<uuid>` 重整時 dialog 自動開啟**：若該 uuid 已被刪除 / 使用者沒權限，dialog 應 graceful close + toast。
- **[Risk] Sonner 與 shadcn theme 不一致**：sonner 是獨立 lib，主題 token 對齊需要設定。**Mitigation**：跟著 shadcn add sonner 的 default 設定走，不另外客製。
- **[Trade-off] 不切 `/members/new` 路由** → 失去獨立深連結；但 starter pack 一致性 > 個別頁面便利。
- **[Trade-off] 自寫 DataTable 而非用 shadcn block** → 多一次性投入 ~200 行，換來可維護性。
- **[Trade-off] 全頁 invalidate 而非 partial cache update** → 多一次 fetch，但邏輯簡單可靠。

## Migration Plan

純前端新增功能，無 migration / rollback 顧慮。任務分四階段執行，每階段獨立可驗證：

1. **基礎建設**：shadcn 元件、`Toaster` 掛載、`useDebouncedValue` / `useHasPermission` hooks、`DataTable` 共用元件。
2. **資料層**：query / mutation hooks（list、create、update、delete、role options）、URL state 同步 hook。
3. **頁面與 dialog**：`/members` 列表 + 兩個 dialog（create/edit 共用、delete 確認）。
4. **整合**：Sidebar 連結、權限可見性、`pnpm dev` 手動驗證 + Vitest spec。

回退策略：如任一階段 typecheck / lint / test 失敗，`git revert` 該階段 commit 即可（不影響後端）。

## Open Questions

- 列表頁的「最後登入時間」欄位是否要顯示「N 分鐘前」相對時間？傾向：是，但加 hover tooltip 顯示絕對時間（不導入 dayjs 之外的 lib，已有 `dayjs` from `@app/api`，但前端沒有）— **暫定**：用原生 `Intl.RelativeTimeFormat` 處理，避免引入 dayjs 到前端。
- 是否需要「重設密碼」按鈕？目前編輯 dialog 內密碼欄位即可達成；列上不額外加。
- 排序需求：先不做（後端 list endpoint 也沒支援），未來真需要時前後端同步加。
