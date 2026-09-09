## ADDED Requirements

### Requirement: 前後台的 token 完全隔離

前台與後台 SHALL 使用**各自的 JWT secret**。`JwtPayload` SHALL 帶
`side: 'admin' | 'front'` claim。

**各自的 secret 是第一道，`side` claim 是第二道。** 共用 secret 只靠 claim 分辨時，
某處忘記比對的後果是**跨側存取**；各自的 secret 讓同樣的疏忽變成簽章驗證失敗，
也就是 fail-closed。「忘記」是一定會發生的事，重點是它發生時的預設結果。

`side` claim MUST 仍然存在——驗證失敗時要能說出「這是前台的 token」，
而不是只有一句「簽章無效」。

後台側解析時 `side` 缺漏 MUST 視為 `'admin'`：加這個欄位時**已經簽出去的
admin token 裡沒有它**，當成必填會讓所有人在部署當下被登出。
前台側 MUST 嚴格要求 `'front'`（前台是全新的，不存在舊 token）。

#### Scenario: 拿後台 token 打前台端點

- **WHEN** 以 `/api/admin/auth/login` 取得的 token 呼叫需要認證的前台端點
- **THEN** 回 `401`——secret 不同，簽章驗不過

#### Scenario: 拿前台 token 打後台端點

- **WHEN** 以前台 token 呼叫 `/api/admin/*`
- **THEN** 回 `401`

#### Scenario: 舊的 admin token

- **WHEN** 一個在本次變更前簽出、payload 沒有 `side` 的 admin token 被使用
- **THEN** 仍然有效，視為 `side: 'admin'`

### Requirement: 前台已認證端點必須顯式表態

前台需要認證的 handler SHALL 標記 `@FrontAuth()`，MUST NOT 使用 `@Public()`。

全域 `JwtAuthGuard` 只解析後台的 `MemberContext`，所以前台的已認證端點
必須繞過它。**用 `@Public()` 繞過會讓一個需要認證的端點在程式碼裡自稱公開**，
而 `authorization-coverage` 與 `public-surface` 兩條規則都以
「哪些端點是公開的」為前提做判斷——冒充會讓它們在錯誤的前提上繼續全綠。

漏掛 `@FrontAuth()` 的端點會被全域 `JwtAuthGuard` 當成後台端點擋下（`401`），
**不是靜默放行**——失敗方向是安全的，但那個端點也就永遠不會成功。

架構檢查 SHALL 確認**掛了 `FrontJwtAuthGuard` 的檔案必定也用 `@FrontAuth()`**。

⚠️ 「授權裝飾器覆蓋檢查」那條規則**涵蓋不到只收 `@CurrentUser()` 的 handler**
——它只在 handler 收 `@Param` / `@Body` / `@Query` 時才觸發。
`logout` 與 `me` 正是那種形狀，所以需要上面這條獨立的檢查。
這個分工是刻意的，不是重複。

#### Scenario: 掛了前台守衛卻漏掛裝飾器

- **WHEN** 某 controller 用了 `FrontJwtAuthGuard` 但沒有 `@FrontAuth()`
- **THEN** 架構守則失敗，訊息指出那些端點會永遠回 `401`

#### Scenario: 只收 CurrentUser 的 handler

- **WHEN** 某前台 handler 只收 `@CurrentUser()`、不收外部輸入
- **THEN** 「授權裝飾器覆蓋檢查」不觸發——由上面那條規則負責

### Requirement: 前台登入

`POST /api/front/auth/login` SHALL 驗證前台使用者的帳密並簽發 token 組。

帳號停用（`status = false`）MUST 拒絕登入。
軟刪除的帳號 MUST 視為不存在。
`emailVerifiedAt` **本階段只讀不判斷**——是否擋未驗證的帳號由註冊流程決定。

登入成功 MUST 更新 `lastLoginAt`，且該更新失敗 MUST NOT 阻斷登入。

**Request**：

```json
{
  "email": "user@example.com",
  "password": "FrontPass123!"
}
```

**Success Response** `200 OK`：

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "accessTokenExpiresIn": 900,
    "refreshTokenExpiresIn": 86400,
    "user": {
      "id": "9c2a4f10-7b3e-4d81-9f6a-1e0c5b8d3a72",
      "email": "user@example.com",
      "displayName": "小明",
      "emailVerified": false
    }
  },
  "timestamp": "2026-09-06T06:00:00.000Z"
}
```

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：帳號或密碼錯誤。
  **訊息 MUST NOT 區分「帳號不存在」與「密碼錯誤」**——那會讓端點變成帳號列舉工具。
- `403`、`code: "ACCOUNT_DISABLED"`：帳號已停用
- `400`：欄位驗證失敗

#### Scenario: 帳密正確

- **WHEN** 以正確的 email 與密碼登入
- **THEN** 回 `200` 與 token 組，`lastLoginAt` 被更新

#### Scenario: 密碼錯誤

- **WHEN** 密碼不正確
- **THEN** 回 `401`，訊息與「帳號不存在」時完全相同

#### Scenario: 帳號不存在

- **WHEN** email 在 `users` 中不存在
- **THEN** 回 `401`，訊息與「密碼錯誤」時完全相同

#### Scenario: 帳號已停用

- **WHEN** 該帳號 `status` 為 `false`
- **THEN** 回 `403`、`code: "ACCOUNT_DISABLED"`

#### Scenario: 軟刪除的帳號

- **WHEN** 該帳號 `deletedAt` 不為 null
- **THEN** 回 `401`，與帳號不存在同樣的回應

### Requirement: 前台 token 更新

`POST /api/front/auth/refresh` SHALL 以 refresh token 換發新的 token 組。

MUST 驗證 `type === 'refresh'`、`side === 'front'`，且 `tokenVersion`
與資料庫一致——不一致代表該 token 已被撤銷。

**Request**：

```json
{ "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }
```

**Success Response** `200 OK`：回應結構與登入相同。

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：token 無效、過期、類型不符、側別不符或已被撤銷

#### Scenario: 有效的 refresh token

- **WHEN** 帶入未過期且 `tokenVersion` 相符的 refresh token
- **THEN** 回 `200` 與新的 token 組

#### Scenario: 用 access token 換發

- **WHEN** 帶入的 token `type` 為 `access`
- **THEN** 回 `401`

#### Scenario: 帳號已登出後重用

- **WHEN** 該帳號登出後（`tokenVersion` 已遞增）再用舊的 refresh token
- **THEN** 回 `401`

### Requirement: 前台登出

`POST /api/front/auth/logout` SHALL 使該帳號所有既發 token 立即失效。

實作 MUST 遞增 `tokenVersion`——那是「讓所有裝置的既發 token 一次失效」的唯一手段。

本端點需要認證（`@FrontAuth()`）。

**Request**：無 body。

**Success Response** `204 No Content`（無 body）。

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：未帶 token 或 token 無效

#### Scenario: 已登入的使用者登出

- **WHEN** 帶有效的前台 access token 呼叫
- **THEN** 回 `204`，且該帳號的所有既發 token 隨即失效

#### Scenario: 未帶 token

- **WHEN** 未帶 Authorization header
- **THEN** 回 `401`

### Requirement: 前台個人資料

`GET /api/front/me` SHALL 回傳目前登入的前台使用者。

本端點需要認證（`@FrontAuth()`）。
回應 MUST 包含 `emailVerified`——前台需要據此決定要不要提示使用者去驗證信箱。

**Request**：無 body。

**Success Response** `200 OK`：

```json
{
  "success": true,
  "data": {
    "id": "9c2a4f10-7b3e-4d81-9f6a-1e0c5b8d3a72",
    "email": "user@example.com",
    "displayName": "小明",
    "emailVerified": false,
    "lastLoginAt": "2026-09-06T06:00:00.000Z"
  },
  "timestamp": "2026-09-06T06:00:00.000Z"
}
```

**Failure Responses**：

- `401`、`code: "UNAUTHORIZED"`：未帶 token 或 token 無效

#### Scenario: 已登入

- **WHEN** 帶有效的前台 access token
- **THEN** 回 `200` 與該使用者的資料

#### Scenario: 帶後台 token

- **WHEN** 帶的是後台簽出的 token
- **THEN** 回 `401`
