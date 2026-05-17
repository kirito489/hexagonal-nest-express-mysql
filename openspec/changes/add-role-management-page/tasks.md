## 1. 前置作業

- [x] 1.1 working tree 乾淨（只剩本 change 的 openspec 檔案 untracked）
- [x] 1.2 後端 dev 已驗證 `/api/roles*` 可正常打（list / permissions / get / create / update / delete）
- [x] 1.3 確認 seed admin（admin@test.com / Admin1234!）擁有 `BACKEND:ROLE:VIEW` + `BACKEND:ROLE:EDIT` 權限

## 2. 後端擴充 / role update 支援 status

- [x] 2.1 `UpdateRoleRequest.ts`：`updateRoleSchema` 加 `status: z.boolean().optional()`
- [x] 2.2 `UpdateRoleUseCase.ts`：`UpdateRoleCommand` 加 `status?: boolean`
- [x] 2.3 `RoleRepositoryPort.ts`：`updateWithPermissions` 簽章加第 4 個參數 `status?: boolean`
- [x] 2.4 `UpdateRoleService.ts`：把 `command.status` 傳給 `updateWithPermissions`
- [x] 2.5 `PrismaRoleRepository.ts`：提早 return 條件加 status；transaction 內若 `status !== undefined` 在 `tx.role.update` 的 data 加 `status`；確保「僅送 status」也能在沒有 name 的情況下走 update
- [x] 2.6 `apps/api/docs/swagger/roles/update.yaml`：body schema 加 `status: boolean`
- [x] 2.7 `pnpm --filter @app/api swagger:bundle && pnpm --filter @app/api-client generate` 重打 client 型別
- [x] 2.8 新增 unit spec：`apps/api/src/application/service/role/UpdateRoleService.spec.ts`（status only、name+status、status+permissionCodes、預設角色擋下、找不到、名稱衝突）
- [x] 2.9 擴充 e2e：`role.e2e-spec.ts` 的 `describe('PATCH /api/roles/:id')` 加「僅送 status → 204」與「name+status → 204」測試
- [x] 2.10 `pnpm --filter @app/api typecheck && pnpm --filter @app/api lint && pnpm --filter @app/api test && pnpm --filter @app/api test:e2e` 全綠

## 3. 前端基礎建設 / shadcn 元件

- [ ] 3.1 `pnpm dlx shadcn@latest add checkbox`（如未在 `components/ui/` 內）
- [ ] 3.2 `pnpm dlx shadcn@latest add tooltip`（如未在 `components/ui/` 內）
- [ ] 3.3 typecheck + build 全綠

## 4. 共用 helper 與 hook

- [ ] 4.1 `routes/roles/lib/group-permissions.ts`：把扁平的 permissions 陣列分組為 `{ platform: { module: PermissionDto[] } }` 結構，並提供 `isViewLockedByEdit(moduleCode, selected)` helper
- [ ] 4.2 `routes/roles/hooks/use-permission-options-query.ts`：包 `GET /api/roles/permissions`，staleTime 30 分鐘
- [ ] 4.3 `routes/roles/lib/role-form-schema.ts`：zod schema（create 與 edit 同 shape，名稱 1-100、permissionCodes string[] default []、status default true），含 `transform` normalize（EDIT 補 VIEW、sort、去重）

## 5. 資料層 / Hooks 與 URL state

- [ ] 5.1 `routes/roles/hooks/use-roles-query.ts`：包 list 查詢，空字串搜尋參數自動剝掉
- [ ] 5.2 `routes/roles/hooks/use-role-mutations.ts`：create / update / delete + 成功時 invalidate `['GET', '/roles']` 與 `['GET', '/members/role/options']` + toast；同時提供 `toggleStatus` mutation（PATCH 只送 `{ status }`）
- [ ] 5.3 `routes/roles/hooks/use-roles-url-state.ts`：page / limit / name / edit 全 URL 同步（無 email）

## 6. 元件 / PermissionsField（分組 checkboxes）

- [ ] 6.1 `routes/roles/components/PermissionsField.tsx`：吃 `value: string[]` + `onChange`，內部依 `group-permissions` 結果渲染
- [ ] 6.2 每個 module group 加 group-level「全選 / 全不選」操作（小 button 或 group-level checkbox 的 indeterminate）
- [ ] 6.3 容器加 `max-h-[60vh] overflow-auto`
- [ ] 6.4 「EDIT 蘊含 VIEW」UI 行為：勾 EDIT 自動加 VIEW；同 module 的 VIEW checkbox 在 EDIT 勾選時 disabled + 仍勾選 + tooltip「啟用編輯時需具備檢視權限」；取消 EDIT 不自動取消 VIEW
- [ ] 6.5 提交時 schema 的 `transform` 統一 normalize（依 4.3 完成），submit handler 不需重複處理

## 7. 頁面 / 列表

- [ ] 7.1 `routes/roles/page.tsx`：orchestrator（header + search + table + pagination + dialogs），結構照搬 `routes/members/page.tsx`
- [ ] 7.2 `routes/roles/components/RolesSearchBar.tsx`：只有 name 一欄 debounce 300ms
- [ ] 7.3 `routes/roles/components/RolesTable.tsx`：5 欄含 isDefault badge / Switch / DropdownMenu，無 EDIT 權限時隱藏操作欄
- [ ] 7.4 status optimistic update：`setQueriesData` 翻轉 row.status；觸發 `toggleStatus` mutation（單一 PATCH `{ status }`）；失敗 invalidate
- [ ] 7.5 `isDefault === true` 列 Switch / 編輯 / 刪除全 disabled + tooltip 三種訊息
- [ ] 7.6 `memberCount > 0` 列「刪除」disabled + tooltip 顯示「角色有 N 位使用者，請先移除才能刪除」

## 8. 頁面 / Dialog

- [ ] 8.1 `routes/roles/components/RoleFormDialog.tsx`：create / edit 共用，react-hook-form + zod + `standardSchemaResolver`，內含 `Input` (name) + `PermissionsField` + `Switch` (status)
- [ ] 8.2 編輯由 URL `?edit=<uuid>` 控制，自動 `GET /api/roles/:id` 載入 defaultValues
- [ ] 8.3 編輯 GET 失敗（useEffect 防 render 階段 setState）→ toast.error + closeEdit
- [ ] 8.4 `routes/roles/components/DeleteRoleDialog.tsx`：顯示角色名 + 使用人數

## 9. 整合

- [ ] 9.1 `App.tsx` 加 `/roles` 路由（在 Layout 內）
- [ ] 9.2 `routes/_nav-items.ts`：NAV_ITEMS 加一筆 `{ label: '角色管理', path: '/roles', icon: Shield, requiredPermission: 'BACKEND:ROLE:VIEW' }`
- [ ] 9.3 `page.tsx` 用 `useHasPermission('BACKEND:ROLE:VIEW')` 檢查，無權則 `<Navigate to="/" replace />`
- [ ] 9.4 mutation 與 toggle 失敗時 toast 文案使用後端 error code 對映繁中訊息（如 `DUPLICATE_ROLE_NAME` →「角色名稱已存在」）

## 10. 驗證

- [ ] 10.1 `pnpm --filter @app/web typecheck` 全綠
- [ ] 10.2 `pnpm --filter @app/web lint` 全綠
- [ ] 10.3 `pnpm --filter @app/web test` 全綠
- [ ] 10.4 `pnpm --filter @app/web build` 全綠
- [ ] 10.5 手動測試：登入 → /roles → list / 搜尋 / 翻頁 URL 同步 OK
- [ ] 10.6 手動測試：新增角色（含權限多選 + EDIT 自動勾 VIEW + group 全選） → toast 成功 + 列表更新 OK
- [ ] 10.7 手動測試：編輯 dialog 從 URL `?edit=<uuid>` 直接打開 OK
- [ ] 10.8 手動測試：預設角色 Switch / 編輯 / 刪除 三者皆 disabled + tooltip OK
- [ ] 10.9 手動測試：`memberCount > 0` 的角色刪除 disabled + tooltip 顯示正確人數
- [ ] 10.10 手動測試：Status toggle 單一 PATCH，UX 順暢，失敗 rollback OK
- [ ] 10.11 手動測試：新增 / 編輯角色後，會員頁的角色 select 反映最新角色（`/members/role/options` 被 invalidate）
- [ ] 10.12 手動測試：無 `BACKEND:ROLE:EDIT` 權限帳號權限隔離 OK（新增 / 編輯 / 刪除 / Switch 全被擋）

## 11. 收尾

- [ ] 11.1 將開發過程踩到的非 spec 行為整理為 `tasks/lessons.md` 條目，或 follow-up 項目存到 `tasks/todo.md`
- [ ] 11.2 `pnpm-lock.yaml` 含本次新增 shadcn 依賴（如 `@radix-ui/react-checkbox`、`@radix-ui/react-tooltip`），會進 commit
- [ ] 11.3 commit（使用者執行，AI 不主動跑 `git commit`）
- [ ] 11.4 邀請 `openspec-archive-change` 走完整封存流程（commit 後執行）
