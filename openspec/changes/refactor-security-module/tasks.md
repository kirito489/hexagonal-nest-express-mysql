## 1. 前置作業

- [x] 1.1 working tree 乾淨（只剩本 change 的 openspec 檔案 untracked）
- [x] 1.2 確認 `/api/security/*` 既有 e2e 全綠（baseline：4 suites / 93 tests）

## 2. 後端 / Domain exception 與 Filter

- [x] 2.1 新增 `apps/api/src/domain/exception/EmailNotFoundException.ts`
- [x] 2.2 新增 `apps/api/src/domain/exception/AccountNotLockedException.ts`
- [x] 2.3 `GlobalExceptionFilter.ts`：加 EmailNotFoundException (404 / EMAIL_NOT_FOUND) + AccountNotLockedException (409 / ACCOUNT_NOT_LOCKED) 進 map
- [x] 2.4 補 `GlobalExceptionFilter.spec.ts` 2 個 case，8/8 passed

## 3. 後端 / Port 簽章與 Repo 實作

- [x] 3.1 `IpListPort.ts`：`listWhitelist` / `listBlacklist` 簽章改 `(params) => Promise<{ list, total }>`；`addToXxx` 改回 `{ id }`
- [x] 3.2 `PrismaIpListRepository.ts`：實作分頁 `$transaction([findMany, count])` + IP `contains` 搜尋
- [x] 3.3 `addToWhitelist` / `addToBlacklist` 升級為 `{ id: string }`，upsert 加 `select: { id: true }`

## 4. 後端 / UseCase + Service 層

- [x] 4.1 新增 `port/in/security/SecurityUseCases.ts`：7 個 use case interface + token（聚合一檔）
- [x] 4.2 新增 `service/security/SecurityServices.ts`：對應 7 個 @Injectable service 實作
- [x] 4.3 `UnlockAccountService`：`loadMemberByEmail` null → `EmailNotFoundException`；`isLocked` false → `AccountNotLockedException`；過了才呼叫 `unlockAccount`
- [x] 4.4 `security.module.ts`：註冊 7 個 use case provider
- [x] 4.5 `SecurityFacade.ts`：改 inject 7 個 use case token，不再直接呼 port

## 5. 後端 / Controller 與 DTO

- [x] 5.1 新增 `ListIpListQuery.ts`：zod schema (page / limit / search)
- [x] 5.2 `SecurityController.ts` 全面對齊新 shape：list `{ list, meta }`、add 201 + `{ id }`、remove 204、unlock 204

## 6. 後端 / Swagger + api-client

- [x] 6.1 `ip-whitelist-list.yaml`：加 query 參數、改 response `{ list, meta }` shape
- [x] 6.2 `ip-blacklist-list.yaml`：同上
- [x] 6.3 `ip-whitelist-add.yaml` / `ip-blacklist-add.yaml`：response 改 `{ id }`
- [x] 6.4 `ip-whitelist-delete.yaml` / `ip-blacklist-delete.yaml`：已是 204，不動
- [x] 6.5 `unlock-account.yaml`：改 204；補 404 (EMAIL_NOT_FOUND) / 409 (ACCOUNT_NOT_LOCKED) error response
- [x] 6.6 `pnpm --filter @app/api swagger:bundle && pnpm --filter @app/api-client generate`

## 7. 後端 / 測試

- [x] 7.1 `security.e2e-spec.ts` 對齊新 shape（list `{ list, meta }`、add `{ id }`、unlock 204）
- [x] 7.2 補 e2e case：search、unlock 三分支（成功 / 404 / 409）共 4 個新 case
- [x] 7.3 補 mock：`$transaction` (array form)、`ipWhitelistRecord.count` / `ipBlacklistRecord.count` 預設 0、`upsert` mock return 含 id
- [x] 7.4 api typecheck + lint + unit 134 + e2e 96 全綠

## 8. 前端 / Sidebar grouped 結構

- [x] 8.1 `routes/_nav-items.ts`：`NavItem` 加 `group?` 與 `requiredRoleCode?`；既有兩條歸「使用者與權限」group
- [x] 8.2 `_layout.tsx`：依 group 渲染 `<SidebarGroup>` + 過濾邏輯（permission + roleCode），整組空不渲染
- [x] 8.3 `ProfileDetail` 加 `roleCode`（從 MemberContext 帶出）；Swagger get-me.yaml 補欄位；`useCurrentMember()` 暴露 roleCode

## 9. 前端 / SidebarUserMenu

- [x] 9.1 新增 `apps/web/src/components/SidebarUserMenu.tsx`：頭像（lucide `User` icon）+ 名稱 + email + DropdownMenu
- [x] 9.2 dropdown 含「個人設定」（disabled + tooltip「下一版提供」）與「登出」
- [x] 9.3 「登出」呼叫 `tokenStorage.clear` + `queryClient.clear` + `navigate('/login')`
- [x] 9.4 `_layout.tsx` SidebarFooter 換成 `<SidebarUserMenu />`
- [x] 9.5 `useCurrentMember()` 透過 `member.member` 與 `member.email` 取資料（既有，不需補）

## 10. 驗證

- [x] 10.1 api typecheck + lint + unit 134 + e2e 96 全綠
- [x] 10.2 web typecheck + lint + test 12 + build 全綠
- [x] 10.3 手動：SUPERADMIN 登入 → sidebar 「使用者與權限」group 正確（「安全」group 本次未加 NAV_ITEMS，待前端頁面 change）
- [x] 10.4 手動：一般 admin 邏輯 OK（NAV_ITEMS 過濾 + 整組空不渲染）
- [x] 10.5 手動：footer 顯示頭像 + 名稱 + email
- [x] 10.6 手動：dropdown「登出」清 cache + 跳 /login
- [x] 10.7 手動：dropdown「個人設定」disabled + tooltip
- [x] 10.8 手動：`GET /api/security/ip-whitelist` 回 `{ list, meta }`
- [x] 10.9 手動：unlock 三分支（成功 204 / 404 / 409）

## 11. 收尾

- [x] 11.1 `tasks/lessons.md` 補「Facade 不要直接呼 Port，補 UseCase / Service 層」條目
- [ ] 11.2 commit（使用者執行）
- [ ] 11.3 邀請 `openspec-archive-change` 走完整封存流程
