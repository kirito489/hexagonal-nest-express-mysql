## MODIFIED Requirements

### Requirement: Sidebar 多項目導航與權限可見性

Sidebar SHALL 支援多項目分組導航、依使用者權限動態決定哪些項目可見，並在 footer 顯示目前使用者資訊。

- Sidebar 項目 MUST 集中宣告為一份資料結構（`routes/_nav-items.ts`），每筆 NavItem 包含：
  - `label` / `path` / `icon`（必要）
  - `group?: string`：屬於哪個 sidebar group（如「使用者與權限」「安全」）；未指定為「無 group」獨立顯示於最上。
  - `requiredPermission?: string`：細粒度權限門檻，使用者 permissions 不含此 code 時項目隱藏。
  - `requiredRoleCode?: 'SUPERADMIN'`：粗粒度 role 門檻（與 permission 並用，兩者皆通才顯示）；給 security 等 SUPERADMIN-only 模組用。
- 渲染邏輯 MUST 滿足：
  1. 先依 `requiredPermission` 與 `requiredRoleCode` 過濾出可見項目。
  2. 依 `group` 分組；每組渲染一個 `<SidebarGroup>` + `<SidebarGroupLabel>`（label 顯示 group 名）。
  3. 無 group 的項目（如「首頁」）獨立成一塊，固定排在所有 group 之上。
  4. 若某 group 過濾後完全空（所有 item 都被權限擋掉），整個 group MUST NOT 渲染，連 SidebarGroupLabel 都不出現。
- Sidebar footer MUST 顯示目前登入使用者資訊（取代既有「登出」單一按鈕）：
  - 頭像（lucide `User` icon；不做名稱首字 fallback）
  - 名稱（粗體）+ email（小灰）
  - 點下去彈 shadcn `DropdownMenu`，內含至少：
    - 「個人設定」（連到 `/profile`；該頁面是否存在不在本 requirement 範圍）
    - 「登出」（執行 `tokenStorage.clear` + `queryClient.clear` + navigate('/login')）

#### Scenario: 無 BACKEND:ACCOUNT:VIEW 權限

- **WHEN** 使用者登入後 permissions 不含 `BACKEND:ACCOUNT:VIEW`
- **THEN** Sidebar 不顯示「會員管理」項目；若「使用者與權限」group 內所有項目都因權限被擋，整個 group 連 label 也不出現

#### Scenario: 非 SUPERADMIN 角色

- **WHEN** 使用者 roleCode 非 `'SUPERADMIN'`
- **THEN** Sidebar「安全」group 整組（含 label）不顯示，無論使用者其他 permissions 為何

#### Scenario: 角色變更後即時反應

- **WHEN** 管理員修改使用者 roleId 後，使用者重新登入或 `useCurrentMember` 快取重整
- **THEN** Sidebar 依新 permissions / roleCode 重新計算可見項目與 group

#### Scenario: Footer 顯示使用者資訊

- **WHEN** 使用者已登入並進到任一受保護頁面
- **THEN** Sidebar footer 顯示頭像 + 名稱 + email；點下去彈出 dropdown 含「個人設定」與「登出」

#### Scenario: 點 footer 登出

- **WHEN** 使用者在 sidebar footer 的 user menu 點「登出」
- **THEN** 清掉 access / refresh token、清掉 TanStack Query cache、導向 `/login`
