> 每一塊（`##` 標題）須能獨立通過驗證鏈：
> `pnpm --filter @app/web build`
> 綠燈後給 commit 指令，由使用者手動執行，再進下一塊。
>
> 〔檔頭補寫於 2026-08-16 的 openspec 慣例整理。驗證鏈取自本檔各塊當時實際記錄的結果，塊與任務內容維持原樣未改。〕

## 1. 前置作業

- [x] 1.1 working tree 乾淨（只剩本 change 的 openspec 檔案 untracked）
- [x] 1.2 確認 dev 後端可正常打 `GET /api/members/role/options`（既有 endpoint）

## 2. 後端 / Port 與 service 簽章升級

- [x] 2.1 `LoadRolePort.ts`：`listActiveRoles` 簽章改為 `(params: { page: number; limit: number; search?: string }) => Promise<{ list: RoleOption[]; total: number }>`；新增 `findActiveRoleOption(id: string): Promise<RoleOption | null>`
- [x] 2.2 `PrismaRoleRepository.ts`：實作分頁 `findMany` + `count`（用 `$transaction`）；search 走 `name: { contains: search }`；新增 `findActiveRoleOption` 用 `findFirst({ where: { id, status: true, deletedAt: null } })`
- [x] 2.3 `apps/api/src/application/port/in/member/ListRoleOptionsUseCase.ts`：use case 簽章 `execute(params): Promise<{ list, meta }>`；補 `RoleOption` 與 `Meta` 型別
- [x] 2.4 新增 `apps/api/src/application/port/in/member/GetRoleOptionUseCase.ts`：`execute(id): Promise<RoleOption>`，丟 `RoleNotFoundException` 給 not found / 停用
- [x] 2.5 `ListRoleOptionsService.ts`：套上 page / limit 預設值 (1 / 20)；組裝 meta（total → totalPages）；回 use case shape
- [x] 2.6 新增 `GetRoleOptionService.ts`：呼叫 `findActiveRoleOption`，null 丟 `RoleNotFoundException`
- [x] 2.7 `member.module.ts`：補 `GET_ROLE_OPTION_USE_CASE` provider

## 3. 後端 / Controller、DTO、Facade

- [x] 3.1 新增 `apps/api/src/adapter/in/web/member/ListRoleOptionsQuery.ts`：zod schema（page / limit / search 皆 optional，service 套 default 1/20）
- [x] 3.2 `MemberController.ts`：`listRoleOptions` 加 `@Query(new ZodValidationPipe(...))`；新增 `getRoleOption(@Param('id', ParseUUIDPipe))` 對應 `GET /role/options/:id`
- [x] 3.3 `MemberFacade.ts`：對應補 `listRoleOptions(query)` 與 `getRoleOption(id)`

## 4. 後端 / Swagger + api-client

- [x] 4.1 `apps/api/docs/swagger/members/role-options.yaml`：query 加 page/limit/search、response 改 `{ list, meta }`、`isDefault` 維持
- [x] 4.2 新增 `apps/api/docs/swagger/members/role-option.yaml`（單筆 GET）；`openapi.yaml` paths 加 `/members/role/options/:id`
- [x] 4.3 `pnpm --filter @app/api swagger:bundle && pnpm --filter @app/api-client generate`

## 5. 後端 / 測試

- [x] 5.1 新增 `apps/api/src/application/service/member/ListRoleOptionsService.spec.ts`：預設 / 自訂 page / search / meta 組裝
- [x] 5.2 新增 `GetRoleOptionService.spec.ts`：找到 / not found（port 回 null）兩個 case
- [x] 5.3 修正既有 mock：`CreateMemberService.spec.ts`、`UpdateMemberService.spec.ts` 補 `findActiveRoleOption: jest.fn()`（其他 spec 沒 mock `LoadRolePort`，不需動）
- [x] 5.4 `member.e2e-spec.ts` 的 `describe('GET /api/members/role/options')`：改寫成 paginated shape + 補 page / search / 401 / 403 共 5 個 case
- [x] 5.5 新增 `describe('GET /api/members/role/options/:id')`：200 / 404 / 401 / 403
- [x] 5.6 api unit 19/19 132 tests + e2e 4/4 84 tests 全綠

## 6. 前端 / shadcn 元件

- [x] 6.1 `pnpm dlx shadcn@latest add command popover`（已新增 command.tsx / popover.tsx，順帶有 textarea.tsx / input-group.tsx）
- [x] 6.2 shadcn 元件本身 typecheck 全綠（MemberFormDialog 的 shape 不符要到 Phase 9 才會修好）

## 7. 前端 / Hooks

- [x] 7.1 替換 `use-role-options-query.ts` → `use-role-options-infinite-query.ts`：`useInfiniteQuery`，queryKey `['GET', '/members/role/options', search]`，每頁 limit=20，`getNextPageParam` 推導下一頁
- [x] 7.2 新增 `use-role-option-fallback-query.ts`：`useApiQuery('GET', '/members/role/options/{id}', ...)`，enabled 依 `roleId` 是否存在
- [x] 7.3 刪除舊 `use-role-options-query.ts`

## 8. 前端 / RoleCombobox 元件

- [x] 8.1 新增 `apps/web/src/routes/members/components/RoleCombobox.tsx`：popover + cmdk command + 搜尋輸入 + 滾動清單 + sentinel
- [x] 8.2 sentinel + IntersectionObserver：open 時建立 observer，close / unmount 時自動 disconnect（透過 useEffect cleanup）
- [x] 8.3 fallback option 合併進清單頂端，依 `id` 去重
- [x] 8.4 `isDefault === true` 選項 disabled + 顯示「（預設）」（與角色列表 badge 一致）；fallback 失敗（404）顯示「（已停用 / 不可用）」
- [x] 8.5 搜尋輸入用 `useDebouncedValue` 300ms

## 9. 前端 / 整合 MemberFormDialog

- [x] 9.1 把 `<FormField name="roleId">` 內的 `<Select>` 區塊換成 `<RoleCombobox>`
- [x] 9.2 編輯模式時把 `initialValues?.roleId` 傳給 Combobox 作 fallback fetch trigger
- [x] 9.3 確保 form schema `roleId: z.string().uuid()` 不變、submit 行為不變

## 10. 驗證

- [x] 10.1 `pnpm --filter @app/web typecheck` 全綠
- [x] 10.2 `pnpm --filter @app/web lint` 全綠
- [x] 10.3 `pnpm --filter @app/web test` 全綠（3 files / 12 tests）
- [x] 10.4 `pnpm --filter @app/web build` 全綠
- [ ] 10.5 手動測試：新增 → Combobox 開啟、滾動載第 2 頁、搜尋過濾 OK
- [ ] 10.6 手動測試：編輯既有 member → Combobox 顯示既有角色（即使不在第一頁）OK
- [ ] 10.7 手動測試：預設角色（isDefault=true）disabled + 標示「預設」OK
- [ ] 10.8 手動測試：編輯 member 但對應角色被停用 → Combobox 顯示「（已停用 / 不可用）」OK
- [ ] 10.9 手動測試：無 EDIT 權限的會員角色 Combobox 仍可瀏覽 / 搜尋但不可選提交（與 dialog 自身的 disabled 行為一致）

## 11. 收尾

- [x] 11.1 `tasks/lessons.md` 補：(1) `useInfiniteQuery` 要手動 `unwrapEnvelope`、(2) 窄化 endpoint 不要借用其他模組同樣資料的 endpoint
- [x] 11.2 commit（使用者執行）— 856515a
- [x] 11.3 邀請 `openspec-archive-change` 走完整封存流程
