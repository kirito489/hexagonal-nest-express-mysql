## ADDED Requirements

### Requirement: 會員列表支援 status 篩選

`GET /api/members` SHALL 支援 `?status=true|false` query 參數依啟用狀態過濾結果。

- Query 參數：`status?: boolean`（zod `z.coerce.boolean().optional()`，Swagger enum `[true, false]`）。
- 不帶 `status` MUST 視為「不過濾」：回啟用 + 停用兩者。
- `status=true` MUST 僅回 `status: true` 的會員；`status=false` MUST 僅回 `status: false` 的會員。
- `meta.total` MUST 反映套用 status 過濾後的總筆數。
- 軟刪除（`deletedAt != null`）的會員 MUST NOT 出現，與 status 無關。
- 仍需要 `BACKEND:ACCOUNT:VIEW` 權限與 JWT Bearer Token。
- 與既有 `name` / `email` / `page` / `limit` 同時生效時 MUST 套交集。
- Swagger（`apps/api/docs/swagger/members/list.yaml`）MUST 將 `status: boolean` 加入 query parameters，重新打包後 `@app/api-client` 型別 MUST 包含 `status?: boolean`。

#### Scenario: 未帶 status 不過濾

- **WHEN** 已登入使用者打 `GET /api/members`
- **THEN** 回 200，body `data.list` 同時包含啟用與停用會員

#### Scenario: status=true 僅回啟用

- **WHEN** 使用者打 `GET /api/members?status=true`
- **THEN** 回 200，body `data.list` 每筆 `status === true`

#### Scenario: status=false 僅回停用

- **WHEN** 使用者打 `GET /api/members?status=false`
- **THEN** 回 200，body `data.list` 每筆 `status === false`

#### Scenario: 與 name 並用為交集

- **WHEN** 使用者打 `GET /api/members?status=false&name=admin`
- **THEN** 回 200，body `data.list` 僅含「停用 + 名稱含 admin」的會員

#### Scenario: 無 token

- **WHEN** 未帶 Authorization header
- **THEN** 回 401
