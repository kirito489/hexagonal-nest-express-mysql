# hexagonal-nest-express

NestJS + Express 六角架構（Hexagonal Architecture）初始包，整合常用服務，開箱即用。

## 技術棧

| 分類     | 套件                                                    |
| -------- | ------------------------------------------------------- |
| 框架     | NestJS v11 + Express v5                                 |
| ORM      | Prisma v7 + MySQL / MariaDB                             |
| 快取     | Redis                                                   |
| 認證     | JWT（Access + Refresh Token）+ Redis 黑名單             |
| 驗證     | Zod                                                     |
| 權限     | RBAC（Role / Permission，DB 驅動）                      |
| 日誌     | Pino（開發 pretty / 生產 pino-roll，via nestjs-pino）   |
| 速率限制 | @nestjs/throttler + Redis 滑動視窗（env 可配置）        |
| 安全功能 | 帳號鎖定、IP 黑白名單、密碼策略、閒置登出、reCAPTCHA    |
| 功能開關 | FeatureFlagService（env 驅動，10 組開關）               |
| 文件     | Swagger UI（模組化 YAML）                               |
| 外部服務 | Firebase FCM、AWS S3、Nodemailer SMTP、Google reCAPTCHA |

## 架構

採用六角架構（Ports & Adapters），`domain` 層完全不依賴框架與 ORM：

```
src/
├── domain/              # 核心業務邏輯
│   ├── model/           # 領域實體（private constructor + static factory）
│   ├── value-object/    # 值對象
│   └── exception/       # 領域例外
├── application/
│   ├── facade/          # Facade（聚合多個 Use Case，作為 Controller 的進入點）
│   ├── port/in/         # Inbound Port（Use Case 介面）
│   ├── port/out/        # Outbound Port（Repository / 外部服務介面）
│   └── service/         # Application Service（實作 Use Case）
├── adapter/
│   ├── in/web/          # Controller、Guard、Decorator、DTO、Helper
│   └── out/             # Prisma、Redis、S3、Email、Firebase 實作
├── infrastructure/      # Prisma、Redis、ZodValidationPipe、Logger
└── modules/             # NestJS DI 接線（Port Token → 實作）
```

依賴方向：`Controller` → `Facade` → `Service` → `Port` ← `Adapter`

`domain` 層完全不知道框架、ORM、Facade 的存在。

## 快速開始

```bash
# 1. 安裝依賴
npm install

# 2. 設定環境變數
cp .env.example .env   # 編輯 .env，填入必填項目（見下方環境變數表）

# 3. 建立資料庫 + 執行 migration
npm run db:create
npm run db:migrate

# 4. 執行 seed（初始 permissions 與 roles）
npm run db:seed

# 5. 啟動開發伺服器
npm run dev
```

- API Base：`http://localhost:3000/api`
- Swagger UI：`http://localhost:3000/api/docs`

## 指令參考

### 開發

```bash
npm run dev            # 啟動（watch 模式）
npm run start:debug    # 啟動（debug + watch 模式）
npm run build          # 編譯
npm run start:prod     # 生產環境啟動（需先 npm run build）
```

### 程式碼品質

```bash
npm run lint           # ESLint 檢查
npm run lint:fix       # ESLint 自動修正
npm run format         # Prettier 格式化
```

### 測試

```bash
npm run test           # 單元測試
npm run test:watch     # 單元測試（watch 模式）
npm run test:cov       # 單元測試 + 覆蓋率報告
npm run test:e2e       # E2E 測試（HTTP 層，mock DB/Redis）
```

### 資料庫

```bash
npm run db:create      # 建立資料庫
npm run db:drop        # 刪除資料庫
npm run db:migrate         # 開發環境執行 migration（同時 generate Prisma Client）
npm run db:migrate:deploy  # 生產環境部署 migration（不會 reset DB、不互動）
npm run db:generate        # 僅重新產生 Prisma Client（不需 DB 連線）
npm run db:seed        # 執行所有 seed 檔案
npm run db:studio      # 開啟 Prisma Studio
```

### Swagger

```bash
npm run swagger:bundle # 將模組化 YAML 合併為 openapi.bundle.yaml
```

## 環境變數

必填項目無預設值，啟動時若缺少會立即 exit(1) 並列出錯誤欄位。

| 變數                                           | 必填 | 預設值         | 說明                                                 |
| ---------------------------------------------- | :--: | -------------- | ---------------------------------------------------- |
| `NODE_ENV`                                     |      | development    | 執行環境（`development` / `production` / `test`）    |
| `PORT`                                         |      | 3000           | HTTP 監聽埠                                          |
| `LOG_LEVEL`                                    |      | info           | Pino 日誌等級（trace / debug / info / warn / error） |
| `DB_HOST`                                      |  ✓   |                | 資料庫主機                                           |
| `DB_PORT`                                      |      | 3306           | 資料庫埠                                             |
| `DB_USERNAME`                                  |  ✓   |                | 資料庫使用者                                         |
| `DB_PASSWORD`                                  |      |                | 資料庫密碼                                           |
| `DB_DATABASE`                                  |  ✓   |                | 資料庫名稱                                           |
| `ACCESS_SECRET`                                |  ✓   |                | JWT Access Token 簽名金鑰（至少 32 字元）            |
| `ACCESS_TOKEN_EXPIRES_IN`                      |      | 7200           | Access Token 效期（秒，預設 2 小時）                 |
| `REFRESH_SECRET`                               |  ✓   |                | JWT Refresh Token 簽名金鑰（至少 32 字元）           |
| `REFRESH_TOKEN_EXPIRES_IN`                     |      | 604800         | Refresh Token 效期（秒，預設 7 天）                  |
| `COOKIE_SECRET`                                |  ✓   |                | Cookie 簽名金鑰（至少 32 字元）                      |
| `BCRYPT_ROUNDS`                                |      | 10             | bcrypt 雜湊輪數（生產環境建議 ≥ 12）                 |
| `REDIS_HOST`                                   |      | localhost      | Redis 主機                                           |
| `REDIS_PORT`                                   |      | 6379           | Redis 埠                                             |
| `REDIS_PASSWORD`                               |      |                | Redis 密碼                                           |
| `REDIS_DB`                                     |      | 0              | Redis DB index                                       |
| `REDIS_KEY_PREFIX`                             |      | `nest:`        | Key 前綴                                             |
| `REDIS_URL`                                    |      |                | Redis 連線 URL（設定後優先於 HOST/PORT）             |
| `PERMISSION_CACHE_TTL`                         |      | 300            | 權限快取效期（秒），角色變更最多延遲此時間生效       |
| `CORS_ORIGIN`                                  |      | `*`            | 允許的 CORS 來源                                     |
| `DEFAULT_PAGE_LIMIT`                           |      | 10             | 分頁預設每頁筆數                                     |
| `FCM_PROJECT_ID`                               |      |                | Firebase 專案 ID                                     |
| `FCM_CLIENT_EMAIL`                             |      |                | Firebase Client Email                                |
| `FCM_PRIVATE_KEY`                              |      |                | Firebase Private Key                                 |
| `AWS_REGION`                                   |      |                | AWS 區域                                             |
| `AWS_ACCESS_KEY_ID`                            |      |                | AWS Access Key                                       |
| `AWS_SECRET_ACCESS_KEY`                        |      |                | AWS Secret Key                                       |
| `AWS_S3_BUCKET`                                |      |                | S3 Bucket 名稱                                       |
| `AWS_S3_PUBLIC_URL`                            |      |                | S3 公開存取 Base URL                                 |
| `SMTP_HOST`                                    |      |                | SMTP 主機                                            |
| `SMTP_PORT`                                    |      | 587            | SMTP 埠                                              |
| `SMTP_SECURE`                                  |      | false          | 是否使用 TLS                                         |
| `SMTP_USER`                                    |      |                | SMTP 帳號                                            |
| `SMTP_PASS`                                    |      |                | SMTP 密碼                                            |
| `EMAIL_FROM`                                   |      |                | 寄件人名稱與地址（未設定時用 SMTP_USER）             |
| **速率限制**                                   |      |                |                                                      |
| `COMMON_RATE_LIMIT_WINDOW_MS`                  |      | 60000          | 速率限制時間窗口（毫秒）                             |
| `COMMON_RATE_LIMIT_MAX_REQUESTS`               |      | 100            | 時間窗口內最大請求數                                 |
| **功能開關**                                   |      |                |                                                      |
| `APPLICATION_ADMIN_ROLE_ENABLED`               |      | true           | 角色權限檢查                                         |
| `APPLICATION_AUTH_LOG_ENABLED`                 |      | false          | 登入日誌                                             |
| `APPLICATION_IP_WHITELIST_ENABLED`             |      | false          | IP 白名單                                            |
| `APPLICATION_IP_BLACKLIST_ENABLED`             |      | false          | IP 黑名單                                            |
| `APPLICATION_ACCOUNT_LOCK_ENABLED`             |      | false          | 帳號鎖定                                             |
| `APPLICATION_PASSWORD_CHANGE_ENABLED`          |      | false          | 密碼定期更換                                         |
| `APPLICATION_SESSION_IDLE_ENABLED`             |      | false          | 閒置自動登出                                         |
| `APPLICATION_GOOGLE_RECAPTCHA_ENABLED`         |      | false          | Google reCAPTCHA                                     |
| `APPLICATION_API_LOG_ENABLED`                  |      | false          | API 日誌（System Log）                               |
| `APPLICATION_OPERATION_LOG_ENABLED`            |      | false          | 操作日誌                                             |
| **密碼策略**                                   |      |                |                                                      |
| `APPLICATION_PASSWORD_MIN_LENGTH`              |      | 8              | 密碼最短長度                                         |
| `APPLICATION_PASSWORD_MAX_LENGTH`              |      | 32             | 密碼最長長度                                         |
| `APPLICATION_SYSTEM_ADMIN_PASSWORD_COMPLEXITY` |      | 3              | ADMIN 密碼複雜度（0–3）                              |
| `APPLICATION_OTHER_ADMIN_PASSWORD_COMPLEXITY`  |      | 1              | 其他角色密碼複雜度（0–3）                            |
| `APPLICATION_PASSWORD_CHANGE_PERIOD`           |      | 6              | 密碼更換週期（月，0=不強制）                         |
| `APPLICATION_IS_LOGOUT_AFTER_PASSWORD_RESET`   |      | false          | 重設密碼後強制登出                                   |
| **帳號鎖定**                                   |      |                |                                                      |
| `APPLICATION_ACCOUNT_LOCK_THRESHOLD`           |      | 3              | 連續失敗幾次鎖定帳號                                 |
| `APPLICATION_IP_BLOCK_THRESHOLD`               |      | 5              | 連續失敗幾次封鎖 IP                                  |
| **Google reCAPTCHA**                           |      |                |                                                      |
| `GOOGLE_RECAPTCHA_SECRET`                      |      |                | reCAPTCHA Secret Key                                 |
| `GOOGLE_RECAPTCHA_SITE_KEY`                    |      |                | reCAPTCHA Site Key                                   |
| `GOOGLE_RECAPTCHA_VERSION`                     |      | v2             | 版本（`v2` / `v3`）                                  |
| `GOOGLE_RECAPTCHA_IS_PRODUCTION`               |      | false          | 非正式環境直接通過驗證                               |
| **閒置登出**                                   |      |                |                                                      |
| `APPLICATION_SESSION_IDLE_TIMEOUT`             |      | 120            | 閒置超時（分鐘）                                     |
| **密碼重設**                                   |      |                |                                                      |
| `APP_PASSWORD_RESET_TOKEN_EXPIRES_IN`          |      | 30             | 重設 Token 有效期（分鐘）                            |
| `APP_PASSWORD_RESET_URL`                       |      |                | 密碼重設頁面 URL                                     |
| **Seed 預設帳號**                              |      |                |                                                      |
| `ADMIN_DEFAULT_EMAIL`                          |      | admin@test.com | 預設管理員 Email                                     |
| `ADMIN_DEFAULT_PASSWORD`                       |      | Admin1234!     | 預設管理員密碼                                       |

> Redis、Firebase、S3、SMTP 若未設定，服務啟動時會印出警告但不會崩潰。
> **注意**：Redis 失效時速率限制（Throttle）會暫時停用，可觀察日誌中的警告。

### DATABASE_URL

Prisma schema 使用 `DATABASE_URL`，但**不需要手動設定**。`db:migrate`、`db:generate`、`db:studio` 指令透過 `scripts/prisma-env.ts` 自動從 `DB_*` 環境變數組裝連線字串，再轉交給 Prisma CLI 執行。應用程式本身亦由 `PrismaService` 在啟動時以 `DB_*` 組裝，`DATABASE_URL` 只作為 Prisma CLI 工具用途。

### 生產環境強制驗證

`NODE_ENV=production` 時，啟動額外檢查以下項目，任一不符合即 exit(1)：

- `CORS_ORIGIN` 不可設為 `*`
- `DB_PASSWORD` 不可為空
- `ACCESS_SECRET` 不可包含預設佔位符（`change-in-production`）且長度 ≥ 32
- `COOKIE_SECRET` 不可包含預設佔位符或 `test-` 前綴
- `BCRYPT_ROUNDS` 必須 ≥ 12

產生隨機 secret：

```bash
openssl rand -hex 32
```

## API 端點

所有端點以 `/api` 為前綴。

### Auth

| 方法 | 路徑                        | 狀態碼 | 說明                                                                                            |
| ---- | --------------------------- | :----: | ----------------------------------------------------------------------------------------------- |
| POST | `/api/auth/login`           |  200   | 登入，回傳 `{ accessToken, refreshToken, accessTokenExpiresIn, refreshTokenExpiresIn, member }` |
| POST | `/api/auth/refresh`         |  200   | 以 Refresh Token 換發新 Access Token                                                            |
| POST | `/api/auth/logout`          |  204   | 登出，雙 Token 加入黑名單（需 JWT）                                                             |
| POST | `/api/auth/forgot-password` |  200   | 忘記密碼，寄送重設信件（即使 email 不存在也回傳成功，防帳號列舉）                               |
| POST | `/api/auth/reset-password`  |  200   | 透過 token 重設密碼                                                                             |

### Members（需 JWT + `BACKEND:ACCOUNT:VIEW` / `EDIT` 權限）

| 方法   | 路徑                        | 狀態碼 | 說明                                         |
| ------ | --------------------------- | :----: | -------------------------------------------- |
| GET    | `/api/members`              |  200   | 查詢帳號列表（支援 email / name 篩選與分頁） |
| POST   | `/api/members`              |  201   | 新增帳號                                     |
| GET    | `/api/members/role/options` |  200   | 取得角色選項清單                             |
| GET    | `/api/members/:id`          |  200   | 查詢單一帳號                                 |
| PATCH  | `/api/members/:id`          |  204   | 更新帳號                                     |
| DELETE | `/api/members/:id`          |  204   | 刪除帳號                                     |

### Me（需 JWT）

| 方法 | 路徑      | 狀態碼 | 說明                   |
| ---- | --------- | :----: | ---------------------- |
| GET  | `/api/me` |  200   | 取得目前登入的帳號資訊 |

### Roles（需 JWT + `BACKEND:ROLE:VIEW` / `EDIT` 權限）

| 方法   | 路徑                     | 狀態碼 | 說明                               |
| ------ | ------------------------ | :----: | ---------------------------------- |
| GET    | `/api/roles`             |  200   | 查詢角色列表（含分頁）             |
| POST   | `/api/roles`             |  201   | 新增角色                           |
| GET    | `/api/roles/permissions` |  200   | 查詢所有可用 Permission 清單       |
| GET    | `/api/roles/:id`         |  200   | 查詢單一角色（含 permissionCodes） |
| PATCH  | `/api/roles/:id`         |  204   | 更新角色名稱與權限                 |
| DELETE | `/api/roles/:id`         |  204   | 軟刪除角色                         |

### Security（需 JWT + ADMIN 角色）

| 方法   | 路徑                             | 狀態碼 | 說明                                             |
| ------ | -------------------------------- | :----: | ------------------------------------------------ |
| GET    | `/api/security/ip-whitelist`     |  200   | 查詢所有 IP 白名單                               |
| POST   | `/api/security/ip-whitelist`     |  201   | 新增 IP 到白名單（body: `{ ip, description? }`） |
| DELETE | `/api/security/ip-whitelist/:ip` |  204   | 從白名單移除 IP                                  |
| GET    | `/api/security/ip-blacklist`     |  200   | 查詢所有 IP 黑名單                               |
| POST   | `/api/security/ip-blacklist`     |  201   | 新增 IP 到黑名單（body: `{ ip, reason? }`）      |
| DELETE | `/api/security/ip-blacklist/:ip` |  204   | 從黑名單移除 IP                                  |
| POST   | `/api/security/unlock-account`   |  200   | 解鎖帳號（body: `{ email }`）                    |

### Health

| 方法 | 路徑          | 狀態碼 | 說明                       |
| ---- | ------------- | :----: | -------------------------- |
| GET  | `/api/health` |  200   | 健康檢查（不計入速率限制） |

## RBAC 權限系統

資料表：

- `roles` — 角色；`isDefault = true` 的角色為新帳號的預設角色
- `permissions` — 權限代碼（見下表）
- `role_permissions` — 多對多關聯

| PermissionCode 常數    | 代碼字串               |
| ---------------------- | ---------------------- |
| `BACKEND_ACCOUNT_VIEW` | `BACKEND:ACCOUNT:VIEW` |
| `BACKEND_ACCOUNT_EDIT` | `BACKEND:ACCOUNT:EDIT` |
| `BACKEND_ROLE_VIEW`    | `BACKEND:ROLE:VIEW`    |
| `BACKEND_ROLE_EDIT`    | `BACKEND:ROLE:EDIT`    |

Seed 預設建立一個角色（`roleCode: SUPERADMIN`，`isDefault: true`）並指派所有權限。

JWT Payload 只存 `sub`（memberId）與 `type`（`access` / `refresh`）。每次請求由 `JwtAuthGuard` 以 `sub` 從 Redis 快取或 DB 載入使用者完整資訊（含 email、roleName、permissions），附加至 `request.member`。

快取 TTL 取 `min(JWT 剩餘效期, PERMISSION_CACHE_TTL)`，確保 Token 過期後快取同步失效。

**Redis 降級策略**：Redis 不可用時，`JwtAuthGuard` 自動降級為每次請求直接查 DB，並在日誌中印出警告。服務不中斷，但效能下降。

### Guard 用法

```typescript
// 只需登入
@UseGuards(JwtAuthGuard)

// 需要特定 Role
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.ADMIN)

// 需要特定 Permission
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions(PermissionCode.BACKEND_ACCOUNT_EDIT)
```

### 取得當前使用者

```typescript
@Get('me')
@UseGuards(JwtAuthGuard)
getMe(@CurrentMember() member: MemberContext) {
  // member.sub / member.email / member.roleName / member.permissions
}
```

`MemberContext` 定義於 `src/adapter/in/web/decorator/current-member.decorator.ts`，欄位為 `sub`（memberId）、`email`、`roleName`、`permissions`、`status`、`lastPasswordChange`。

## 全域中介層

以下 Provider 在 `app.module.ts` 全域註冊，**所有端點自動套用，無需手動加裝飾器**：

| Provider          | 類別                    | 作用                                                                                                   |
| ----------------- | ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `APP_GUARD`       | `ThrottlerGuard`        | 速率限制（Redis 滑動視窗）；全域預設由 env 配置，各端點可用 `@Throttle()` 覆蓋；Redis 不可用時自動停用 |
| `APP_GUARD`       | `IpBlacklistGuard`      | IP 黑名單檢查（FeatureFlag 控制，關閉時跳過）                                                          |
| `APP_GUARD`       | `IpWhitelistGuard`      | IP 白名單檢查（FeatureFlag 控制，關閉時跳過）                                                          |
| `APP_GUARD`       | `SessionIdleGuard`      | 閒置登出檢查（FeatureFlag 控制，關閉時跳過）                                                           |
| `APP_FILTER`      | `GlobalExceptionFilter` | 統一例外格式，並寫入 System Log                                                                        |
| `APP_INTERCEPTOR` | `LoggingInterceptor`    | 成功請求寫入 System Log（FeatureFlag 控制，fire-and-forget）                                           |
| `APP_INTERCEPTOR` | `TransformInterceptor`  | 成功回應包裝為 `{ success, data, timestamp }`                                                          |

新增端點時只需關注業務邏輯，不需重複套用這些中介層。

## API 回應格式

所有回應由 `TransformInterceptor`（成功）與 `GlobalExceptionFilter`（錯誤）統一包裝。

**成功回應：**

```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2026-04-05T06:00:00.000Z"
}
```

**錯誤回應：**

```json
{
  "success": false,
  "message": "帳號或密碼錯誤",
  "code": "UNAUTHORIZED",
  "timestamp": "2026-04-05T06:00:00.000Z"
}
```

`code` 欄位由例外的 class name 自動轉換為 SCREAMING_SNAKE_CASE（例如 `EmailAlreadyExistsException` → `EMAIL_ALREADY_EXISTS`）。

## 功能開關（Feature Flags）

所有安全功能皆受 `FeatureFlagService` 控制，透過環境變數開關，**預設全部關閉**（除 `APPLICATION_ADMIN_ROLE_ENABLED`）。

```typescript
// 在任何 Service / Guard 中注入
constructor(private readonly featureFlags: FeatureFlagService) {}

if (this.featureFlags.isEnabled('accountLockEnabled')) {
  // ...
}
```

| Flag 名稱                | 環境變數                               | 控制範圍                                         |
| ------------------------ | -------------------------------------- | ------------------------------------------------ |
| `adminRoleEnabled`       | `APPLICATION_ADMIN_ROLE_ENABLED`       | `RolesGuard` 角色檢查                            |
| `authLogEnabled`         | `APPLICATION_AUTH_LOG_ENABLED`         | 登入/登出/密碼重設日誌寫入 `auth_logs`           |
| `ipWhitelistEnabled`     | `APPLICATION_IP_WHITELIST_ENABLED`     | `IpWhitelistGuard` 全域白名單                    |
| `ipBlacklistEnabled`     | `APPLICATION_IP_BLACKLIST_ENABLED`     | `IpBlacklistGuard` 全域黑名單 + 登入失敗自動封鎖 |
| `accountLockEnabled`     | `APPLICATION_ACCOUNT_LOCK_ENABLED`     | 登入失敗計數 + 帳號鎖定                          |
| `passwordChangeEnabled`  | `APPLICATION_PASSWORD_CHANGE_ENABLED`  | `JwtAuthGuard` 密碼過期檢查                      |
| `sessionIdleEnabled`     | `APPLICATION_SESSION_IDLE_ENABLED`     | `SessionIdleGuard` 閒置登出                      |
| `googleRecaptchaEnabled` | `APPLICATION_GOOGLE_RECAPTCHA_ENABLED` | 登入時 reCAPTCHA 驗證                            |
| `apiLogEnabled`          | `APPLICATION_API_LOG_ENABLED`          | `LoggingInterceptor` System Log 寫入             |
| `operationLogEnabled`    | `APPLICATION_OPERATION_LOG_ENABLED`    | 操作日誌                                         |

## 安全功能

### 帳號鎖定

連續登入失敗達 `APPLICATION_ACCOUNT_LOCK_THRESHOLD` 次後，帳號自動鎖定（DB `lockedAt` 欄位）。失敗計數使用 Redis INCR（30 分鐘 TTL），Redis 不可用時 graceful degradation（不計數，但 DB 鎖定仍有效）。登入成功自動重置計數。

### IP 黑白名單

- **黑名單**：`IpBlacklistGuard` 全域攔截，被封鎖的 IP 回傳 `403 Forbidden`
- **白名單**：`IpWhitelistGuard` 全域攔截，不在名單中的 IP 回傳 `403 Forbidden`
- **自動封鎖**：IP 連續登入失敗達 `APPLICATION_IP_BLOCK_THRESHOLD` 次，自動加入黑名單

資料表：`ip_whitelist`、`ip_blacklist`（含 `isAutoBlock` 標記）。

### 密碼策略

`PasswordPolicyService` 根據角色套用不同複雜度等級：

| 複雜度 | 規則                                              |
| :----: | ------------------------------------------------- |
|   0    | 僅檢查長度                                        |
|   1    | + 大寫 + 小寫 + 數字                              |
|   2    | + 特殊符號                                        |
|   3    | + 禁止常見弱密碼字串（password、123456 等 18 組） |

ADMIN 角色預設複雜度 3，其他角色預設複雜度 1。密碼策略在建立帳號和重設密碼時自動套用。

### 密碼定期更換

當 `passwordChangeEnabled` 開啟且 `APPLICATION_PASSWORD_CHANGE_PERIOD > 0` 時，`JwtAuthGuard` 會檢查使用者最後更換密碼的時間。超過期限或從未更換過，回傳 `403 { code: 'PASSWORD_CHANGE_REQUIRED' }`。

### 閒置自動登出

`SessionIdleGuard` 使用 Redis TTL 機制追蹤 session 活躍狀態。每次認證請求刷新 TTL，超過 `APPLICATION_SESSION_IDLE_TIMEOUT` 分鐘未活動，key 自動消失，回傳 `401 Unauthorized`。Redis 不可用時 graceful degradation（視為活躍）。

### Google reCAPTCHA

`GoogleRecaptchaAdapter` 支援 v2 / v3。非正式環境（`GOOGLE_RECAPTCHA_IS_PRODUCTION=false`）時永遠通過。v3 需通過分數門檻（預設 0.5）。啟用時登入必須附帶 `recaptchaToken` 欄位。

### 登入日誌（Auth Log）

記錄 `LOGIN_SUCCESS`、`LOGIN_FAILURE`、`LOGOUT`、`PASSWORD_RESET` 四種事件到 `auth_logs` 表，含 `memberId`、`email`、`ipAddress`、`userAgent`、`detail`。日誌寫入失敗不影響主流程（fire-and-forget）。

### 密碼重設

1. `POST /api/auth/forgot-password` — 產生 token 並寄送重設信件（即使 email 不存在也回傳成功）
2. `POST /api/auth/reset-password` — 驗證 token → 密碼策略檢查 → 更新密碼 → 條件式強制登出

Token 存於 `password_reset_tokens` 表，有效期由 `APP_PASSWORD_RESET_TOKEN_EXPIRES_IN` 控制。

## 日誌系統

使用 `nestjs-pino` + `pino-http`：

- **開發環境**：`pino-pretty` 彩色輸出至 stdout
- **生產環境**：`pino-roll` 寫入檔案，每個檔案上限 5MB，自動輪轉
  - `logs/combined.log` — 所有等級
  - `logs/error.log` — 僅 error 等級
- **測試環境**：關閉 pino-roll，避免測試期間產生日誌檔案

每筆請求日誌自動包含 `requestId`（`randomUUID()` 產生），可用於跨日誌追蹤同一請求。

敏感欄位自動脫敏，以下 key 的值會被替換為 `[REDACTED]`：`password`、`passwordHash`、`token`、`secret`、`authorization`、`cookie`、`api_key`、`apiKey`。

## 資料脫敏

`src/infrastructure/sanitize.ts` 提供多層脫敏，自動套用於 System Log 的 request / response 記錄：

| 場景                                           | 行為                    |
| ---------------------------------------------- | ----------------------- |
| 物件欄位名稱含敏感關鍵字                       | 值替換為 `[REDACTED]`   |
| Base64 圖片資料（`data:image/...`）            | 替換為 `[BASE64_IMAGE]` |
| URL Query String 中的 `email`、`phone`、`name` | 替換為 `[REDACTED]`     |

## Zod 驗證

DTO 使用 `ZodValidationPipe` 搭配 Zod schema，於 route 層級套用：

```typescript
// dto/CreateXxxRequest.ts
export const createXxxSchema = z.object({
  name: z.string().min(1),
});
export type CreateXxxRequest = z.infer<typeof createXxxSchema>;

// XxxController.ts
@Post()
create(@Body(new ZodValidationPipe(createXxxSchema)) dto: CreateXxxRequest) {}
```

驗證失敗時，`ZodValidationPipe` 拋出 `BadRequestException`，由 `GlobalExceptionFilter` 包裝後回傳：

```json
{
  "success": false,
  "message": "資料驗證失敗",
  "code": "BAD_REQUEST",
  "timestamp": "2026-04-05T06:00:00.000Z"
}
```

## 日期工具

`src/infrastructure/date.ts` 提供預設時區與中文語系的 dayjs 實例（時區由 `APP_TIMEZONE` 環境變數控制）：

```typescript
import dayjs, {
  formatDate,
  formatYMD,
  formatDateWithDay,
} from '../infrastructure/date';

formatDate(new Date()); // "2026-04-05"
formatYMD(2026, 4, 5); // "2026年04月05日"
formatDateWithDay(new Date()); // "2026-04-05 (日)"
dayjs().format('HH:mm'); // 當前時間（依時區）
```

## Seed 管理

Seed 檔案放在 `seeds/`，以 timestamp 前綴確保執行順序，並透過 `SeedHistoryRecord` 做冪等控制（已執行過的 seed 自動跳過）：

```
seeds/
├── 20260101000001-seed-permissions.ts   # 初始化 Permission 代碼
├── 20260101000002-seed-roles.ts         # 初始化角色（SUPERADMIN）
├── 20260101000003-seed-test-members.ts  # 建立預設管理員帳號
└── YYYYMMDDHHMMSS-seed-xxx.ts
```

新增 seed：

```typescript
// seeds/YYYYMMDDHHMMSS-seed-xxx.ts
import { PrismaClient } from '@prisma/client';

export default async function seed(prisma: PrismaClient): Promise<void> {
  await prisma.xxx.upsert({ ... });
}
```

執行：`npm run db:seed`

## 測試

### 單元測試

```
src/
├── domain/
│   ├── model/Member.spec.ts
│   ├── value-object/Email.spec.ts
│   └── value-object/PasswordPolicy.spec.ts
├── application/service/
│   ├── FeatureFlagService.spec.ts
│   └── PasswordPolicyService.spec.ts
├── infrastructure/
│   └── date.spec.ts
└── adapter/in/web/
    ├── guard/JwtAuthGuard.spec.ts
    ├── guard/RolesGuard.spec.ts
    ├── guard/PermissionsGuard.spec.ts
    ├── filter/GlobalExceptionFilter.spec.ts
    └── interceptor/TransformInterceptor.spec.ts
```

### E2E 測試

HTTP 層測試，mock DB 和 Redis，使用 `test/test-app.ts` 提供的 helper：

```
test/
├── test-app.ts            # createE2EApp()、createMockRedis() 工廠
├── setup-env.ts           # 測試用環境變數
├── auth.e2e-spec.ts       # /api/auth/*
├── member.e2e-spec.ts     # /api/members/*
├── role.e2e-spec.ts       # /api/roles/*
└── security.e2e-spec.ts   # /api/security/*、/api/auth/forgot-password、reset-password
```

新增 E2E spec：

```typescript
import { createE2EApp, createMockRedis } from './test-app';

const mockRedis = createMockRedis();
const mockPrisma = {
  $connect: jest.fn(),
  $disconnect: jest.fn(),
  memberRecord: { findUnique: jest.fn(), findFirst: jest.fn() },
  role: { findFirstOrThrow: jest.fn() },
};

const { app } = await createE2EApp({ prisma: mockPrisma, redis: mockRedis });
```

## System Log

每次 HTTP 請求完成後，`system-log.module.ts` 會透過 `SaveSystemLogPort` 將請求記錄寫入 DB（`PrismaSystemLogRepository`）。記錄欄位包含：

| 欄位                           | 說明                            |
| ------------------------------ | ------------------------------- |
| `userId`                       | 登入使用者 ID（未登入為空）     |
| `action`                       | 動作描述                        |
| `method`                       | HTTP 方法                       |
| `url`                          | 請求路徑（query string 已脫敏） |
| `statusCode`                   | HTTP 狀態碼                     |
| `execTime`                     | 執行時間（ms）                  |
| `requestTime` / `responseTime` | 請求與回應時間                  |

成功路徑由 `LoggingInterceptor` 處理，錯誤路徑由 `GlobalExceptionFilter` 處理，共用 `system-log-helper.ts` 的 `buildSystemLogData()` 組裝資料。

## 分頁

`src/infrastructure/pagination.ts` 提供兩個工具函式，供 Service 或 Repository 使用：

```typescript
import {
  getPagination,
  buildPaginationMeta,
} from '../infrastructure/pagination';

const { page, limit, offset } = getPagination(query);
const meta = buildPaginationMeta(page, limit, totalCount);
// { page, limit, total, totalPages }
```

- `page` 最小為 1；`limit` 預設來自 `DEFAULT_PAGE_LIMIT` 環境變數，上限為 100。

## 新增 Domain Module

以新增 `Order` 模組為例：

```
1.  prisma/schema.prisma                                       # 加 OrderRecord model → db:migrate
2.  src/domain/model/Order.ts                                  # 領域實體
3.  src/domain/exception/OrderNotFoundException.ts             # 領域例外
4.  src/application/port/in/order/CreateOrderUseCase.ts        # Inbound Port
5.  src/application/port/out/order/SaveOrderPort.ts            # Outbound Port
6.  src/application/service/order/CreateOrderService.ts        # Use Case 實作
7.  src/application/facade/OrderFacade.ts                      # Facade
8.  src/adapter/out/persistence/order/PrismaOrderRepository.ts
9.  src/adapter/in/web/order/CreateOrderRequest.ts             # Zod schema + DTO
10. src/adapter/in/web/order/OrderController.ts
11. src/modules/order.module.ts                                # DI 接線（含 JwtModule import）
12. src/app.module.ts                                          # 引入 OrderModule
13. GlobalExceptionFilter.ts                                   # 新增例外對應
14. docs/swagger/orders/create-order.yaml                      # Swagger 文件
15. test/order.e2e-spec.ts                                     # E2E 測試
```

> 若 Controller 使用 `JwtAuthGuard`，記得在對應 Module 的 `imports` 加入 `JwtModule`。
>
> 以下模組標記為 `@Global()`，全域可注入，新模組**不需要** import：
>
> - `RedisModule` — `TOKEN_BLACKLIST_PORT`、`CLEAR_MEMBER_CONTEXT_PORT`、`MEMBER_CONTEXT_CACHE_PORT`、`SESSION_ACTIVITY_PORT`
> - `FeatureFlagModule` — `FeatureFlagService`
> - `AuthLogModule` — `SAVE_AUTH_LOG_PORT`
> - `SecurityModule` — `ACCOUNT_LOCK_PORT`、`IP_BLOCK_PORT`、`IP_LIST_PORT`
> - `RecaptchaModule` — `RECAPTCHA_VERIFY_PORT`

## Swagger 文件管理

```
docs/swagger/
├── openapi.yaml           # 主檔（paths 以 $ref 引用各端點）
├── openapi.bundle.yaml    # 合併後產物
├── auth/
├── members/
├── profile/
├── roles/
└── security/
```

新增端點：

1. 建立 `docs/swagger/<module>/endpoint.yaml`
2. 在 `openapi.yaml` 的 `paths` 加 `$ref`
3. 執行 `npm run swagger:bundle`
