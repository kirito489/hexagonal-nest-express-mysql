## Context

`apps/web/` 已落地 `member-management-ui`（DataTable + Dialog + URL state + Optimistic + Sonner toast + 權限可見性），所有共用機制（`components/data-table/`、`useDebouncedValue`、`useHasPermission`、`useCurrentMember`、`format-relative-time`、shadcn `dialog/alert-dialog/switch/dropdown-menu/table/sonner` 元件、`Toaster` 全域掛載）皆已可用。後端 `/api/roles*` endpoints 與 `GET /api/roles/permissions` 已通並產生 `@app/api-client` 型別。

本次角色頁是 starter pack 第二個產品功能，主要驗證「能不能直接複製 member 模式」並補上專屬差異：

- **isDefault 受保護列** — 比照「自己那一列」處理（switch / edit / delete 全 disable）
- **memberCount 條件刪除** — 角色有人使用時前端先擋
- **Permission 多選表單** — 全新的互動類型（grouped checkbox 列表）

## Goals / Non-Goals

**Goals：**

- 沿用 `member-management-ui` 既有 pattern（DataTable + Dialog + URL state + Optimistic + 全頁 invalidate），不重造輪子。
- 引進「分組多選 checkbox」一個新表單元件，將其落地於可重用位置（`components/PermissionsField` 暫放 `routes/roles/components/` 即可；若未來其他模組要再多選類型權限可再上提）。
- 沿用既有 `Toaster`、`useCurrentMember`、`useHasPermission`、`useDebouncedValue`、`DataTable` / `DataTablePagination`。
- 純前端 change：所有後端 endpoint 既有，Swagger 與 `@app/api-client` 不重打。

**Non-Goals：**

- 不做 bulk 操作（多選角色批次啟用 / 停用 / 刪除）。
- 不做權限自訂（新增 / 編輯權限定義本身），權限清單來源僅來自 `GET /api/roles/permissions` 後端授權清單。
- 不做角色排序 / 拖拉。
- 不做歷史變更紀錄（誰改過、誰指派過哪個權限）。
- 不導入額外狀態管理函式庫。
- 不導入 i18n 框架。

## Decisions

### D1：路由策略 — 單一 `/roles` + Dialog

- **選擇**：`/roles` 一條路由，create / edit 都用 shadcn `Dialog`，URL `?edit=<uuid>` 同步編輯狀態。
- **理由**：與 `/members` 一致，pattern reuse；列表 + 表單同畫面對於 admin 工具最順。

### D2：表格欄位

- **選擇**：5 欄 — 名稱（含 `isDefault=true` 灰 badge「預設」）/ 使用人數 / 狀態（Switch）/ 建立時間 / 操作（dropdown）。
- **替代方案**：把「狀態」拿掉、只放編輯 / 刪除（最初提案傾向不顯示狀態欄）。
- **理由**：使用者明確要求 status 也要能像 member 那樣即時切，且 backend `Role` 確實有 `status` 欄位。沿用同一 optimistic pattern 即可，幾乎零額外成本。

### D3：`isDefault=true` 列「受保護」處理

- **行為**：Switch / 編輯 / 刪除三個操作全 disabled，hover tooltip 顯示原因（「預設角色不可變更狀態」 /「預設角色不可編輯」 /「預設角色不可刪除」）。
- **理由**：後端 `DefaultRoleNotDeletableException` / `DefaultRoleNotEditableException` 會擋下，前端僅做 UX 預防，比照 member 頁「actor 自己那一列」的處理方式建立一致心智模型（受保護列 → disabled + tooltip）。

### D4：`memberCount > 0` 列刪除限制

- **行為**：dropdown 內「刪除」disabled + tooltip「角色有 N 位使用者，請先移除才能刪除」。
- **理由**：後端 `RoleHasMembersException` 會擋，前端先以 UX 提示，避免使用者點下去才看到錯誤。`memberCount = 0` 時刪除按鈕正常啟用。

### D5：Permission 多選 UI — Grouped checkboxes（依 `platform → module`）

- **選擇**：把 `GET /api/roles/permissions` 回的陣列依 `platform`（BACKEND / FRONTEND...）分為 section，section 內依 `module`（ACCOUNT / ROLE / ...）分為 group，每個 group 列 `VIEW` / `EDIT` 兩個 checkbox；每個 group 加 group-level「全選 / 全不選」。
- **替代方案**：（A）Flat checkbox list — 項目多時找不到；（B）Transfer list 左右雙欄 — 多餘的 UI；（C）Tree multi-select — 引入新元件。
- **理由**：admin 工具最常見、最直覺；checkbox 是原生 form control，狀態管理簡單，react-hook-form 直接綁定即可。
- **資料結構**：表單 state 為 `permissionCodes: string[]`（順序不重要、提交前 sort 去重）；UI 內部從這個 array 衍生 `Set<string>` 做 O(1) 查找。
- **取值**：`GET /api/roles/permissions`，TanStack Query staleTime 30 分鐘（變化頻率很低）。

### D5a：EDIT 蘊含 VIEW（Permission UI 互動規則）

- **規則**：在同一 module group 內，如果同時提供 `VIEW` 與 `EDIT`：
  - 勾選 `EDIT` MUST 自動把同 module 的 `VIEW` 一併勾起來。
  - 當 `EDIT` 被勾起時，同 module 的 `VIEW` checkbox MUST 變為 `disabled` 且仍呈勾選狀態（鎖定），hover tooltip 顯示「啟用編輯時需具備檢視權限」。
  - 取消 `EDIT` MUST 不自動取消 `VIEW`（保留使用者「只給檢視」的彈性）；解開 `EDIT` 後 `VIEW` 重新可點。
  - 勾 `VIEW` 不影響 `EDIT`。
- **特殊情況**：某 module 若後端只回 `VIEW` 或只回 `EDIT` 其中一個，視為獨立 checkbox，不套用此規則。
- **「全選 / 全不選」對齊**：group 全選 → 兩個都勾（VIEW 自然被鎖）；group 全不選 → 兩個都取消。
- **資料一致性**：表單提交前 MUST 在 zod schema 的 `transform` 內 normalize 一次 — 若 `permissionCodes` 含某 module 的 `EDIT` 但沒含對應 `VIEW`，自動補上 VIEW；最後再 `sort()` + 去重。這層保險避免任何 UI 路徑漏掉規則，也讓後端永遠收到一致資料。
- **理由**：業務語意上「能編輯但不能看」不存在；UI 強制隱含關係能避免 RBAC 設定錯誤。鎖定（disabled）而非自動取消 EDIT，是因為使用者通常是先勾 EDIT 才意識到 VIEW 被連動，這時不該把他的 EDIT 反向取消。

### D6：URL state — query string only

- **選擇**：`page` / `limit` / `name` / `edit`（編輯中 role id）放 URL query。
- **與 member 差異**：沒有 `email` 搜尋（後端 list 只支援 `name`）。
- **理由**：與 member 一致；`edit=<uuid>` 重整能恢復編輯 dialog。

### D7：搜尋 debounce 300ms（沿用 `useDebouncedValue`）

- 與 member 同 hook，不重寫；只是綁一個 input。

### D8：權限可見性 — `useHasPermission`

- 沿用 `useHasPermission(code)` hook；無 `BACKEND:ROLE:EDIT` 時新增按鈕、列上 Switch、編輯 / 刪除全 disabled / 隱藏；無 `BACKEND:ROLE:VIEW` 時 `<Navigate to="/" replace />`。

### D9：Mutation 後快取一致性

- **策略**：
  - Create / Update / Delete 成功 → `queryClient.invalidateQueries({ queryKey: ['GET', '/roles'] })` 一次清掉所有 page/search 變體。
  - Status toggle → optimistic（`setQueriesData` 翻轉對應 row 的 `status`），失敗 invalidate 重抓 + toast error。
- **與 member 差異**：mutation hook 還要 invalidate member 用的 `useRoleOptionsQuery`（`['GET', '/members/role/options']`），因為新增 / 編輯角色會影響會員 dialog 的選項。

### D10：表單欄位設計

- **新增**：名稱（required, 1-100 字元）+ 權限多選（zero or more）+ 狀態（default `true`）。
- **編輯**：名稱（required）+ 權限多選 + 狀態。`isDefault=true` 時整個 dialog 不會被開啟（編輯按鈕在表格層先擋），所以表單不需要處理「禁用編輯」case。
- **驗證**：react-hook-form + zod + `standardSchemaResolver`，與 member 一致。
- **權限選項來源**：`GET /api/roles/permissions`；query key `['GET', '/roles/permissions']`；staleTime 30 分鐘。

### D11：列上 Status Switch 行為（後端擴充後，單階段）

- 點 Switch 立即翻轉狀態 → PATCH `/api/roles/:id` body **只帶 `{ status: !current }`** 即可。後端 update DTO 支援所有欄位選填，省略 `name` / `permissionCodes` 表示不變更，傳 `status` 表示僅切換啟用狀態。
- **原因**：原先 update DTO 只收 `name` / `permissionCodes`，迫使 Switch toggle 必須先 GET 該 role 拿 `permissionCodes` 再 PATCH（兩階段）。改為後端 update DTO 加 `status?: boolean` 後，Switch toggle 變成單一 PATCH，與 member 模式一致、UX 更順、實作更簡單。
- **isDefault=true** Switch disabled（前端先擋）；按到也不發 request。後端 `DefaultRoleNotEditableException` 仍會擋下任何對預設角色的 update。
- **Optimistic**：與 member 一樣 `setQueriesData` 翻轉對應 row 的 `status`；PATCH 失敗 invalidate `['GET', '/roles']` 回滾。

### D12：Sidebar 整合

- 在 `routes/_nav-items.ts` 的 `NAV_ITEMS` 陣列加一筆：

```ts
{ label: '角色管理', path: '/roles', icon: Shield, requiredPermission: 'BACKEND:ROLE:VIEW' }
```

- `_layout.tsx` 已自動依 `requiredPermission` 過濾，不需動。

### D13：刪除確認 — 簡單 AlertDialog

- 一行說明（含角色名與使用人數）+ 兩個按鈕（取消 / 確認刪除），無 type-to-confirm。`memberCount > 0` 列上「刪除」已 disabled 不會走到這個 dialog。

### D14：shadcn 新元件

- 新增：`checkbox`（給 PermissionsField 用）；`tooltip`（如果之前沒加，給 isDefault / 自己列的 hover 提示用）。
- 透過 `pnpm dlx shadcn@latest add checkbox tooltip`。

### D15：後端 update DTO / port / service 補上 status

- `UpdateRoleRequest` zod schema 加 `status: z.boolean().optional()`，提供型別保證與 Swagger 自動文件支援。
- `UpdateRoleCommand` port 對應加 `status?: boolean`，保持 hexagonal port 與 use case command 同步。
- `UpdateRoleService.execute` 把 `status` 傳到 `roleRepo.updateWithPermissions(id, name, permissionCodes, status)`；service 不需做額外驗證（`boolean` 已透過 zod 守住）。
- `RoleRepositoryPort.updateWithPermissions` 簽章新增第 4 個參數 `status?: boolean`。`PrismaRoleRepository.updateWithPermissions` 在現有 transaction 內，若 `status !== undefined` 在 `tx.role.update(...)` 那段 data 物件加上 `status`。提早 return 條件改為「`name === undefined && permissionCodes === undefined && status === undefined`」。
- 不另外開 dedicated endpoint（如 `PATCH /api/roles/:id/status`）。增量擴充現有 endpoint 與 member 的模式一致，diff 面積最小。

### D16：後端測試覆蓋

- 新增 unit spec：`UpdateRoleService.spec.ts`，覆蓋
  - status only：command `{ id, status: false }` → repo 收到 `(id, undefined, undefined, false)`
  - name + status：command `{ id, name, status }` → repo 收到 `(id, name, undefined, status)`
  - status + permissionCodes：repo 收到所有三項
  - 預設角色 + status：仍丟 `DefaultRoleNotEditableException`
  - 名稱衝突 / 找不到角色 / permission code 不合法 等既有分支保持
- 擴充 e2e：`role.e2e-spec.ts` 的 `describe('PATCH /api/roles/:id')` 加
  - 「PATCH 僅送 status → 204 + `mockPrisma.role.update` 收到含 `status` 的 data」
  - 「PATCH `name + status` 同送 → 204」

## Risks / Trade-offs

- **[Risk] Switch toggle 兩階段請求**：列上 Switch 觸發時要先 GET 單筆才能 PATCH，UX 上多一次往返。**Mitigation**：toggle 期間 Switch disabled + spinner（或仍 optimistic 立刻 UI 翻轉），失敗 rollback。實作上 optimistic + 背景 GET→PATCH 較順。
- **[Risk] `GET /roles/permissions` 回應若包含大量項目，PermissionsField 渲染過長**：目前 platform 只有 BACKEND，module 6 個左右；可預期 < 20 行 checkbox。**Mitigation**：使用 `max-h-[60vh] overflow-auto` 限制高度。未來真的爆出 100+ 條目再考慮 collapsible section。
- **[Risk] `roleId` 在 member 頁面是 select 選項，角色 status=false 時 member 頁要不要過濾**：暫不處理，member dialog 的 role select 仍顯示全部（後端 `/members/role/options` 自有過濾邏輯）。**Mitigation**：本次不動 member 頁，若日後出問題再各自 spec 處理。
- **[Risk] PermissionsField 表單值序列**：`permissionCodes` array 順序不一致會讓 dirty-check / 提交 diff 失準。**Mitigation**：提交前 `sort()` 並去重，與後端比對也以集合視角。
- **[Trade-off] 不上提 PermissionsField 為通用元件** → 留在 `routes/roles/components/`；待第二個使用場景再 refactor。
- **[Trade-off] 不切 `/roles/new` 路由** → 失獨立深連結；但與 member 一致更重要。
- **[Trade-off] 全頁 invalidate 而非 partial cache update** → 多一次 fetch，但邏輯簡單可靠。

## Migration Plan

純前端新增功能，無 migration / rollback 顧慮。任務分四階段執行，每階段獨立可驗證：

1. **基礎建設**：shadcn `checkbox` / `tooltip`、`use-permission-options-query` hook、`group-permissions` helper、`PermissionsField` 元件。
2. **資料層**：query / mutation hooks（list、create、update、delete、status toggle 兩階段）、URL state hook、`role-form-schema`。
3. **頁面與 dialog**：`/roles` 列表（含 isDefault badge / disabled tooltip / memberCount tooltip）、create/edit dialog、delete dialog。
4. **整合**：Sidebar `Shield` icon、`App.tsx` 路由、權限可見性、typecheck / lint / test / 手動驗證。

回退策略：如任一階段 typecheck / lint / test 失敗，`git revert` 該階段 commit 即可（不影響後端與 member 頁）。

## Open Questions

- **Status toggle 兩階段 vs. list 補欄位**：當前選兩階段（純前端）。若驗證後 UX 不佳（明顯延遲），可改為後端 list 補 `permissionCodes` 欄位避免兩次往返。
- **Section-level（platform）全選**：第一版先做 group-level（module）全選；若 module 數量再變多，補上 section-level。
- **權限「群組」名稱要顯示中文還是原始 module 代碼**：後端 `permissions` 回應已有 `name`（人類可讀），module / platform 是代碼。第一版用 `name` 顯示，module 代碼當分組 key 即可。
