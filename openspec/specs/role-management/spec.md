# role-management Specification

## Purpose

定義後端「角色管理」API 行為。本 spec 初版聚焦在 `PATCH /api/roles/:id` 的更新能力——
name / permissionCodes 既有行為，以及為支援前端列表 Switch 即時切換而新增的 `status`
欄位。未來新增 role API 行為（list / get / create / delete 等）時，於本 spec 內擴充對應
Requirement 區塊。

## Requirements

### Requirement: 角色更新支援 status 切換

`PATCH /api/roles/:id` SHALL 支援在 request body 提供 `status: boolean` 以切換角色啟用狀態，與既有 `name` / `permissionCodes` 一致皆為選填。

- Request body 為 JSON 物件，欄位皆選填：`name?: string`、`permissionCodes?: string[]`、`status?: boolean`。
- 若 body 不含 `status`，後端 MUST 保留現有的 status，不做變更。
- 若 body 含 `status: true | false`，後端 MUST 將該角色的 `status` 欄位更新為對應值。
- `name` / `permissionCodes` 既有行為不變（省略=不變、`permissionCodes: []`=清空）。
- 與其他欄位同送時 MUST 在同一個資料庫 transaction 內完成更新（避免「name 已改、status 未改」的中間態）。
- 此 endpoint 仍需要 `BACKEND:ROLE:EDIT` 權限。
- 預設角色（`isDefault === true`）仍 MUST 回 400 `DEFAULT_ROLE_NOT_EDITABLE`，與 `name` / `permissionCodes` 一致。
- 角色不存在仍 MUST 回 404 `ROLE_NOT_FOUND`。
- Swagger（`apps/api/docs/swagger/roles/update.yaml`）MUST 將 `status: boolean` 加入 `requestBody` schema，重新打包後 `@app/api-client` 型別 MUST 包含 `status?: boolean`。

#### Scenario: 僅切換 status

- **WHEN** 管理員以 `BACKEND:ROLE:EDIT` token 對某非預設角色發送 `PATCH /api/roles/{id}` body `{ "status": false }`
- **THEN** 回應 204，DB 中該角色 `status` 變為 `false`，`name` 與 `permissions` 保持不變

#### Scenario: name + status 同送

- **WHEN** body 為 `{ "name": "審核人員", "status": true }`
- **THEN** 回應 204，DB 中該角色 `name` 更新且 `status` 為 `true`，`permissions` 不變

#### Scenario: 預設角色不可變更 status

- **WHEN** 對 `isDefault === true` 的角色 PATCH `{ "status": false }`
- **THEN** 回應 400，body 含 `code: "DEFAULT_ROLE_NOT_EDITABLE"`，DB 不變

#### Scenario: status 型別錯誤

- **WHEN** body 為 `{ "status": "off" }`
- **THEN** 回應 400 並指出 status 必須為 boolean（zod schema 拒絕）

### Requirement: 角色列表支援 status 篩選

`GET /api/roles` SHALL 支援 `?status=true|false` query 參數依啟用狀態過濾結果。

- Query 參數：`status?: boolean`（zod `z.enum(['true', 'false']).transform(...)` 嚴格解析，Swagger enum `[true, false]`）。
- 不帶 `status` MUST 視為「不過濾」：回啟用 + 停用兩者。
- `status=true` MUST 僅回 `status: true` 的角色；`status=false` MUST 僅回 `status: false` 的角色。
- `meta.total` MUST 反映套用 status 過濾後的總筆數。
- 軟刪除（`deletedAt != null`）的角色 MUST NOT 出現，與 status 無關。
- 仍需要 `BACKEND:ROLE:VIEW` 權限與 JWT Bearer Token。
- 與既有 `name` / `page` / `limit` 同時生效時 MUST 套交集。
- Swagger（`apps/api/docs/swagger/roles/list.yaml`）MUST 將 `status: boolean` 加入 query parameters，重新打包後 `@app/api-client` 型別 MUST 包含 `status?: boolean`。

#### Scenario: 未帶 status 不過濾

- **WHEN** 已登入使用者打 `GET /api/roles`
- **THEN** 回 200，body `data.list` 同時包含啟用與停用角色

#### Scenario: status=true 僅回啟用

- **WHEN** 使用者打 `GET /api/roles?status=true`
- **THEN** 回 200，body `data.list` 每筆 `status === true`

#### Scenario: status=false 僅回停用

- **WHEN** 使用者打 `GET /api/roles?status=false`
- **THEN** 回 200，body `data.list` 每筆 `status === false`

#### Scenario: 與 name 並用為交集

- **WHEN** 使用者打 `GET /api/roles?status=false&name=admin`
- **THEN** 回 200，body `data.list` 僅含「停用 + 名稱含 admin」的角色

#### Scenario: 非合法 status 值

- **WHEN** 使用者打 `GET /api/roles?status=foo`
- **THEN** 回 400（zod enum 拒絕非 `'true' | 'false'` 值）
