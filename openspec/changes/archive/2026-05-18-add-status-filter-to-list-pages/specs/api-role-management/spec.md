## ADDED Requirements

### Requirement: 角色列表支援 status 篩選

`GET /api/roles` SHALL 支援 `?status=true|false` query 參數依啟用狀態過濾結果。

- Query 參數：`status?: boolean`（zod `z.coerce.boolean().optional()`，Swagger enum `[true, false]`）。
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
