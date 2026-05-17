## Why

會員管理 dialog 的「角色」select 透過 `GET /api/members/role/options` 一次取所有啟用中的角色。當角色頁開始落地 RBAC 後角色數量會大幅成長（每個業務模組可能新增 1–2 個自訂角色），未來 50+ 角色時 dropdown 滾不完、初次開啟 dialog 也會延遲。需要把這個 endpoint 改成分頁 + 前端 dropdown 改 cmdk Combobox + 無限下滑，從一開始就建立可擴展 pattern，並補上「依名稱搜尋」UX。

## What Changes

- **後端 `GET /api/members/role/options` 改為分頁**：加 query 參數 `page` / `limit` / `search`（名稱模糊），回應 shape 由原本的純陣列改為 `{ list: RoleOption[], meta: { page, limit, total, totalPages } }`，與 `/api/members`、`/api/roles` 一致。每筆 RoleOption 含 `id` / `name` / `isDefault`（沿用既有旗標）。
- **`LoadRolePort.listActiveRoles` 簽章改為支援分頁**：把現有方法擴成 `listActiveRoles({ page, limit, search? }): Promise<{ list, total }>`，由 `ListRoleOptionsService` 對應 query params；或新增 `listActiveRolesPaged` 並保留舊方法（design 階段決策）。
- **新增 `LoadRolePort.findActiveRoleOption(id)` 方法**（或復用 `findRoleById`）：給前端「編輯帶入 roleId 不在第一頁」時的 fallback option fetch；回 `{ id, name, isDefault }`。
- **Swagger `members/role-options.yaml` 改寫**：加 query parameters、改 response schema 為 `{ list, meta }`。重打 `pnpm --filter @app/api swagger:bundle && pnpm --filter @app/api-client generate`。
- **前端 `MemberFormDialog` 的角色欄位**：把 shadcn `Select` 換成 cmdk-based Combobox（用 shadcn `command` + `popover` 自組），呈現「可搜尋、可滾載」下拉。
- **新增 hook `useRoleOptionsInfiniteQuery`** 取代原本的 `useRoleOptionsQuery`：以 `useInfiniteQuery` 從 `?page=1&limit=20` 開始，搭配 IntersectionObserver 在下拉清單底端觸發 `fetchNextPage`；搜尋輸入 debounce 300ms 後重置 query。
- **新增 hook `useRoleOptionFallbackQuery(id?)`**：dialog edit 模式時若初值的 `roleId` 不在第一頁，並列 fetch 該角色當作 fallback option，讓 Combobox 仍能顯示既有角色名稱（並維持 `isDefault` disabled 行為）。
- **沿用既有行為**：`isDefault=true` 的選項仍顯示但 disabled（系統角色不可被一般帳號指派）；query staleTime 維持 10 分鐘；endpoint 仍要 `BACKEND:ACCOUNT:VIEW` 權限。
- **後端測試**：新增 / 修改 `ListRoleOptionsService` unit spec 覆蓋分頁與搜尋；e2e `member.e2e-spec.ts` 補「分頁回應 shape」「搜尋有命中」「無 token 401」測試。

## Capabilities

### New Capabilities

- `member-role-options-api`：定義 `GET /api/members/role/options` endpoint 的請求 / 回應 contract（分頁、搜尋、isDefault 旗標、權限）。本次將首版 spec 寫入此 capability，未來該 endpoint 行為變更（如改 cursor pagination、加排序）皆在此 capability 增刪 requirement。

### Modified Capabilities

- `member-management-ui`：修改「新增與編輯共用 Dialog」requirement — 角色欄位從 shadcn `Select`（一次性 list）改為 cmdk Combobox + `useInfiniteQuery` 無限下滑，含搜尋輸入與「編輯帶入既有角色」fallback fetch。

## Impact

- **後端 `apps/api/` 異動**：
  - `apps/api/src/adapter/in/web/member/MemberController.ts`：`listRoleOptions` 加 `@Query` 並用新 zod schema 解析
  - `apps/api/src/adapter/in/web/member/ListRoleOptionsQuery.ts`：**新檔**，zod schema（page / limit / search）
  - `apps/api/src/application/port/in/member/ListRoleOptionsUseCase.ts`：use case 簽章與回應型別改為分頁
  - `apps/api/src/application/service/member/ListRoleOptionsService.ts`：把 query 轉給 LoadRolePort
  - `apps/api/src/application/port/out/role/LoadRolePort.ts`：`listActiveRoles` 簽章改為帶分頁 / 搜尋；可選擇新增 `findActiveRoleOption`
  - `apps/api/src/adapter/out/persistence/role/PrismaRoleRepository.ts`：實作分頁 + 搜尋
  - `apps/api/src/application/facade/MemberFacade.ts`：把 query 轉給 use case
  - `apps/api/docs/swagger/members/role-options.yaml`：query params + response 改寫
- **api-client 異動**：重打型別後 `useApiQuery('GET', '/members/role/options', ...)` 的 params / response 改變
- **前端 `apps/web/` 異動**：
  - `apps/web/src/components/ui/`：`pnpm dlx shadcn@latest add command popover` 加入（若未在）
  - `apps/web/src/routes/members/hooks/use-role-options-query.ts`：改名為 `use-role-options-infinite-query.ts`（或新檔），實作 `useInfiniteQuery` + 搜尋參數
  - `apps/web/src/routes/members/hooks/use-role-option-fallback-query.ts`：**新檔**，用 `useApiQuery` 抓單筆 role 細節作 fallback
  - `apps/web/src/routes/members/components/MemberFormDialog.tsx`：角色欄改 Combobox；用 IntersectionObserver 偵測 sentinel 觸發 fetchNextPage
  - `apps/web/src/routes/members/components/RoleCombobox.tsx`：**新檔**，將 Combobox + 無限下滑 + fallback option 邏輯收斂成獨立元件，方便未來其他模組複用
- **測試**：
  - `apps/api/src/application/service/member/ListRoleOptionsService.spec.ts`：**新檔**，覆蓋分頁參數、預設值、搜尋
  - `apps/api/test/member.e2e-spec.ts`：補 paginated response shape / search / 401 / 403 案例
  - 前端可選補 hook 行為的 vitest（沿用 starter pack 模式）
- **路由結構不變**：endpoint path 不變、權限不變、前端路由不變
- **無 DB schema 異動**
