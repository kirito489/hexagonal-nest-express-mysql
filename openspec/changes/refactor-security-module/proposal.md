## Why

`SecurityController` 與 `SecurityFacade` 是專案中第一個寫的「後台管理」端點，當時前端還沒落地，許多 convention（hexagonal layer、回應 shape、分頁）後來才靠 member / role 模組建立起來。現在前端兩個 list 頁 + status filter 都成熟了，回頭看 security 模組有以下不一致：

- Facade 直接呼叫 port，跳過 UseCase / Service 層，導致 domain 行為（IP 正規化、unlock 前狀態檢查等）沒地方放
- `listXxx` 回扁平 array、`addXxx` 回 `{ message: '...' }` 字串，與其他模組的 `{ list, meta }` / `201 + { id }` / `204` shape 全部脫節
- 沒分頁、沒搜尋，IP 多時 dropdown 撐爆
- 沒有 openspec capability spec，行為無治理
- `unlockAccount` 不檢查 email 是否存在 / 是否處於鎖定，靜默通過任何輸入

順手把 sidebar 也升級：為了讓未來 security / system 等更多模組可以分組顯示，把 sidebar 從扁平改為 grouped；同時補上 footer user menu（頭像 + 名稱 / email + dropdown）取代目前只有「登出」單一按鈕的設計。SUPERADMIN-only 模組（security）的整組可見性也靠這次的 `requiredRoleCode` 欄位機制處理。

## What Changes

### 後端架構修正

- **補 UseCase / Service 層**：每個動作（list / add / remove whitelist / blacklist、unlock account）拆出 use case + service。Facade 不再 inline 呼 port。
- **List 回應改 `{ list, meta }`**：`listWhitelist` / `listBlacklist` 加 `page` / `limit` / `search`（IP 模糊）query；response shape 與 `/api/members`、`/api/roles` 對齊。
- **Add 改 201 + `{ id }`**：`addToWhitelist` / `addToBlacklist` 不再回 `{ message }` 字串；用 resource id 比較有意義。
- **Remove 改 204**：`removeFromWhitelist` / `removeFromBlacklist` 不回 body。
- **unlockAccount 加 2 個 domain exception**：`EmailNotFoundException`（帳號不存在 → 404）、`AccountNotLockedException`（帳號未鎖 → 409）；`GlobalExceptionFilter` 補 instanceof 分支。回應改 204（成功）。
- **權限模型不變**：維持 `RolesGuard + @Roles(SUPERADMIN)` 粗粒度 role gate（這是 security 模組的刻意設計，比 permission 細粒度更嚴）。

### 後端 schema / Swagger / api-client / 測試

- `IpListPort` 改簽章：`listWhitelist(params)` / `listBlacklist(params)` 接 `{ page, limit, search? }`，回 `{ list, total }`。
- `PrismaIpListRepository` 用 `$transaction([findMany, count])` + `where.ipAddress: { contains: search }`。
- 7 個 Swagger yaml 全部對齊新 shape；重打 `pnpm --filter @app/api swagger:bundle && pnpm --filter @app/api-client generate`。
- `security.e2e-spec.ts` 對齊新 shape；補新 case（分頁、IP 搜尋、unlockAccount 三分支）。

### Sidebar 改 grouped + 加 user menu

- `routes/_nav-items.ts` 的 `NavItem` 加：
  - `group?: string` — 屬於哪個 sidebar group（如「使用者與權限」「安全」）。
  - `requiredRoleCode?: 'SUPERADMIN'` — 粗粒度 role gate（與既有 `requiredPermission` 並用，兩者皆通才顯示）。
- `_layout.tsx` 依 group 渲染多個 `<SidebarGroup>` + `<SidebarGroupLabel>`；整組空（所有 item 都被權限過濾掉）就不渲染。
- 既有兩條 NAV_ITEMS 歸到「使用者與權限」group；首頁無 group（獨立區塊放最上）。
- **Sidebar footer 改 user menu**：取代目前「登出」單一按鈕。內含使用者頭像（lucide `User` icon 或名稱首字）+ 名稱（粗） + email（小灰），點下去彈 shadcn `DropdownMenu`：
  - 「個人設定」（連到 `/profile`，本次不做頁面但 menu item 先放）
  - 「登出」（既有 handleLogout，含 `tokenStorage.clear` + `queryClient.clear`）
- 此次不新增 `/security` 前端路由（前端頁面留下一個 change 做）。

### 治理 / 文件

- **新增 capability `security-management`**：定義 IP 黑白名單 + 帳號解鎖的後端 endpoint 行為、SUPERADMIN role gate、回應 shape。
- **MODIFIED `frontend-admin`**：既有「Sidebar 多項目導航與權限可見性」requirement 補上 group 結構、`requiredRoleCode`、footer user menu。

## Capabilities

### New Capabilities

- `security-management`：後端安全管理 endpoint 規格（IP 黑白名單 CRUD、帳號解鎖）。

### Modified Capabilities

- `frontend-admin`：既有 sidebar requirement 補 group、role gate、footer user menu。

## Impact

### 後端

- `apps/api/src/application/facade/SecurityFacade.ts`：改為呼叫 use case，不直接打 port
- `apps/api/src/application/port/in/security/`：**新增資料夾**，每個 use case 一個 port file
- `apps/api/src/application/service/security/`：**新增資料夾**，對應 service
- `apps/api/src/application/port/out/security/IpListPort.ts`：list 簽章改分頁
- `apps/api/src/adapter/out/persistence/security/PrismaIpListRepository.ts`：實作分頁 + 搜尋
- `apps/api/src/adapter/in/web/security/SecurityController.ts`：回應 shape 對齊；list 加 query schema
- `apps/api/src/domain/exception/`：新增 `EmailNotFoundException.ts`、`AccountNotLockedException.ts`
- `apps/api/src/adapter/in/web/filter/GlobalExceptionFilter.ts`：加兩個 instanceof 分支 + 404 / 409
- `apps/api/src/application/service/auth/UnlockAccountService.ts` 或在 security 內：unlock 前查 `memberRecord` 是否存在 + 是否 `lockedAt != null`
- `apps/api/src/modules/security.module.ts`：註冊新 use case provider
- `apps/api/docs/swagger/security/*.yaml`：7 個 yaml 全部對齊
- `packages/api-client/src/schema.ts`：重打
- `apps/api/test/security.e2e-spec.ts`：對齊 + 補新 case

### 前端

- `apps/web/src/routes/_nav-items.ts`：`NavItem` 加 `group` / `requiredRoleCode`；既有兩條歸到「使用者與權限」group
- `apps/web/src/routes/_layout.tsx`：依 group 渲染；footer 換成 user menu
- `apps/web/src/lib/use-current-member.ts`：已存在，會被 sidebar footer 引用（補回 `member` 與 `email` 欄位以便顯示）
- `apps/web/src/components/SidebarUserMenu.tsx`：**新檔**，footer user menu 元件

### 無變動

- 權限模型（SUPERADMIN role gate 維持）
- auth login / refresh / blacklist 周邊機制
- DB schema
- frontend routes（`/security` 留給下一個 change）
