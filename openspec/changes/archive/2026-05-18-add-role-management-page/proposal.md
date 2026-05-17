## Why

`apps/web/` 已透過 `member-management-ui` 跑通「DataTable + Dialog form + URL state + 權限 + Optimistic + Toast」整條鏈，但 member 頁的「角色」欄目前是只讀 select 選項，使用者無法在後台調整角色定義與權限指派。後端 `/api/roles` 一族 endpoint（list / get / create / update / delete + `GET /roles/permissions` 取所有可指派的權限）已完整可用，需要前端 UI 才能讓管理員真的維護 RBAC。角色頁也是驗證 starter pack pattern 可複製性的第二個模組。

## What Changes

- 新增 `apps/web/src/routes/roles/`：以 `/roles` 為列表頁，create/edit 走 shadcn `Dialog` modal、delete 走 `AlertDialog`、列上有 `Switch` 即時切換啟用狀態（沿用 member 模式）。
- DataTable **5 欄**：名稱（`isDefault=true` 時加灰 badge「預設」）/ 使用人數（`memberCount`）/ 狀態（Switch）/ 建立時間 / 操作（dropdown）。
- 表單欄位：名稱（required, 1-100 字元）+ 權限多選（`permissionCodes[]`）。權限以 **Grouped checkboxes** 呈現：依 `platform → module` 分組，每組列 `VIEW` / `EDIT` 兩個 checkbox，附「全選 / 全不選」整組操作。
- `isDefault=true` 的列為「受保護」：Switch / 編輯 / 刪除 三個操作全部 disabled + tooltip 說明（比照 member 頁「自己那一列」的處理）。
- `memberCount > 0` 的列：刪除 disabled + tooltip「角色有 N 位使用者，請先移除才能刪除」（後端 `RoleHasMembersException` 也會擋，前端先擋為 UX）。
- 分頁 / 搜尋（只剩 name 一欄，無 email）狀態同步 URL query string（`?page=&limit=&name=&edit=`），搜尋 debounce 300ms。
- Sidebar 加「角色管理」項目，連到 `/roles`，圖示 `lucide-react` 的 `Shield`，依 `BACKEND:ROLE:VIEW` 過濾。
- 權限檢查：無 `BACKEND:ROLE:EDIT` 時新增按鈕與列上編輯 / 刪除 / Switch 全 disabled；無 `BACKEND:ROLE:VIEW` 直接 `<Navigate to="/" />`。
- 沿用既有 shadcn 元件（dialog / alert-dialog / switch / dropdown-menu / table / sonner / tooltip）與既有共用 hooks（`useDebouncedValue` / `useHasPermission` / `useCurrentMember` / `format-relative-time`）與 `components/data-table/`。本次理論上不需新增 shadcn 元件，只新增 `checkbox` 一個（給權限多選用）。
- **後端擴充**：既有 `PATCH /api/roles/:id` 的 update DTO 與 service 沒有處理 `status` 欄位（只支援 `name` / `permissionCodes`），但 list / get 回應已含 `status`。為支援表格列上 Switch 即時切換、與 member 模式一致，後端需擴充：`UpdateRoleRequest` zod schema 加 `status?: boolean`、`UpdateRoleCommand` port 對應補欄位、`UpdateRoleService` 將 status 傳到 repository、`PrismaRoleRepository.updateWithPermissions` 在 transaction 內處理 status 更新；同時更新 Swagger `update.yaml` 並重新產生 `@app/api-client` 型別。新增 / 修改對應 unit spec 與 e2e 測試。

## Capabilities

### New Capabilities

- `role-management-ui`：apps/web 的角色管理介面（list / search / paginate / create / edit / delete / toggle status / permission 多選）的功能需求與互動規格。
- `role-management`：後端角色更新行為（`PATCH /api/roles/:id`）的需求規格，這次本提案僅描述「支援 `status` 欄位切換啟用狀態」這一點；既有 `name` / `permissionCodes` 行為已實作但尚未建立 capability spec，本次一併列入此 capability 的初版 spec。

### Modified Capabilities

- `frontend-admin`：Sidebar 多 1 條導航項目（「角色管理」），延伸既有「依 `requiredPermission` 過濾可見性」的 pattern，無 spec 行為改變，僅在現有導航需求下多註一個條目；如 spec 上無需要動到的描述，視為純配置即可，不列入此處。

> 註：若 review 後判定 sidebar 多加一項屬純配置（NAV_ITEMS 陣列多一筆，無 spec-level 行為變更），可移除「Modified Capabilities」一節。本提案先列出讓 review 判定。

## Impact

- **新增 shadcn 元件**：`checkbox`（給權限多選用），透過 `pnpm dlx shadcn@latest add checkbox` 加入；可能順帶引入 `@radix-ui/react-checkbox`。`tooltip` 若還未加（之前 member 階段已加可跳過）一併補上。
- **既有檔案異動**：
  - `apps/web/src/App.tsx`：加 `/roles` 路由（在 Layout 內，與 `/members` 並列）
  - `apps/web/src/routes/_nav-items.ts`：NAV_ITEMS 陣列加一筆 `{ label: '角色管理', path: '/roles', icon: Shield, requiredPermission: 'BACKEND:ROLE:VIEW' }`
  - `apps/web/src/components/ui/`：shadcn add 進來的 `checkbox.tsx`（與可能的 `tooltip.tsx`）
- **新增檔案**（`apps/web/src/routes/roles/` 下）：`page.tsx`、`hooks/use-roles-query.ts`、`hooks/use-role-mutations.ts`、`hooks/use-roles-url-state.ts`、`hooks/use-permission-options-query.ts`、`components/RolesTable.tsx`、`components/RolesSearchBar.tsx`、`components/RoleFormDialog.tsx`、`components/DeleteRoleDialog.tsx`、`components/PermissionsField.tsx`、`lib/role-form-schema.ts`、`lib/group-permissions.ts`。
- **後端異動**：
  - `apps/api/src/adapter/in/web/role/UpdateRoleRequest.ts`：`updateRoleSchema` 加 `status?: boolean`
  - `apps/api/src/application/port/in/role/UpdateRoleUseCase.ts`：`UpdateRoleCommand` 加 `status?: boolean`
  - `apps/api/src/application/service/role/UpdateRoleService.ts`：把 `status` 傳到 repository
  - `apps/api/src/application/port/out/role/RoleRepositoryPort.ts`：`updateWithPermissions` 簽章加 `status?: boolean`（or rename「`updateRole(id, partial)`」也可，採增量參數版本減少 diff 面積）
  - `apps/api/src/adapter/out/persistence/role/PrismaRoleRepository.ts`：在現有 transaction 內，當 `status !== undefined` 時 `tx.role.update(... { status } ...)`
  - `apps/api/docs/swagger/roles/update.yaml`：body 加 `status: boolean`
  - 重打 `pnpm --filter @app/api swagger:bundle && pnpm --filter @app/api-client generate`
  - 新增 unit spec：`apps/api/src/application/service/role/UpdateRoleService.spec.ts`，覆蓋 status only / name + status / 預設角色擋下 / 找不到 角色 / 名稱衝突幾個分支
  - 擴充 e2e：`apps/api/test/role.e2e-spec.ts` 加入「PATCH 僅送 status → 204 + repository 收到對應參數」、「PATCH name + status → 204」
- **路由結構**：純 `/roles`（list + 內嵌 dialog），不切 `/roles/new` / `/roles/:id/edit`；URL state 只放 query string。
- **不導入額外狀態管理**：TanStack Query 既有 cache + URL query 已足。
