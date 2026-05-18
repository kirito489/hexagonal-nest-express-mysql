## ADDED Requirements

### Requirement: IP 白名單單筆查詢

`GET /api/security/ip-whitelist/:id` SHALL 回單筆 IP 白名單記錄。

- Path 參數：`id: string (uuid)`。
- Response 200，body `{ success: true, data: IpListItem, timestamp }`：`{ id, ipAddress, description, createdBy, createdAt }`。
- 找不到記錄 MUST 回 404，body `code: 'IP_LIST_NOT_FOUND'`。
- 仍需 SUPERADMIN role gate。

#### Scenario: 找到記錄

- **WHEN** SUPERADMIN 打 `GET /api/security/ip-whitelist/<uuid>`，且該記錄存在
- **THEN** 回 200，body `data` 為 `{ id, ipAddress, description, createdBy, createdAt }`

#### Scenario: 找不到記錄

- **WHEN** 該 uuid 對應的 whitelist 記錄不存在
- **THEN** 回 404，body `code: 'IP_LIST_NOT_FOUND'`

### Requirement: 更新 IP 白名單

`PATCH /api/security/ip-whitelist/:id` SHALL 更新指定 IP 白名單的可變欄位。

- Request body：`{ description?: string }`。`ipAddress` MUST NOT 可變（要改 IP 則刪除重建）。
- Response 204，無 body。
- 找不到記錄 MUST 回 404 `IP_LIST_NOT_FOUND`。
- 仍需 SUPERADMIN role gate。

#### Scenario: 更新成功

- **WHEN** SUPERADMIN 對某 whitelist 記錄發送 `PATCH /api/security/ip-whitelist/<uuid>` body `{ description: '新備註' }`
- **THEN** 回 204，DB 中該記錄 `description` 更新

#### Scenario: 找不到記錄

- **WHEN** 該 uuid 對應的 whitelist 不存在
- **THEN** 回 404，body `code: 'IP_LIST_NOT_FOUND'`

### Requirement: IP 黑名單單筆查詢

`GET /api/security/ip-blacklist/:id` SHALL 回單筆 IP 黑名單記錄。

- Path 參數：`id: string (uuid)`。
- Response 200，body `{ success: true, data: IpBlacklistItem, timestamp }`：`{ id, ipAddress, reason, isAutoBlock, createdBy, createdAt }`。
- 找不到記錄 MUST 回 404 `IP_LIST_NOT_FOUND`。

#### Scenario: 找到記錄

- **WHEN** SUPERADMIN 打 `GET /api/security/ip-blacklist/<uuid>`，且該記錄存在
- **THEN** 回 200，body `data` 為 IpBlacklistItem shape

#### Scenario: 找不到記錄

- **WHEN** 該 uuid 對應的 blacklist 不存在
- **THEN** 回 404，body `code: 'IP_LIST_NOT_FOUND'`

### Requirement: 更新 IP 黑名單

`PATCH /api/security/ip-blacklist/:id` SHALL 更新指定 IP 黑名單的可變欄位。

- Request body：`{ reason?: string }`。`ipAddress` / `isAutoBlock` MUST NOT 可變。
- Response 204，無 body。
- 找不到記錄 MUST 回 404 `IP_LIST_NOT_FOUND`。

#### Scenario: 更新成功

- **WHEN** SUPERADMIN 對某 blacklist 記錄發送 `PATCH /api/security/ip-blacklist/<uuid>` body `{ reason: '新理由' }`
- **THEN** 回 204，DB 中該記錄 `reason` 更新

#### Scenario: 找不到記錄

- **WHEN** 該 uuid 對應的 blacklist 不存在
- **THEN** 回 404，body `code: 'IP_LIST_NOT_FOUND'`

## MODIFIED Requirements

### Requirement: 從白名單移除 IP

`DELETE /api/security/ip-whitelist/:id` SHALL 從白名單移除指定記錄。

- Path 參數：`id: string (uuid)`，由 `ParseUUIDPipe` 驗證。
- 既有版本使用 `:ip` 當 path（IPv4 dot / IPv6 colon 需 URL encode）；本版本改用 uuid，與其他模組 `by id` 一致。
- Response 204，無 body。
- 維持硬刪（Prisma `delete({ where: { id } })`，schema 無 deletedAt 欄位）。
- 記錄不存在時 MUST 不報錯（靜默通過，與 member / role delete 行為對齊）。
- 仍需 SUPERADMIN role gate。

#### Scenario: 刪除成功

- **WHEN** SUPERADMIN 打 `DELETE /api/security/ip-whitelist/<uuid>`，且該記錄存在
- **THEN** 回 204，DB row 直接消失（硬刪）

#### Scenario: 記錄不存在靜默通過

- **WHEN** 該 uuid 對應的 whitelist 不存在
- **THEN** 回 204（不拋 404；與 member / role delete 行為對齊）

### Requirement: 從黑名單移除 IP

`DELETE /api/security/ip-blacklist/:id` SHALL 從黑名單移除指定記錄，與白名單對應。

- Path 參數：`id: string (uuid)`。
- Response 204。
- 維持硬刪、靜默處理「記錄不存在」。

#### Scenario: 刪除成功

- **WHEN** SUPERADMIN 打 `DELETE /api/security/ip-blacklist/<uuid>`
- **THEN** 回 204

#### Scenario: 記錄不存在靜默通過

- **WHEN** 該 uuid 對應的 blacklist 不存在
- **THEN** 回 204
