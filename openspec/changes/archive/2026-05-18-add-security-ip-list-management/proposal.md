## Why

剛重構完的 security 模組只有「list + add + delete + unlock」基本 CRUD，缺少 `GET /:id` 與 `PATCH /:id`，導致管理員無法檢視單筆 IP 詳細或更新 description / reason。延伸下去 starter pack 缺三件事：

1. IP whitelist / blacklist 的「by-id」endpoint（GET + PATCH）
2. 既有 DELETE 用 `:ip` 當 path 在 IPv6（含冒號）會碰 URL encode 麻煩，與其他模組「by id」慣例不一致
3. 前端沒有對應頁面，使用者只能 curl 操作

本 change 把後端補齊到 member / role 同樣的 CRUD 強度，前端補上兩個列表頁面，把上一個 change 已備好的 sidebar「安全」group 點亮。

## What Changes

### 後端

- **新增 endpoints**：
  - `GET /api/security/ip-whitelist/:id`：取單筆 whitelist，給編輯 dialog 帶初值。
  - `GET /api/security/ip-blacklist/:id`：取單筆 blacklist，給編輯 dialog 帶初值。
  - `PATCH /api/security/ip-whitelist/:id`：更新 description（IP 不可改，要改就刪除重建）。
  - `PATCH /api/security/ip-blacklist/:id`：更新 reason（IP 不可改）。
- **修改既有 endpoint**：
  - `DELETE /api/security/ip-whitelist/:ip` → `DELETE /api/security/ip-whitelist/:id`：path param 改用 uuid。
  - `DELETE /api/security/ip-blacklist/:ip` → `DELETE /api/security/ip-blacklist/:id`：同上。
- **不變**：硬刪（既有 prisma `.delete()` 行為；schema 沒 deletedAt 欄位、不導入軟刪）；SUPERADMIN role gate 維持。
- **Port 改名**：`IpListPort.removeFromWhitelist(ip)` → `removeWhitelist(id)`，`removeFromBlacklist(ip)` → `removeBlacklist(id)`；新增 `findWhitelistById(id) / findBlacklistById(id) / updateWhitelist(id, {description?}) / updateBlacklist(id, {reason?})`。
- **新增 4 個 use case**：`GetIpWhitelistUseCase` / `UpdateIpWhitelistUseCase` / `GetIpBlacklistUseCase` / `UpdateIpBlacklistUseCase`，並對應 service。
- **新增 domain exception**：`IpListNotFoundException`（404，code `IP_LIST_NOT_FOUND`），GET/PATCH/DELETE 用 id 查不到時拋出；GlobalExceptionFilter 補 instanceof 分支。
- **Swagger**：新增 4 個 yaml（whitelist-get / whitelist-update / blacklist-get / blacklist-update）；既有 2 個 delete yaml path param 改 `id`。重打 `api-client`。
- **e2e**：對齊新 path（DELETE :id）；補新 case（GET 200 / 404、PATCH 204 / 404、DELETE by id 204 / 404）。

### 前端

- **新增頁面**：
  - `apps/web/src/routes/security/ip-whitelist/page.tsx`：DataTable（IP / 描述 / 建立者 / 建立時間 / 操作）+ create / edit Dialog（fields: ip / description）+ delete AlertDialog；沿用既有 DataTable / SearchBar / Dialog pattern；URL state 同步 page / limit / search / edit / view（重用 `useDetailDialog`）。
  - `apps/web/src/routes/security/ip-blacklist/page.tsx`：同上，多一欄 reason 與 `isAutoBlock` badge。
- **新增 hooks**：兩支 list query / mutations / url-state（共 6 個 hook 檔，分檔便於 follow members / roles pattern）。
- **新增 Dialog 元件**：兩支獨立 dialog（`IpWhitelistFormDialog` / `IpBlacklistFormDialog`），不共用——欄位差異（description vs reason）+ create 限制（IP 不可重複）讓共用造成 conditional render 反而不清楚。delete dialog 用既有 shadcn `AlertDialog` inline 即可。
- **Sidebar**：新增 group「安全」，加兩條 NAV_ITEMS 條目（`requiredRoleCode: 'SUPERADMIN'`）。
- **App.tsx**：加兩條 route。

## Capabilities

### Modified Capabilities

- `api-security-management`：擴充 IP whitelist / blacklist 的 by-id endpoints（GET / PATCH）、DELETE path param 改 id、新增 `IpListNotFoundException` 規格。
- `platform-frontend-conventions`：sidebar 多兩條「安全」group 項目（既有 sidebar requirement 不需動）；同時要把 IP 黑白名單兩個前端頁面 capability 加進來（**新增 capability** `ui-security-management` 處理）。

### New Capabilities

- `ui-security-management`：apps/web 的「安全」相關前端 UI 規格（IP 白名單頁、IP 黑名單頁；未來帳號鎖定頁也歸這裡）。

## Impact

### 後端

- `apps/api/src/application/port/out/security/IpListPort.ts`：簽章升級（rename remove method、加 findById / update method）
- `apps/api/src/adapter/out/persistence/security/PrismaIpListRepository.ts`：對應實作
- `apps/api/src/application/port/in/security/SecurityUseCases.ts`：加 4 個新 use case + command
- `apps/api/src/application/service/security/SecurityServices.ts`：加 4 個 service class
- `apps/api/src/application/facade/SecurityFacade.ts`：加 4 個分派方法、改 remove 簽章
- `apps/api/src/adapter/in/web/security/SecurityController.ts`：
  - 新增 4 個 endpoint handler
  - DELETE handler param `:ip` → `:id`（仍用 `ZodValidationPipe` 但改 uuid schema）
- 新增 DTO 檔：`UpdateIpWhitelistRequest.ts` / `UpdateIpBlacklistRequest.ts`
- 新增 `apps/api/src/domain/exception/IpListNotFoundException.ts`
- `apps/api/src/adapter/in/web/filter/GlobalExceptionFilter.ts` + spec：加分支
- `apps/api/src/modules/security.module.ts`：註冊 4 個新 use case
- Swagger：新增 4 yaml + 2 yaml param 改名；`openapi.yaml` paths 區段加 4 條
- `apps/api/test/security.e2e-spec.ts`：對齊新 path + 補新 case
- 重打 `pnpm --filter @app/api swagger:bundle && pnpm --filter @app/api-client generate`

### 前端

- **新增頁面與 routes/security/ 結構**：
  - `routes/security/ip-whitelist/{page.tsx, hooks/, components/}`
  - `routes/security/ip-blacklist/{page.tsx, hooks/, components/}`
- `routes/_nav-items.ts`：加 group「安全」與兩條（`requiredRoleCode: 'SUPERADMIN'`）
- `App.tsx`：加 `/security/ip-whitelist` / `/security/ip-blacklist` 兩個 route
- 共用元件：DataTable / DataTablePagination / SearchBar pattern / Sonner toast / form schema with zod 都既有

### 無變動

- 權限模型（SUPERADMIN role gate）
- auth / token blacklist 周邊
- DB schema
- IP list 的硬刪除行為
