# security-management Specification

## Purpose

定義後端「安全管理」API 行為：IP 黑白名單 CRUD 與帳號解鎖。本 capability 與其他後台
管理 capability（member / role / etc.）的權限模型不同——刻意使用 `RolesGuard +
@Roles('SUPERADMIN')` 粗粒度 role gate，而非 `PermissionsGuard` 細粒度 permission code。

## Requirements

### Requirement: SUPERADMIN role gate

`/api/security/*` 全部 endpoint SHALL 由 `RolesGuard + @Roles('SUPERADMIN')` 保護，僅 roleCode 為 `'SUPERADMIN'` 的使用者能存取。

- 與專案其他模組（member / role）採 `PermissionsGuard + @Permissions('BACKEND:XXX:VIEW/EDIT')` 細粒度權限不同；security 是粗粒度 role gate。
- 沒有 `SUPERADMIN` role 的使用者 MUST 回 403，無論是否有其他 permission。
- 未登入或 JWT 失效 MUST 回 401。

#### Scenario: 無 token

- **WHEN** 未帶 Authorization header 打任何 `/api/security/*` endpoint
- **THEN** 回 401

#### Scenario: 已登入但非 SUPERADMIN

- **WHEN** 一般 admin（roleCode 非 'SUPERADMIN'）打任何 `/api/security/*` endpoint
- **THEN** 回 403

### Requirement: IP 白名單列表

`GET /api/security/ip-whitelist` SHALL 以分頁方式回傳 IP 白名單。

- Query 參數：`page?: number`（預設 1）、`limit?: number`（預設 20，上限 200）、`search?: string`（IP 模糊 contains；trim 後為空字串視為未提供）。
- Response 200，body `{ success: true, data: { list, meta }, timestamp }`：
  - `list`：`IpListItem[]`，每筆 `{ id, ipAddress, description, createdBy, createdAt }`。
  - `meta`：`{ page, limit, total, totalPages }`，與 `/api/members`、`/api/roles` 同 shape。
- 排序依 `createdAt desc`。

#### Scenario: 預設分頁

- **WHEN** SUPERADMIN 打 `GET /api/security/ip-whitelist`
- **THEN** 回 200，body `data.list` 為第一頁前 20 筆，`meta.page = 1`、`meta.limit = 20`

#### Scenario: IP 搜尋

- **WHEN** SUPERADMIN 打 `GET /api/security/ip-whitelist?search=192.168`
- **THEN** 回 200，body `data.list` 僅含 IP 含 `192.168` 字串的紀錄

### Requirement: 新增 IP 到白名單

`POST /api/security/ip-whitelist` SHALL 新增一筆 IP 到白名單。

- Request body：`{ ip: string (IPv4 / IPv6), description?: string }`。
- Response 201，body `{ success: true, data: { id }, timestamp }`，`id` 為新建紀錄的 uuid。
- 不再回 `{ message: '...' }`。
- 重複 IP 由 DB unique constraint 處理（轉成 domain exception 由現行邏輯處理）。

#### Scenario: 新增成功

- **WHEN** body `{ ip: '192.168.1.1', description: 'office' }`
- **THEN** 回 201，body `data.id` 為新建紀錄 uuid

### Requirement: 從白名單移除 IP

`DELETE /api/security/ip-whitelist/:id` SHALL 從白名單移除指定紀錄。

- Path 參數：`id: string` (uuid)，由 `ParseUUIDPipe` 驗證。
- 維持硬刪（Prisma `delete({ where: { id } })`；schema 無 deletedAt 欄位）。
- 紀錄不存在時 MUST 不報錯（靜默通過，與 member / role delete 行為一致）。
- Response 204，無 body。

#### Scenario: 刪除成功

- **WHEN** SUPERADMIN 打 `DELETE /api/security/ip-whitelist/<uuid>`，且該記錄存在
- **THEN** 回 204，DB row 直接消失（硬刪）

#### Scenario: 記錄不存在靜默通過

- **WHEN** 該 uuid 對應的 whitelist 不存在
- **THEN** 回 204（不拋 404）

### Requirement: 查詢單筆 IP 白名單

`GET /api/security/ip-whitelist/:id` SHALL 回單筆 IP 白名單記錄，給編輯 dialog 帶初值用。

- Path 參數：`id: string` (uuid)。
- Response 200，body `{ success: true, data: IpListItem, timestamp }`：`{ id, ipAddress, description, createdBy, createdAt }`。
- 找不到記錄 MUST 回 404，body `code: 'IP_LIST_NOT_FOUND'`。

#### Scenario: 找到記錄

- **WHEN** SUPERADMIN 打 `GET /api/security/ip-whitelist/<uuid>`，且該記錄存在
- **THEN** 回 200，body `data` 為 IpListItem shape

#### Scenario: 找不到記錄

- **WHEN** 該 uuid 對應的 whitelist 不存在
- **THEN** 回 404，body `code: 'IP_LIST_NOT_FOUND'`

### Requirement: 更新 IP 白名單

`PATCH /api/security/ip-whitelist/:id` SHALL 更新指定 IP 白名單的可變欄位。

- Request body：`{ description?: string }`。`ipAddress` MUST NOT 可變（要改 IP 則刪除重建）。
- Response 204，無 body。
- 找不到記錄 MUST 回 404 `IP_LIST_NOT_FOUND`。

#### Scenario: 更新成功

- **WHEN** SUPERADMIN 對某 whitelist 記錄發送 `PATCH /api/security/ip-whitelist/<uuid>` body `{ description: '新備註' }`
- **THEN** 回 204，DB 中該記錄 `description` 更新

#### Scenario: 找不到記錄

- **WHEN** 該 uuid 對應的 whitelist 不存在
- **THEN** 回 404，body `code: 'IP_LIST_NOT_FOUND'`

### Requirement: IP 黑名單列表

`GET /api/security/ip-blacklist` SHALL 以分頁方式回傳 IP 黑名單，與白名單同 shape。

- Query 參數：`page` / `limit` / `search` 同白名單。
- Response 200，`data.list` 每筆 `{ id, ipAddress, reason, isAutoBlock, createdBy, createdAt }`。

#### Scenario: 預設分頁

- **WHEN** SUPERADMIN 打 `GET /api/security/ip-blacklist`
- **THEN** 回 200，body `data.list` 為第一頁前 20 筆

### Requirement: 新增 IP 到黑名單

`POST /api/security/ip-blacklist` SHALL 新增一筆 IP 到黑名單。

- Request body：`{ ip: string, reason?: string }`。
- Response 201，body `data.id` 為新建紀錄 uuid。

#### Scenario: 新增成功

- **WHEN** body `{ ip: '1.2.3.4', reason: 'brute force' }`
- **THEN** 回 201，body `data.id` 為新建紀錄 uuid

### Requirement: 從黑名單移除 IP

`DELETE /api/security/ip-blacklist/:id` SHALL 從黑名單移除指定紀錄，與白名單對應。

- Path 參數：`id: string` (uuid)。
- Response 204。
- 維持硬刪、靜默處理「記錄不存在」。

#### Scenario: 刪除成功

- **WHEN** SUPERADMIN 打 `DELETE /api/security/ip-blacklist/<uuid>`
- **THEN** 回 204

#### Scenario: 記錄不存在靜默通過

- **WHEN** 該 uuid 對應的 blacklist 不存在
- **THEN** 回 204

### Requirement: 查詢單筆 IP 黑名單

`GET /api/security/ip-blacklist/:id` SHALL 回單筆 IP 黑名單記錄。

- Path 參數：`id: string` (uuid)。
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

### Requirement: 帳號解鎖

`POST /api/security/unlock-account` SHALL 解鎖指定 email 的帳號。

- Request body：`{ email: string }`。
- 成功 Response 204，無 body。
- 找不到該 email 的會員 MUST 回 404 `code: EMAIL_NOT_FOUND`（`EmailNotFoundException`）。
- 找到但帳號未鎖（`lockedAt == null`）MUST 回 409 `code: ACCOUNT_NOT_LOCKED`（`AccountNotLockedException`）。
- 解鎖成功 MUST 將 `lockedAt` 設 null、`failedLoginCount` 設 0。

#### Scenario: 解鎖成功

- **WHEN** SUPERADMIN 對被鎖帳號發送 `POST /api/security/unlock-account` body `{ email: 'locked@x.com' }`
- **THEN** 回 204，DB 中該 member 的 `lockedAt` 為 null、`failedLoginCount` 為 0

#### Scenario: 帳號不存在

- **WHEN** body email 對應的會員不存在
- **THEN** 回 404，body `code: 'EMAIL_NOT_FOUND'`

#### Scenario: 帳號未鎖

- **WHEN** body email 對應的會員存在但 `lockedAt == null`
- **THEN** 回 409，body `code: 'ACCOUNT_NOT_LOCKED'`
