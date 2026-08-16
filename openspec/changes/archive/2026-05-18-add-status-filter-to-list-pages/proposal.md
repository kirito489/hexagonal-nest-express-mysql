## Why

`/members` 與 `/roles` 兩個列表頁目前只有名稱（與會員的 Email）搜尋；隨著資料筆數增加，使用者需要快速「只看停用」或「只看啟用」的需求愈來愈常見（例如稽核停用帳號、清理沒人在用的角色）。後端兩支 list endpoint 都已回 `status` 欄位，但沒接受 status query 過濾，前端能做的只剩在 client 端硬篩，效能差且分頁失準。本次補上端到端的「狀態」篩選：後端接 `?status=true|false`，前端搜尋列加下拉 Select。

## What Changes

- **後端 list endpoint 加 status query**：
  - `GET /api/members?status=true|false`：`ListMembersQuery` zod schema 加 `status?: z.coerce.boolean()`；`ListMembersService` / `PrismaMemberRepository.listMembers` 在 where 條件套上 status；不帶 → 不過濾。
  - `GET /api/roles?status=true|false`：同上。`ListRolesQuery` / `ListRolesService` / `PrismaRoleRepository.listRoles` 改 where 條件加 status。
  - 兩支 Swagger yaml 加 query 參數，重打 api-client。
- **後端測試**：兩支 e2e 各加「status=true / status=false / 省略 → 不過濾」三個 case；既有 unit spec 若有 mock 需要對齊。
- **前端共用元件**：新增 `apps/web/src/components/StatusFilterSelect.tsx`，shadcn `Select` 包裝，三選一：全部（undefined）/ 啟用（true）/ 停用（false）。
- **前端 URL state**：`use-members-url-state` / `use-roles-url-state` 都加 `status?: 'true' | 'false'` 欄位；undefined 表示「全部」，URL 不寫該參數；切換 status 時 page 重置為 1（與既有 setSearch 行為一致）。
- **前端 query hooks**：`useMembersQuery` / `useRolesQuery` 把 status 轉成 boolean 後送進 API call；空值剝掉。
- **前端 SearchBar 整合**：`MembersSearchBar` 與 `RolesSearchBar` 各加一個 StatusFilterSelect，並排在現有搜尋欄旁。

## Capabilities

### New Capabilities

- `api-member-management`：定義後端「會員管理」API 行為。本次首次建立此 capability，初版聚焦在 `GET /api/members` 列表 endpoint 的篩選參數，未來會員 CRUD endpoint 行為（list / get / create / update / delete / role-options 已存於 `api-member-management`）皆收斂於此 capability。

### Modified Capabilities

- `api-role-management`：既有 spec 含「角色更新支援 status 切換」，新增「列表支援 status 篩選」requirement，描述 `GET /api/roles?status=` query 行為。
- `ui-member-management`：既有「分頁與搜尋 URL state 同步」requirement 補上 `status` 欄位；對應 Scenario 加「使用者篩選停用」。
- `ui-role-management`：同上，「分頁與搜尋 URL state 同步」requirement 補 `status` 欄位。

## Impact

- **後端異動**：
  - `apps/api/src/adapter/in/web/member/ListMembersQuery.ts`：加 `status: z.coerce.boolean().optional()`
  - `apps/api/src/adapter/in/web/role/ListRolesQuery.ts`：同上
  - `apps/api/src/application/port/in/member/ListMembersUseCase.ts`、`role/ListRolesUseCase.ts`：query 型別加 status
  - `apps/api/src/application/service/member/ListMembersService.ts`、`role/ListRolesService.ts`：把 status 透傳到 repo
  - `apps/api/src/application/port/out/member/LoadMemberPort.ts`、`role/RoleRepositoryPort.ts`：`ListXxxParams` 加 `status?: boolean`
  - `apps/api/src/adapter/out/persistence/member/PrismaMemberRepository.ts`、`role/PrismaRoleRepository.ts`：where 條件套 status
  - `apps/api/docs/swagger/members/list.yaml`、`roles/list.yaml`：加 query parameter
  - 重打 swagger:bundle + api-client generate
  - `apps/api/test/member.e2e-spec.ts`、`role.e2e-spec.ts`：各補 3 個 case
  - 若 mock spec 對 `listMembers` / `listRoles` 有 stub 需要對齊新簽章
- **前端異動**：
  - **新檔** `apps/web/src/components/StatusFilterSelect.tsx`：shadcn `Select` 包裝
  - `apps/web/src/routes/members/hooks/use-members-url-state.ts`：state 加 `status`、setSearch 簽章擴張或新增 `setStatus`
  - `apps/web/src/routes/roles/hooks/use-roles-url-state.ts`：同上
  - `apps/web/src/routes/members/hooks/use-members-query.ts`：query 帶 status
  - `apps/web/src/routes/roles/hooks/use-roles-query.ts`：同上
  - `apps/web/src/routes/members/components/MembersSearchBar.tsx`：加 StatusFilterSelect
  - `apps/web/src/routes/roles/components/RolesSearchBar.tsx`：同上
- **無 DB schema 異動**、**無權限變更**、**無路由結構變更**。
