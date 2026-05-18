## Context

Security 模組現況：

```
SecurityController → SecurityFacade → IpListPort / AccountLockPort
                                    （直接 inline，無 UseCase / Service 層）
```

問題盤點：
- 跳層（少 UseCase / Service）
- 回應 shape 與其他模組脫節
- 沒分頁 / 搜尋
- 沒 capability spec
- unlockAccount domain 行為單薄

Sidebar 現況：扁平 NAV_ITEMS + footer 單一「登出」。未來 security / system 等多模組加入後需要分組。

## Goals / Non-Goals

**Goals：**

- 把 security 模組對齊 member / role 的 hexagonal 結構與 list / write 回應 shape。
- list 加分頁 + IP 模糊搜尋，與其他模組 list pattern 一致。
- unlockAccount 行為明確化：email 不存在 → 404；帳號未鎖 → 409。
- 建立 `security-management` capability spec，未來行為變動有 master 治理。
- Sidebar 升級為 grouped，並在 footer 加 user menu，為 SUPERADMIN-only 模組與更多分組做準備。

**Non-Goals：**

- 不新增 `/security` 前端頁面（留下一個 change）。
- 不改 security 權限模型（維持 SUPERADMIN role gate，不換 PermissionsGuard）。
- 不動 auth login / refresh / blacklist 等周邊。
- 不做頂端 header 上的使用者顯示（user menu 只放 sidebar footer）。
- 不做頭像上傳功能（沒上傳時用 lucide `User` icon 或名稱首字）。
- 不做 `/profile` 頁面（user menu dropdown 內項目先擺著，連結成立但實際頁面下一個 change）。

## Decisions

### D1：Use case 拆分粒度

- **選擇**：每個動作一個 use case（共 7 個）：
  - `ListIpWhitelistUseCase`、`AddIpWhitelistUseCase`、`RemoveIpWhitelistUseCase`
  - `ListIpBlacklistUseCase`、`AddIpBlacklistUseCase`、`RemoveIpBlacklistUseCase`
  - `UnlockAccountUseCase`
- **替代方案**：兩個聚合 use case（`ManageIpListUseCase` / `ManageAccountLockUseCase`），各自吃 action enum 區分。
- **理由**：與 member / role 模組粒度一致（每個 endpoint = 一個 use case = 一個 service）；測試與 mock 邊界清楚；新增第三方 use case（如 audit log）也按同樣 pattern 落地。

### D2：List 回應 shape 對齊 `{ list, meta }`

- `GET /api/security/ip-whitelist?page=&limit=&search=` 與 `/ip-blacklist?...` 同 shape。
- `search` 對 IP 做 `contains`（與 member name / role name 同 pattern）；trim 後空字串視為未提供。
- `meta` 用 `{ page, limit, total, totalPages }`（沿用 `buildPaginationMeta`）。

### D3：Add 改 201 + `{ id }`

- `POST /api/security/ip-whitelist` 成功回 `{ success: true, data: { id }, timestamp }`（id 是 IpWhitelistRecord 的 PK uuid）。
- 不再回 `{ message: 'IP X 已加入白名單' }`（訊息留給前端組合）。
- 黑名單同上。

### D4：Remove / Unlock 改 204

- `DELETE /api/security/ip-whitelist/:ip` 已是 204，不動。
- `POST /api/security/unlock-account` 改 204（既有 200 + `{ message }` 拿掉）。

### D5：unlockAccount 加 2 個 domain exception

- 在 `UnlockAccountService` 內：
  - 找不到該 email 的 member → `EmailNotFoundException`（404，code `EMAIL_NOT_FOUND`）
  - 找到但 `lockedAt == null` 且 `failedLoginCount === 0` → `AccountNotLockedException`（409，code `ACCOUNT_NOT_LOCKED`）
- `GlobalExceptionFilter` 補兩個 instanceof 分支。
- **替代方案**：靜默通過 / 都回 204。
- **理由**：admin 工具的 unlock 動作要明確回饋；前端能依 code 顯示精準 toast。

### D6：IpListPort 簽章升級

- 既有：`listWhitelist(): Promise<IpListItem[]>`、`listBlacklist(): Promise<IpBlacklistItem[]>`
- 新版：
  ```ts
  interface ListIpParams { page: number; limit: number; search?: string }
  interface ListIpResult<T> { list: T[]; total: number }
  listWhitelist(params: ListIpParams): Promise<ListIpResult<IpListItem>>
  listBlacklist(params: ListIpParams): Promise<ListIpResult<IpBlacklistItem>>
  ```
- **替代方案**：保留舊方法、加新 `listWhitelistPaged`；舊方法 deprecate。
- **理由**：呼叫端就 SecurityFacade（已準備改 service），直接改簽章；avoid dead code。

### D7：Sidebar grouped 結構

```ts
type NavItem = {
  label: string
  path: string
  icon: LucideIcon
  group?: string                    // 屬於哪個 group（如「使用者與權限」）
  requiredPermission?: string       // 既有
  requiredRoleCode?: 'SUPERADMIN'   // 新增：粗粒度 role gate
}
```

- 渲染邏輯：
  1. 依 `requiredPermission` + `requiredRoleCode` 過濾 NAV_ITEMS（兩者皆通才保留）。
  2. 依 `group` 分組（無 group 的歸「__default__」放最上）。
  3. 每組渲染一個 `<SidebarGroup>` + `<SidebarGroupLabel>{group}</SidebarGroupLabel>`。
  4. 整組空（所有 item 被過濾掉）就不渲染整個 group（連 label 都消失）。
- **替代方案**：collapsible group（每組可摺疊）。
- **理由**：admin sidebar 通常 ≤ 15 項全展開能一眼掃完；collapsible 增加狀態管理（誰預設展開？localStorage？換頁要不要重置？）三個 corner case，得不償失。

### D8：Sidebar footer User menu

- 元件：新檔 `apps/web/src/components/SidebarUserMenu.tsx`
- 結構：`SidebarMenuButton`（含頭像 + 名稱 + email） → 點下去 `DropdownMenu`
  ```
  [👤 王小明]
  [   alan@x.com]
  ─────────────
  個人設定 →
  登出
  ```
- 資料來源：`useCurrentMember()` 回傳的 `member`（名稱）與 `email`。
- 頭像 fallback：lucide-react `User` icon（不做名稱首字 avatar，後者要加 logic 不值得）。
- **替代方案**：放頂端 header 右上角。
- **理由**：與 shadcn sidebar 範本一致；header 留給未來 breadcrumb / 切組織 等擴充。

### D9：useCurrentMember 補 email

- 目前 `useCurrentMember()` 是否回 `email`？看 `apps/web/src/lib/use-current-member.ts`。若沒有，要從 `/api/auth/me` response 帶出來（後端 `getMyProfile` 應該有）。
- 若 `member.email` 沒在 `MemberContext` type 內，補上。

### D10：security-management capability spec

- 7 個 Requirement（每個 endpoint 一個）：
  - IP whitelist list / add / remove
  - IP blacklist list / add / remove
  - Account unlock
- 共通 Requirement：「需要 `roleCode === 'SUPERADMIN'`」（一條獨立 Requirement 涵蓋全模組權限）
- 不需要為 `IpListPort` / `AccountLockPort` 寫 spec（port 是實作細節，不是 capability 行為）。

## Risks / Trade-offs

- **[Risk] IpListPort 簽章改動會影響使用此 port 的非 controller 邏輯**：例如 IP middleware / guard 可能也呼叫 `isWhitelisted` / `isBlacklisted`，但這兩個方法不動。`listXxx` 應該只被 SecurityFacade 呼叫，影響面小。**Mitigation**：grep `listWhitelist\b\|listBlacklist\b` 確認只有 facade 用到。
- **[Risk] e2e mock 對 prisma `ipWhitelistRecord.findMany` / `count` 需要對齊新 transaction 呼叫**：原本只有 `findMany.mockResolvedValue([])`，加分頁後變 `$transaction([findMany, count])`。**Mitigation**：mock `ipWhitelistRecord.count` 預設 0；e2e setup 內補一行。
- **[Risk] `EmailNotFoundException` 暴露 email 列舉風險**：admin 端的 unlockAccount 收 email，回 404 / 409 會讓 admin 知道哪些 email 存在。**Acceptable**：admin 已經能透過 /members 列出所有 email，沒有額外洩漏。
- **[Trade-off] Sidebar 不做 collapsible** → 未來 nav 真的爆量再考慮（>15 項）。
- **[Trade-off] user menu 頭像不做名稱首字 fallback** → lucide User icon 足夠，後者要 i18n + 顏色配置不值得。
- **[Trade-off] `/profile` 連結先擺著但頁面不做** → menu item 看起來「會動」但點下去 404；可接受，因為 admin 自己會做或下一個 change 補上。**Mitigation**：item 加 disabled 屬性 + tooltip「下一版提供」。

## Migration Plan

階段化執行，每階段獨立可驗證：

1. **後端 port / use case / service 骨架**：拆出 7 個 use case + service；module 註冊；先讓 Facade 走新層但行為不變（list 仍回扁平 array、add 仍回 message）。
2. **List shape + 分頁 + 搜尋**：IpListPort 簽章升級；repo 實作；e2e 對齊。
3. **Add / Remove / Unlock response shape**：controller 改回 201 + { id } / 204；e2e 對齊。
4. **unlockAccount domain exception**：新增 2 個 exception + filter 分支 + service 內檢查；e2e 補 3 個 case（成功 / 404 / 409）。
5. **Swagger + api-client**：7 個 yaml 對齊、重打 client。
6. **security-management spec**：寫 master spec。
7. **Sidebar grouped + user menu**：NAV_ITEMS 加欄位、_layout.tsx 重寫、SidebarUserMenu 元件、frontend-admin spec MODIFY。
8. **驗證 + 手動測試**。

回退策略：每個 phase 獨立 commit，回退 phase n 不影響 phase 1..n-1。

## Open Questions

- **email 搜尋 unlock-account 是否要做**：unlock 是「給 admin 處理被鎖帳號」場景，admin 可能不記得完整 email；要不要允許 partial 輸入？**第一版維持完整 email**（與既有 `unlockAccountSchema` 一致），有需要再加。
- **IP search 是否要支援 CIDR / 範圍**：第一版只做 `contains` 子字串比對；CIDR 比對成本大且使用情境不明，先擱置。
- **/profile 路由是否要在這次連帶建立**：第一版只放 menu item（disabled + tooltip「下一版提供」）；正式頁面留下一個 change，避免單一 PR 太大。
