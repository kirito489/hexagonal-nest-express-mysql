## RENAMED Requirements

- FROM: `### Requirement: 會員列表頁路由與導航`
- TO: `### Requirement: 管理者帳號列表頁路由與導航`

## MODIFIED Requirements

### Requirement: 管理者帳號列表頁路由與導航

`apps/web/` SHALL 提供 `/members` 路由作為**管理者帳號**列表頁，並在 Sidebar 加入導向此頁的選項。

**用字一律是「管理者帳號」，MUST NOT 用「會員」。** 這一頁管的是能登入後台的帳號，
而「會員」在一般用法裡指終端使用者。原本 Sidebar 與頁面標題寫「會員管理」，
**頁面副標卻寫「管理後台帳號」——標題與它自己的副標互相矛盾**。

同一個名字 MUST 在四處一致：Sidebar 標籤、頁面標題、權限樹的模組名
（`MODULE_LABELS.ACCOUNT`）、`PERMISSION_CATALOG` 的 `name`。
**沒有守則擋得住這種漂移**——`permission-codes-sync.spec.ts` 檢查的是
「對照是否齊全」，兩邊都在但用詞不同時它全綠。

- `/members` 路由 MUST 受 `RequireAuth` 保護，未登入導向 `/login`。
- Sidebar MUST 提供「管理者帳號」項目，連到 `/members`，圖示使用 `lucide-react` 的 `Users`。
- 使用者沒有 `BACKEND:ACCOUNT:VIEW` 權限時 MUST NOT 看到 Sidebar 的該項目；
  若直接造訪 `/members`，**MUST 就地顯示「沒有存取權限」**——
  見 `platform-frontend-conventions` 的「權限不足時就地顯示說明」。
  （原文寫「MUST 導向 `/`」，那是 `ui-route-permission-guard` 之前的行為。）

#### Scenario: 已登入有 VIEW 權限的使用者瀏覽 /members

- **WHEN** 使用者點 Sidebar 的「管理者帳號」
- **THEN** 路由跳轉到 `/members`，渲染 DataTable

#### Scenario: 已登入但無 VIEW 權限直接打 URL

- **WHEN** 使用者在網址列輸入 `/members`
- **THEN** 就地顯示「沒有存取權限」並標出缺少的權限碼，MUST NOT 渲染列表

#### Scenario: 用字一致

- **WHEN** 檢視 Sidebar、頁面標題與角色表單的權限樹
- **THEN** 三處對同一個模組顯示相同的名稱
