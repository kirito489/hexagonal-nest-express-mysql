## MODIFIED Requirements

### Requirement: 更新角色

`PATCH /api/admin/roles/:id` SHALL 更新角色的 `name`、`permissionCodes` 或 `status`，
三者均為選填：**省略表示不變更**，`permissionCodes` 傳空陣列 `[]` 表示清空所有權限。
MUST 要求 `BACKEND:ROLE:EDIT`。預設角色（`isDefault === true`）MUST 拒絕編輯。

多欄位同送時 MUST 在**同一個資料庫 transaction** 內完成，
不得留下「name 已改但 status 未改」的中間狀態。

**授權變更後 MUST 清除該角色全體成員的 `MemberContext` 快取。**
`MemberContext` 帶 `roleName` / `roleCode` / `permissions` 三者且快取於 Redis，
效期為 `PERMISSION_CACHE_TTL`（預設 300 秒）。不清的話，
**撤銷一個權限最多要等一個效期才生效**，而畫面與資料庫都顯示已經撤銷了——
沒有任何錯誤訊息，管理員會以為處理完成。

清除 MUST **一律執行，不判斷「這次改的是不是授權」**。判斷需要比對前後的權限集合，
而寫錯的方向是**該清沒清**；多清的代價只是受影響成員的下一個請求回頭查一次資料庫。

清除失敗 MUST NOT 被吞掉。語意是「權限改了但沒有生效」，
回報成功會讓呼叫端處於一個他不知道的狀態。這與 `updateLastLoginAt`
那種 fire-and-forget 不同：後者失敗只損失一個時間戳。

成功 MUST 回 `204 No Content`，**沒有回應主體**。

**Request**（path `id: string (uuid)`；body 全部選填）：

```json
{
  "name": "審核人員",
  "permissionCodes": ["BACKEND:ACCOUNT:VIEW"],
  "status": false
}
```

**Success Response** `204 No Content`：無 body。

**Failure Responses**：

- `400`：`name` 長度不合法，或 `status` 非 boolean
- `400`、`code: "DEFAULT_ROLE_NOT_EDITABLE"`：目標為預設角色
- `400`、`code: "INVALID_PERMISSION_CODE"`：含不存在的權限碼
- `400`、`code: "INVALID_PERMISSION_COMBINATION"`：有 EDIT 但缺同模組的 VIEW（僅限該模組也提供 VIEW 時，見「建立角色」）
- `401`、`code: "UNAUTHORIZED"`：未帶或無效 Token
- `403`、`code: "FORBIDDEN"`：缺 `BACKEND:ROLE:EDIT`
- `404`、`code: "ROLE_NOT_FOUND"`：角色不存在
- `409`、`code: "DUPLICATE_ROLE_NAME"`：新名稱已被其他角色使用

#### Scenario: 僅切換 status

- **WHEN** 對非預設角色 PATCH `{ "status": false }`
- **THEN** 回 `204`，該角色 `status` 變 `false`，`name` 與權限保持不變

#### Scenario: name 與 status 同送具原子性

- **WHEN** body 為 `{ "name": "審核人員", "status": true }`
- **THEN** 回 `204`，`name` 與 `status` 於同一 transaction 內同時生效，權限不變

#### Scenario: 清空權限

- **WHEN** body 為 `{ "permissionCodes": [] }`
- **THEN** 回 `204`，該角色所有權限被清空

#### Scenario: 撤銷的權限立即生效

- **WHEN** 某成員持有效 token 且其角色原本具備某權限，管理員將該權限自角色移除
- **THEN** 該成員的**下一個**請求即被拒絕，MUST NOT 需要等待快取效期

#### Scenario: 清快取失敗不得回報成功

- **WHEN** 授權已寫入資料庫但快取清除失敗
- **THEN** 該請求 MUST NOT 回 `204`——權限改了卻沒生效的狀態不能被回報為成功

#### Scenario: 省略欄位不變更

- **WHEN** body 為 `{ "name": "新名稱" }`
- **THEN** 回 `204`，`permissionCodes` 與 `status` MUST 維持原值

#### Scenario: 預設角色不可編輯

- **WHEN** 目標角色 `isDefault === true`
- **THEN** 回 `400`、`code: "DEFAULT_ROLE_NOT_EDITABLE"`，DB 不變

#### Scenario: status 型別錯誤

- **WHEN** body 為 `{ "status": "off" }`
- **THEN** 回 `400`（zod 拒絕非 boolean）

#### Scenario: 名稱與他人重複

- **WHEN** 新 `name` 已被其他未軟刪除的角色使用
- **THEN** 回 `409`、`code: "DUPLICATE_ROLE_NAME"`，不更新
