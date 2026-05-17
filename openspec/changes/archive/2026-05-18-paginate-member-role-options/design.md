## Context

`MemberFormDialog` 的角色欄位目前是 shadcn `Select`，渲染由 `GET /api/members/role/options` 一次取回的全部角色。前一個 change（add-role-management-page）已建立角色 CRUD 與 `isDefault` 旗標；後端 `LoadRolePort.listActiveRoles` 是一次性查詢，無分頁。為支援未來「角色數量持續成長」情境，需要：

- 後端把該 endpoint 升級成分頁 + 名稱搜尋；shape 與既有 `/api/members`、`/api/roles` 對齊（`{ list, meta }`）
- 前端把 Select 換成 cmdk Combobox + `useInfiniteQuery` 無限下滑 + 搜尋
- 編輯既有 member 時，roleId 可能不在第一頁，需要 fallback fetch 補入該角色資訊

本 change 純功能升級，不動 DB schema、不動權限模型、不動 member 其他欄位行為。

## Goals / Non-Goals

**Goals：**

- 讓 `GET /api/members/role/options` 從一次性 list 升級為分頁；前端 dropdown 由 cmdk Combobox 取代 Select，可搜尋、可滾載。
- 編輯既有 member 時即使 roleId 不在第一頁仍能正確顯示既有角色名與 disabled 行為。
- 沿用既有：`isDefault=true` → disabled 顯示「（預設）」（與角色列表 badge 一致）、staleTime 10 分鐘、權限 `BACKEND:ACCOUNT:VIEW`。
- 為未來其他模組（如審核人選、商品分類選擇）建立「分頁 + 無限下滑下拉」可複用範例。

**Non-Goals：**

- 不改動 `/api/roles` 與 `/api/roles/permissions`（角色頁已分頁、權限頁不需分頁）。
- 不重寫 `member-management-ui` 其他 Dialog 欄位（Email / 名稱 / 密碼 / 狀態 / 即時切換）。
- 不引入新的全域元件抽象層；`RoleCombobox` 落地於 `routes/members/components/`，等真有第二個使用者再上提到 `components/`。
- 不引入 virtual scroll 函式庫；單頁 20 筆 + intersection observer 已足。
- 不導入 cursor-based pagination；offset 分頁與既有 `/api/members`、`/api/roles` 一致。

## Decisions

### D1：後端 endpoint shape — 對齊現有分頁 convention

- **選擇**：`GET /api/members/role/options?page=&limit=&search=`，response `{ success, data: { list: RoleOption[], meta: { page, limit, total, totalPages } }, timestamp }`。
- **替代方案**：cursor-based（`?cursor=...&limit=...`）；keep flat array + 前端硬切片。
- **理由**：與 `/api/members`、`/api/roles` 一致，前端 `useInfiniteQuery` 用同樣 `getNextPageParam` 推導；後端 Prisma 直接套 `skip` / `take`。

### D2：Port 簽章 — 修改而非新增方法

- **選擇**：把 `LoadRolePort.listActiveRoles()` 直接擴成 `listActiveRoles(params: { page, limit, search? }): Promise<{ list, total }>`。
- **替代方案**：新增 `listActiveRolesPaged()` 並保留舊方法；舊方法呼叫端逐一遷移。
- **理由**：呼叫端只有一個（`ListRoleOptionsService`），直接改簽章成本低、avoid dead code。**Risk**：所有 mock 此 port 的 spec（member 相關）都要同步補新簽章 — 已盤點 4 個 spec 需動。

### D3：Fallback option fetch — 新增 `LoadRolePort.findActiveRoleOption(id)`

- **選擇**：在 port 新增 `findActiveRoleOption(id: string): Promise<RoleOption | null>`，前端 dialog 開啟編輯模式且 `roleId` 存在時並列觸發，把結果合併進 Combobox 的 options 列表頭。
- **替代方案**：（A）復用既有 `findRoleById`，但回傳結構不同（含 `roleCode` 而非 `isDefault`）；（B）前端從 `GET /api/roles/:id` 抓 — 但那要 `BACKEND:ROLE:VIEW` 權限，會員管理者未必有。
- **理由**：保持 endpoint 權限模型一致（仍用 `BACKEND:ACCOUNT:VIEW`），fallback 走同一個權限脈絡。新增 endpoint 還是同一個 path：`GET /api/members/role/options/:id`（單筆）— 對比 list endpoint 路徑一目了然。

### D4：前端 Combobox 元件 — cmdk + popover 自組

- **選擇**：用 shadcn `add command popover` 加入 cmdk 與 Radix Popover；自組 `RoleCombobox.tsx`，內含 `<Popover>` + `<Command>` + `<CommandInput>` + `<CommandList>` + `<CommandItem>`。
- **替代方案**：（A）`react-select` async paginate — 引入新依賴 + 風格不一致；（B）`headlessui Combobox` — 風格與 shadcn 不一致。
- **理由**：cmdk 是 shadcn 預設選單元件，與既有 shadcn theme 對齊；可控性高（自寫 sentinel + IntersectionObserver）。
- **互動規格**：點擊欄位開啟 popover；popover 內含搜尋輸入；下拉可滾動，到底時觸發 fetchNextPage；點選後關閉 popover 並寫回表單 value。

### D5：useInfiniteQuery 與 sentinel

- **選擇**：`useInfiniteQuery({ queryKey: ['GET', '/members/role/options', search], queryFn: ({ pageParam = 1 }) => ..., getNextPageParam })`。每頁 limit=20。
- **sentinel**：在 `CommandList` 最後一個 item 後放一個 `<div ref={sentinelRef} />`，用 IntersectionObserver 觀察；進入視窗時若 `hasNextPage && !isFetchingNextPage` → `fetchNextPage`。
- **搜尋 reset**：debounce 300ms 後寫入 query key，TanStack Query 自動 reset infinite query；不需手動 `removeQueries`。

### D6：編輯模式 fallback option

- **行為**：dialog mode === 'edit' 且 form initial `roleId` 存在時，並列觸發 `useApiQuery('GET', '/members/role/options/{id}', ...)`，把結果合併進 Combobox 顯示清單頂端（避免重複，由 `id` 去重）。
- **edge case**：若 fallback fetch 失敗（404 = 角色被刪 / 變不啟用），Combobox 仍顯示 roleId 但無 label（顯示 `(未知角色)` placeholder）；提交時前端不擋（後端 update DTO 會自動處理）。
- **替代方案**：（A）載入時把整份 active roles 拉回作 lookup — 違背「分頁」初衷；（B）直接顯示 uuid — UX 差。
- **理由**：分頁後不可避免會遇到「初值不在當前頁」，fallback 是必要的 graceful UX；額外 1 次 lightweight fetch，cache 在 TanStack Query 內。

### D7：搜尋輸入 debounce

- **選擇**：沿用 `useDebouncedValue(input, 300)`；debounce 後值寫進 infinite query key，自動觸發新 query。
- **後端 search 實作**：`where: { ..., ...(search ? { name: { contains: search } } : {}) }`，與 `listRoles` 一致。
- **空字串行為**：search='' 表示「不過濾」；後端 zod schema 用 `.trim().optional()` 處理。

### D8：MemberFormDialog 整合

- **變動點**：把目前 `<FormField name="roleId">` 內的 `<Select>` 區塊換成 `<RoleCombobox value={field.value} onChange={field.onChange} editingRoleId={mode === 'edit' ? initialValues?.roleId : undefined} />`。
- **不變的**：表單 schema（`roleId: z.string().uuid()`）、submit handler、role 欄位的權限可見性檢查。

### D9：後端 spec / unit / e2e 覆蓋

- **Unit spec 新增**：`ListRoleOptionsService.spec.ts` 覆蓋
  - 預設 page=1 / limit=20 → port 收到正確 params
  - 明確指定 page / limit / search → port 收到對應參數
  - 回應 shape `{ list, meta: { page, limit, total, totalPages } }`
- **E2E 補測**：`member.e2e-spec.ts` 的 `describe('GET /api/members/role/options')` 新增
  - 「分頁回應 shape 200」、「指定 page / limit 200」、「search 命中 200」、「無 token 401」、「無 VIEW 權限 403」
  - 新 endpoint `GET /api/members/role/options/:id`：「找到 200」、「找不到 404」

### D10：shadcn 新元件

- `pnpm dlx shadcn@latest add command popover` 加入 cmdk 與 Popover（若未在）。
- 預期新增 `@radix-ui/react-popover` 與 `cmdk` 兩個 npm 依賴。

## Risks / Trade-offs

- **[Risk] port 簽章修改影響 4 個 mock spec**：`CreateMemberService.spec.ts` / `UpdateMemberService.spec.ts` / 等都 mock `LoadRolePort`，舊 mock 形狀（`listActiveRoles: jest.fn()`）仍能編譯但回傳值要改成 `{ list, total }`。**Mitigation**：批次改 mock；任務拆出 `Update LoadRolePort mocks` 一步。
- **[Risk] fallback fetch 失敗（角色已刪 / 停用）→ Combobox 顯示空 label**：使用者編輯時看不出當前角色是什麼。**Mitigation**：顯示 `(已停用 / 不可用)` placeholder 並提示需重新指派；後端 update 仍走原流程。
- **[Risk] cmdk 與 IntersectionObserver 整合 edge case**：popover 開啟時 sentinel 不在 viewport（一進來就觸發 fetch），或關閉再開時 observer 被重置。**Mitigation**：observer 在 popover open 時建立、close 時 disconnect；sentinel 加 `data-testid` 方便手動驗證。
- **[Trade-off] 改 port 簽章而非新增方法** → 一次性 mock 改動成本，但日後維護面積小。
- **[Trade-off] fallback 走獨立 endpoint（`/members/role/options/:id`）** → 多一條 endpoint，但權限模型統一、不需借用 `/api/roles/:id`。
- **[Trade-off] 不導入 react-select** → 自寫 ~200 行 Combobox，但與既有 shadcn pattern 一致；未來其他下拉也能複用。

## Migration Plan

純後端 endpoint shape 改變 + 前端 dialog 元件替換，不涉及 DB / 權限 / 路由。階段：

1. **後端 endpoint 升級**：port 改簽章 + service / facade / controller / zod schema + Swagger + api-client 重打；mock spec 同步更新；unit / e2e 補測。
2. **新增 fallback endpoint**：port 加 `findActiveRoleOption` + service + controller + Swagger。
3. **前端 shadcn 元件**：add command / popover。
4. **前端 hooks**：`useRoleOptionsInfiniteQuery` + `useRoleOptionFallbackQuery`。
5. **前端 Combobox 元件**：`RoleCombobox.tsx`。
6. **替換 MemberFormDialog**：拔掉 Select，換成 Combobox；手動測試 create / edit / search / fallback。
7. **驗證**：typecheck / lint / test / e2e / build / 手動。

回退策略：後端 shape 改動是 breaking — 若上線後出狀況，需同步回滾前後端。建議一次 PR / 一次 commit 不分批 deploy。

## Open Questions

- **是否需要支援多欄位搜尋（如同時 name + permissionCode）**：第一版只做 name；後端已可擴充。
- **`limit` 預設值**：第一版設 20。若使用者 hover dropdown 想一眼看到所有自訂角色，可以視 UX 反饋調整到 30 / 50。
- **`isDefault` 角色是否仍計入分頁 total**：是；total 反映所有可顯示角色（含 disabled 的系統角色），方便使用者得知整體量級。
