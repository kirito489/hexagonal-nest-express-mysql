## 1. 前置作業

- [x] 1.1 working tree 乾淨（只剩本 change 的 openspec 檔案 untracked）

## 2. 後端 / Members list status filter

- [x] 2.1 `ListMembersQuery.ts`：zod schema 加 status（用 `z.enum(['true','false']).transform(...)` 嚴格解析，避開 `z.coerce.boolean()` 對 `'false'` 字串視為 true 的陷阱）
- [x] 2.2 `ListMembersUseCase.ts` (port in)：query 型別加 `status?: boolean`
- [x] 2.3 `LoadMemberPort.ts`：`ListMembersParams` 加 `status?: boolean`
- [x] 2.4 `ListMembersService.ts`：把 `query.status` 透傳到 port
- [x] 2.5 `PrismaMemberRepository.listMembers`：where 條件加 `if (params.status !== undefined) where.status = params.status`
- [x] 2.6 `apps/api/docs/swagger/members/list.yaml`：加 `status` query parameter（enum [true, false]）

## 3. 後端 / Roles list status filter

- [x] 3.1 `ListRolesQuery.ts`：zod schema 加 status（enum + transform 嚴格解析）
- [x] 3.2 `ListRolesUseCase.ts`：query 型別加 `status?: boolean`
- [x] 3.3 `RoleRepositoryPort.ts`：`ListRolesParams` 加 `status?: boolean`
- [x] 3.4 `ListRolesService.ts`：把 status 透傳
- [x] 3.5 `PrismaRoleRepository.listRoles`：where 條件加 status
- [x] 3.6 `apps/api/docs/swagger/roles/list.yaml`：加 `status` query parameter

## 4. 後端 / Swagger + api-client

- [x] 4.1 `pnpm --filter @app/api swagger:bundle && pnpm --filter @app/api-client generate`
- [x] 4.2 確認 `packages/api-client/src/schema.ts` 的 `/members` 與 `/roles` GET query 都含 `status?: true | false`

## 5. 後端 / 測試

- [x] 5.1 `member.e2e-spec.ts` 加 4 個 case（status=true / false / 未帶 / status=foo 400）
- [x] 5.2 `role.e2e-spec.ts` 加 4 個 case 同上
- [x] 5.3 既有 mock spec 對 `listMembers` / `listRoles` 沒傳具體 params，不需動
- [x] 5.4 api typecheck + lint + unit 132 + e2e 93 全綠

## 6. 前端 / 共用元件 StatusFilterSelect

- [x] 6.1 新增 `apps/web/src/components/StatusFilterSelect.tsx`：shadcn `Select` 包裝，value `'all' | 'true' | 'false'`，三選一
- [x] 6.2 元件 prop `value` / `onChange`；不直接綁 URL，由父層轉換 undefined ↔ 'all'

## 7. 前端 / URL state + query

- [x] 7.1 `use-members-url-state.ts`：state 加 `status: 'true' | 'false' | undefined`；新增 `setStatus`（page 重置為 1）；URL 寫入 / 讀取邏輯
- [x] 7.2 `use-roles-url-state.ts`：同上
- [x] 7.3 `use-members-query.ts`：把 status 字串轉 boolean 後送進 API call
- [x] 7.4 `use-roles-query.ts`：同上

## 8. 前端 / SearchBar 整合

- [x] 8.1 `MembersSearchBar.tsx`：加 props `initialStatus` / `onStatusChange`；StatusFilterSelect 並排
- [x] 8.2 `RolesSearchBar.tsx`：同上
- [x] 8.3 `MembersPage` / `RolesPage`：把 url.status / url.setStatus 接到 SearchBar

## 9. 驗證

- [x] 9.1 `pnpm --filter @app/web typecheck` 全綠
- [x] 9.2 `pnpm --filter @app/web lint` 全綠
- [x] 9.3 `pnpm --filter @app/web test` 全綠（3 files / 12 tests）
- [x] 9.4 `pnpm --filter @app/web build` 全綠
- [x] 9.5 手動測試：/members 切「啟用」/「停用」/「全部」URL 與列表正確
- [x] 9.6 手動測試：/roles 同上
- [x] 9.7 手動測試：複製含 status query 的 URL 開新分頁 → 篩選正確恢復
- [x] 9.8 手動測試：切 status 後 page 重置為 1

## 10. 收尾

- [x] 10.1 `tasks/lessons.md` 補：zod `z.coerce.boolean()` 對 'false' 視為 true 的陷阱，list query 用 `z.enum + transform` 嚴格解析
- [ ] 10.2 commit（使用者執行）
- [ ] 10.3 邀請 `openspec-archive-change` 走完整封存流程
