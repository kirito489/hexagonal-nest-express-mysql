## ADDED Requirements

### Requirement: 角色選項分頁查詢 endpoint

`GET /api/members/role/options` SHALL 以分頁方式回傳啟用中（`status: true` 且 `deletedAt: null`）的角色清單，供會員建立 / 編輯 dialog 的角色 Combobox 使用。

- Query 參數：`page?: number`（預設 1，須為正整數）、`limit?: number`（預設 20，須為正整數，上限由後端決定，建議 100）、`search?: string`（名稱模糊，trim 後若為空字串視為未提供）。
- Response status 200，body 為 `{ success: true, data: { list, meta }, timestamp }`：
  - `list`：`RoleOption[]`，每筆 `{ id: string (uuid), name: string, isDefault: boolean }`。
  - `meta`：`{ page, limit, total, totalPages }`，與 `/api/members`、`/api/roles` 同 shape。
- 排序：依 `createdAt asc`（與既有行為一致）。
- 仍需要 `BACKEND:ACCOUNT:VIEW` 權限與 JWT Bearer Token。
- 每筆 `isDefault` 旗標 MUST 保留並原樣回傳；前端負責 disabled 顯示。
- 軟刪除（`deletedAt != null`）的角色 MUST NOT 出現。

#### Scenario: 預設分頁

- **WHEN** 已登入有 VIEW 權限的使用者打 `GET /api/members/role/options`（無 query）
- **THEN** 回 200，body `data` 含第一頁前 20 筆，`meta.page = 1`、`meta.limit = 20`

#### Scenario: 指定 page / limit

- **WHEN** 使用者打 `GET /api/members/role/options?page=2&limit=10`
- **THEN** 回 200，body `data.list` 為第 2 頁前 10 筆，`meta.page = 2`、`meta.limit = 10`、`meta.total` 為符合條件的角色總數

#### Scenario: 名稱搜尋

- **WHEN** 使用者打 `GET /api/members/role/options?search=admin`
- **THEN** 回 200，body `data.list` 僅含名稱含 `admin` 的角色，`meta.total` 為符合搜尋條件的角色數

#### Scenario: search 為空字串視為未提供

- **WHEN** 使用者打 `GET /api/members/role/options?search=`
- **THEN** 回 200，等同無 search，回所有啟用中角色

#### Scenario: 無 token

- **WHEN** 未帶 Authorization header
- **THEN** 回 401

#### Scenario: 無 VIEW 權限

- **WHEN** 已登入但無 `BACKEND:ACCOUNT:VIEW`
- **THEN** 回 403

### Requirement: 角色選項單筆查詢 endpoint（fallback）

`GET /api/members/role/options/:id` SHALL 回單一啟用中角色的 RoleOption shape，供前端「編輯帶入既有 roleId 不在第一頁」時的 fallback fetch。

- Path 參數：`id: string` (uuid)。
- Response status 200，body 為 `{ success: true, data: RoleOption, timestamp }`，shape `{ id, name, isDefault }` 與 list endpoint 一致。
- 軟刪除或停用（`status: false`）的角色 MUST 回 404，body 含 `code: "ROLE_NOT_FOUND"`。
- 仍需要 `BACKEND:ACCOUNT:VIEW` 權限與 JWT。
- 與 `GET /api/roles/:id` 區隔：本 endpoint 給「會員」場景使用，權限與資料窄化（不含 `permissionCodes`、`createdAt` 等），讓沒有 `BACKEND:ROLE:VIEW` 權限的帳號管理者也能取得 fallback。

#### Scenario: 找到啟用角色

- **WHEN** 使用者打 `GET /api/members/role/options/<uuid>`，且該角色 `status: true` 且未軟刪除
- **THEN** 回 200，body `data` 為 `{ id, name, isDefault }`

#### Scenario: 角色不存在或已停用

- **WHEN** 該 id 對應的角色不存在 / 軟刪除 / `status: false`
- **THEN** 回 404，body `code: "ROLE_NOT_FOUND"`

#### Scenario: 無 VIEW 權限

- **WHEN** 已登入但無 `BACKEND:ACCOUNT:VIEW`
- **THEN** 回 403
