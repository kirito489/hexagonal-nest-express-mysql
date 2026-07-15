# Project: hexagonal-nest-monorepo (Starter)

NestJS + React + shadcn 全端 monorepo 初始包。後端採六角架構（Hexagonal Architecture），前端為 admin SPA，API 契約透過 OpenAPI 共享。本檔為架構與慣例的**單一事實來源**，README 與 CLAUDE.md 只連結過來，不重複寫架構細節。

---

## 目的

- **後端 admin REST API**：認證（登入 / 登出 / refresh / 忘記密碼 / 重設密碼）、會員管理、角色與權限管理、安全管理（IP 白名單 / 黑名單 / 帳號解鎖）、健康檢查。
- **前端 admin SPA**：對應後端 endpoint 的 UI；登入、權限保護、會員 / 角色 / 安全等管理頁面。
- **共用 API client**：從後端 OpenAPI bundle 自動產生型別 + TanStack Query hooks，後端 controller 改動時前端編譯期捕捉。

---

## Monorepo 結構

```
hexagonal-nest-express-mysql/
├── apps/
│   ├── api/                  # NestJS 後端
│   └── web/                  # React 19 + Vite admin SPA
├── packages/
│   └── api-client/           # 由 openapi.bundle.yaml 產生的型別安全 client
├── openspec/                 # 規格驅動開發產物（本檔 + changes/ + specs/）
├── tasks/                    # lessons.md + todo.md
├── pr/                       # code review 報告
├── pnpm-workspace.yaml       # workspace + allowBuilds 宣告
├── pnpm-lock.yaml
├── tsconfig.base.json        # 三個 workspace 共用 TS 設定（strict / target / ...）
└── package.json              # root scripts + 共用 devDeps（concurrently、openspec CLI）
```

- 套件管理：**pnpm 11+**，corepack 透過 `packageManager` 欄位鎖版本。
- workspace 之間互引用使用 `workspace:*` 協定。
- 各 workspace 命名統一 `@app/*` scope（fork 後可整批替換）。
- `apps/web` 透過 Vite proxy（`/api` → `http://localhost:3000`）與後端通訊；`@app/api-client` 採 **source-first**（exports 直接指 `src/index.ts`，由 Vite / tsc 直接吃 TS，**無 dist build 階段**）。

---

## 技術棧

### 後端 `apps/api`

| 分類            | 套件                                                                            |
| --------------- | ------------------------------------------------------------------------------- |
| Runtime         | Node.js 20+                                                                     |
| Framework       | NestJS 11 + Express 5                                                           |
| Language        | TypeScript 5（strict）                                                          |
| ORM             | Prisma 7 + `@prisma/adapter-mariadb`                                            |
| Database        | MySQL / MariaDB（driver 層強制 UTC）                                            |
| Validation      | Zod 4（DTO）+ `ParseUUIDPipe`（route param）                                    |
| Auth            | JWT（`@nestjs/jwt`）+ Redis token blacklist + Redis member-context cache        |
| Logging         | Pino + `pino-roll`（檔案輪替）+ DB via `SaveSystemLogPort`                      |
| Rate limit      | `@nestjs/throttler`                                                             |
| Security header | `helmet`（CSP 關閉以相容 Swagger UI，其餘標頭預設啟用）                         |
| Health check    | `@nestjs/terminus`（liveness + readiness，探 DB / Redis）                       |
| Observability   | Sentry（`@sentry/nestjs`）+ Prometheus（`@willsoto/nestjs-prometheus`），皆 flag 預設關閉 |
| 排程            | `@nestjs/schedule` + `cron`（`onModuleInit` 動態註冊，env gate 預設關）         |
| 靜態 / 單一埠   | `@nestjs/serve-static`（`forRootAsync` 服務 `apps/web/dist`，exclude `/api`）   |
| Mail            | Nodemailer                                                                      |
| Files           | AWS S3（`@aws-sdk/client-s3`、presigned URL）                                   |
| Push            | Firebase Admin SDK                                                              |
| API Docs        | Swagger 3：分檔 yaml + `swagger-cli bundle`                                     |
| Testing         | Jest 29（unit + supertest e2e）                                                 |

### 前端 `apps/web`

| 分類      | 套件                                                              |
| --------- | ----------------------------------------------------------------- |
| 建構工具  | Vite 8                                                            |
| UI 框架   | React 19 + TypeScript 6（strict）                                 |
| 樣式      | Tailwind CSS v4（`@import 'tailwindcss';`，無 PostCSS config）    |
| 元件庫    | shadcn/ui（Nova preset、neutral 配色、Geist 字體）                |
| 路由      | React Router v7（declarative mode）                               |
| 資料層    | TanStack Query v5（搭配 `@app/api-client` 的 hooks factory）      |
| 表單      | react-hook-form + zod + **`standardSchemaResolver`**              |
| 表格      | TanStack Table v8                                                 |
| 圖示      | lucide-react                                                      |

### 共用 `packages/api-client`

| 分類           | 套件                                                |
| -------------- | --------------------------------------------------- |
| 型別產生       | `openapi-typescript`（將 OpenAPI yaml → `paths` 型別） |
| Runtime client | `openapi-fetch`                                     |
| 整合方式       | 包成 TanStack Query 風格 hooks，自動 unwrap 後端外殼 |
| 對外 API       | `createApiClient(baseUrl, getToken?)`、`createApiQueryHooks(client)` → `useApiQuery` / `useApiMutation` |

---

## 後端架構：六角（Ports & Adapters）

```
apps/api/src/
├── adapter/
│   ├── in/web/
│   │   ├── admin/     # 後台 Controller + DTO（per-module；路由 /api/admin/<names>）
│   │   ├── front/     # 前台 Controller + DTO（公開；路由 /api/front/<names>）
│   │   └── {guard,filter,interceptor,decorator}/  # 共用橫切（與 admin/front 平級）
│   └── out/           # Prisma、Redis、Firebase、Mail、S3 等實作（共用，不分前後台）
├── application/
│   ├── facade/{admin,front}/     # 每個 domain area 一個 *Facade，分前後台
│   ├── port/
│   │   ├── in/{admin,front}/{module}/   # Use case 介面，分前後台
│   │   └── out/{module}/                # Repository / 外部服務介面（共用）
│   └── service/{admin,front,shared}/    # Use case 實作（shared = 跨前後台共用）
├── domain/
│   ├── model/         # 領域實體（private constructor + static factory）（共用）
│   ├── value-object/  # 值物件（共用）
│   └── exception/     # 領域例外（plain Error 子類）（共用）
├── infrastructure/    # PrismaModule / PrismaService、Redis、ZodValidationPipe、Logger
└── modules/{admin,front}/   # NestJS DI 接線（中性 infra module 留在 modules/ 根）
```

**依賴方向**：`adapter/in` → `application` → `port/out` ← `adapter/out`。`application` 與 `domain` 層**從不**引入 `adapter`。

**前後台分層**：專案有兩套 API —— 後台（admin，管理端，`/api/admin/*`）與前台（front，公開端，`/api/front/*`）。切分只發生在 **in 側 5 層**（controller / facade / service / port-in / module → 各自進 `admin/` 或 `front/`）；**out 側**（port-out / persistence）、**domain**（model / value-object / exception）、以及 **in 側橫切**（guard / filter / interceptor / decorator）一律**共用、不分前後台**，照 domain 分類放各層根目錄。中性 infra module（health / redis / jwt / email…）留在 `modules/` 根。前台 module 類名加 `Front` 前綴避免與後台同名撞名。**新模組一律用 `gen:module <name> [--admin|--front]` 產生（預設 admin），不要手刻。** Swagger 亦分兩份：後台 `/api/admin/docs`（yaml 在 `docs/swagger/admin/`，餵 `packages/api-client` 給 `apps/web`）、前台 `/api/front/docs`（`docs/swagger/front/`）。health 為中性 ops 端點，不入任一份 client 契約。

### 後端慣例

- **Module naming（依 `<side>` = `admin` / `front` 分層）**：in 側依側別分目錄——Controller + DTO → `adapter/in/web/<side>/<module>/`；service → `application/service/<side>/<module>/`（跨前後台共用 service 放 `application/service/shared/`）；facade → `application/facade/<side>/`；port-in → `application/port/in/<side>/<module>/`；module → `modules/<side>/<module>.module.ts`。**共用層不分前後台**：Prisma repository → `adapter/out/persistence/<module>/`、port-out → `application/port/out/<module>/`、domain → `domain/`；Guard / Filter / Decorator / Interceptor 放各自頂層目錄。
- **Facade**：每個 domain area 對外只暴露 `*Facade`（如 `AuthFacade`、`MemberFacade`），Controller 透過 facade 操作，不直接打 service。
- **Domain exception → HTTP**：domain exception 一律 `extends DomainException`（建構子傳 `ResponseCodes` 的 code + 語意 `kind`）；`GlobalExceptionFilter` 以一張 `kind → HttpStatus` 表自動映射，**新增 exception 不用改 filter**，只需把 code 加進 `src/shared/constants/response-codes.ts`。kind 可選 `NOT_FOUND / UNAUTHORIZED / FORBIDDEN / INVALID / CONFLICT / LOCKED / INTERNAL`。
- **Guard 順序**：`app.module.ts` 內 `APP_GUARD` 的宣告順序 = 執行順序：ThrottlerGuard → IpBlacklistGuard → IpWhitelistGuard → SessionIdleGuard → JwtAuthGuard → PermissionsGuard。
- **Controller 回傳**：原始值即可，`TransformInterceptor` 會包成 `{ success, data, timestamp }`；**不要**自行包 `{ data }`，否則前端要挖兩層。
- **時區 / 日期**：見下方「時間處理慣例」。
- **Repository P2002**：Prisma `unique constraint violation` 在 Repository 層 try/catch 轉成 domain exception，service 層不感知 Prisma。

### 命名規範

| 對象                  | 慣例                 | 範例                                          |
| --------------------- | -------------------- | --------------------------------------------- |
| API JSON 欄位         | camelCase            | `permissionCodes`、`createdAt`                |
| TS 變數 / 函式        | camelCase            | `roleFacade`、`listRoles`                     |
| Class                 | PascalCase           | `RoleController`、`CreateRoleService`         |
| Zod schema            | `<camel>Schema`      | `createRoleSchema`、`listRolesQuerySchema`    |
| Zod 推導型別 / DTO    | PascalCase           | `CreateRoleRequest`、`ListRolesQuery`         |
| DI token / port 常數  | SCREAMING_SNAKE_CASE | `CREATE_ROLE_USE_CASE`、`ROLE_REPOSITORY_PORT`|
| 錯誤 code             | SCREAMING_SNAKE_CASE | `ROLE_NOT_FOUND`                              |
| 檔名（class）         | PascalCase           | `RoleController.ts`、`CreateRoleUseCase.ts`   |
| 檔名（infra / module）| kebab-case           | `zod-validation.pipe.ts`、`role.module.ts`    |
| 資料夾                | kebab-case           | `adapter/in/web/role`、`application/service/role` |

### 時間處理慣例

**單一原則：UI 一律本地時區（`APP_TIMEZONE`）、DB 儲存與後端運算 / 比較一律 UTC instant、轉換只在後端邊界做。**

- **DB & 運算**：`DateTime` 欄位存 **UTC instant**（`new Date()`；Prisma driver 層 `timezone: 'Z'` 已強制 UTC 寫入 / 讀回）。日期比較（如「開始日是否為未來」）一律用 instant——`start.getTime() > Date.now()`，**不要**用 `YYYY-MM-DD` 字串比大小（會受時區位移錯一天）。
- **API 契約**：日曆日輸入 / 輸出用 **`APP_TIMEZONE` 日曆日的 `YYYY-MM-DD` 字串**（Zod `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`，**不要** `z.coerce.date()`——它把字串當 UTC 午夜 parse，跨時區會錯一天）；read-model 的時間欄位回 UTC `Date`，前端負責格式化為本地。
- **日邊界轉換（只在後端邊界做）**：`APP_TIMEZONE` 日曆日 → UTC instant 用 dayjs tz——開始日 `dayjs.tz(day, tz).startOf('day').toDate()`、結束日 `dayjs.tz(day, tz).endOf('day').toDate()`。首個用到「日區間查詢」的功能把它抽成 `date.ts` 的 `appDayStartUtc` / `appDayEndUtc` / `rangeToUtc`（+ spec）供之後共用。
- **禁止**：`new Date(d).toISOString().slice(0, 10)` 當「本地日」顯示（那是 UTC 日、會錯一天）；後端直接把前端傳的 `YYYY-MM-DD` 用 `new Date()` 當本地日存（跨環境系統時區不定）。

### Swagger yaml 慣例

- **分檔 + `$ref`**：`docs/swagger/openapi.yaml` 只放 `components` / `servers` / `info` 與 `paths` 索引；每個 endpoint 一個獨立 yaml。
- **成功回應自己 inline 寫**：**不要** `$ref: SuccessResponse`。每個 endpoint 在 200 / 201 直接 inline 寫整個 `{ success, data: <具體 shape>, timestamp }`。原因：`SuccessResponse.data` 是 generic `type: object`，前端 `openapi-typescript` 推導出來只會是 `Record<string, unknown> | null`，型別失去意義。範例見 `apps/api/docs/swagger/auth/login.yaml`、`profile/get-me.yaml`。
- **新增 endpoint 後**：執行 `pnpm --filter @app/api swagger:bundle` 重新打包 bundle；前端執行 `pnpm --filter @app/api-client generate` 同步型別。

---

## 前端架構（apps/web/src/）

```
apps/web/src/
├── api/
│   ├── client.ts        # apiClient singleton + 401 onResponse middleware；export useApiQuery / useApiMutation
│   └── query-client.ts  # 共用 QueryClient（admin 工具用 refetchOnWindowFocus: false）
├── components/
│   ├── ui/              # shadcn 元件落地處（由 components.json 管）
│   └── RequireAuth.tsx  # 路由保護 guard，未登入導向 /login
├── routes/
│   ├── _layout.tsx      # Sidebar 共用 layout
│   ├── login/page.tsx
│   └── home/page.tsx
├── lib/                 # cn()、tokenStorage 等 utils
├── App.tsx              # Router + QueryClientProvider + TooltipProvider
├── main.tsx
└── index.css            # Tailwind v4 + shadcn theme tokens
```

### 前端慣例

- **路徑別名**：`@/*` → `src/*`（在 `tsconfig.app.json` 的 `paths` 與 `vite.config.ts` 的 `resolve.alias` 雙邊設定）。
- **API 呼叫**：一律走 `import { useApiQuery, useApiMutation } from '@/api/client'`；不要自己寫 `fetch` 或 axios。型別由 `@app/api-client` 從 OpenAPI 推導，IDE 自動補全。
- **表單**：react-hook-form + zod + **`standardSchemaResolver`**（從 `@hookform/resolvers/standard-schema` 引入，**不要**用 `zodResolver`，與 zod 4.1+ 型別簽章衝突）。
- **token 儲存**：admin 工具，access token 存 `localStorage`，key = `access_token`；統一從 `@/lib/storage` 的 `tokenStorage` 存取，**不要**散在各檔案。
- **401 處理**：`apiClient.use({ onResponse })` 全域 middleware 處理（清 token → 跳 `/login`），page 元件不需要再 catch。
- **shadcn 元件**：執行 `cd apps/web && pnpm dlx shadcn@latest add <name>` 加入。`form` 元件目前 nova preset 缺貨，**已自寫**於 `src/components/ui/form.tsx`（標準 shadcn 模板），更新 shadcn 時注意保留。
- **UI 文字**：一律繁體中文 hardcode，**不導入 i18n 框架**。註解亦只用繁體中文。
- **Lint exception**：`src/components/ui/**` 與 `src/hooks/use-mobile.ts` 是 shadcn 直接 copy 的官方範本，與專案 lint 規則不同的部分（hook 與元件同檔、effect 內 setState）在 `eslint.config.js` 集中 disable。

---

## API client（packages/api-client/）

- **Source-first 設計**：`package.json` 的 `exports.types` / `exports.default` 直接指 `src/index.ts`。Vite / tsc 直接吃 TS，**無 dist build**。
- **產生流程**：
  1. 後端改 controller / Swagger yaml。
  2. `pnpm --filter @app/api swagger:bundle` 重新打包 `apps/api/docs/swagger/openapi.bundle.yaml`。
  3. `pnpm --filter @app/api-client generate` 讀 bundle 產生 `src/schema.ts`。
- `schema.ts` **進 git**：API 變動會在 PR diff 中可見，CI 可比對是否與 bundle 同步。
- **自動 unwrap**：`createApiQueryHooks` 內部會剝開後端的 `{ success, data, timestamp }` 外殼，page 元件直接拿 `data`。

---

## 認證流程

- **登入**：POST `/auth/login` → 後端回 `{ accessToken, refreshToken, accessTokenExpiresIn, refreshTokenExpiresIn, member }` → 前端存 `localStorage.access_token` → 導向 `/`。
- **每次請求**：`apiClient` 的 onRequest middleware 自動帶 `Authorization: Bearer <token>`，token 由 `tokenStorage.get()` 即時讀（**不快取**，更新後立即生效）。
- **JwtAuthGuard 安全檢查**：payload 必須有 `type: 'access'`，否則拒絕（防止 refresh token 當 access 用）。
- **快取一致性**：變更 member `status` / `roleId` / 密碼後必須呼叫 `clearMemberContext(memberId)`，否則最長延遲 `PERMISSION_CACHE_TTL` 秒（預設 300s）。
- **401 處理**：前端 apiClient 統一清 token + 跳 login（middleware 處理）。

---

## 環境變數

- 後端：`apps/api/.env`（範本 `apps/api/.env.example`）。
- **新增 env 變數必須同步加入 `apps/api/src/infrastructure/validate-env.ts` 的 Zod schema**（並更新 `.env.example`）：漏加驗證的 env 在缺值 / 型別錯時不會被擋，運行期才以 `undefined` 靜默出錯；production 專屬強制檢查（CORS `*`、`BCRYPT_ROUNDS` 下限等）也一併在此宣告。
- 前端：若需要走 Vite 環境變數，鍵名以 `VITE_` 開頭，放 `apps/web/.env`。目前無前端環境變數需求。
- **CORS_ORIGIN**：支援逗號分隔多 origin，預設 `http://localhost:3000,http://localhost:5173`。
- **`*` 在生產環境會擋下**：validate-env 強制要求明確指定 origin。
- **可觀測性（皆預設關閉）**：`APPLICATION_SENTRY_ENABLED` + `SENTRY_DSN`（+ `SENTRY_TRACES_SAMPLE_RATE`）開啟 Sentry 錯誤上報；`APPLICATION_METRICS_ENABLED` 掛載 Prometheus `/api/metrics`。此兩開關由 `getEnv()` 直讀（非 `FeatureFlagService`）：Sentry 在 `instrument.ts` 的 `Sentry.init({ enabled })` 控制、未啟用時 `captureException` 為 no-op；Metrics 在 `app.module.ts` imports 條件式掛載、關閉時完全不註冊端點。
- **單一埠部署**：`WEB_STATIC_ROOT` 指定前端打包根目錄（未設則由 api 相對自身編譯輸出找 `apps/web/dist`）。設定後 `node dist/main` 同一個埠同時服務前端 SPA + API：`ServeStaticModule.forRootAsync` 在 init 時偵測 `index.html`（無則略過掛載），`exclude: ['/api/{*path}']` 確保 `/api` 不被 SPA fallback 攔截；dev 仍走 Vite proxy 不受影響。
- **排程（@nestjs/schedule，預設關閉）**：`SCHEDULE_ENABLED` 開關範例排程、`SCHEDULE_EXAMPLE_CRON`（6 欄位含秒）設 cron。排程器以 `onModuleInit` 動態註冊（`@Cron` decorator 在模組載入時求值、早於 dotenv 讀不到 `.env`），範式見 `apps/api/src/adapter/in/scheduler/ExampleScheduler.ts`；時區用 `APP_TIMEZONE`。

---

## 後端模組功能參考

### API 端點總覽

後台端點以 `/api/admin` 為前綴、前台以 `/api/front`；health 為中性 `/api/health`。Swagger UI：後台 `http://localhost:3000/api/admin/docs`、前台 `http://localhost:3000/api/front/docs`。

| 群組     | 路徑                                | 權限                                     |
| -------- | ----------------------------------- | ---------------------------------------- |
| Auth     | `/api/admin/auth/{login,refresh,logout,forgot-password,reset-password}` | 公開（含 reCAPTCHA） |
| Me       | `GET /api/admin/me`                 | JWT                                      |
| Members  | `GET/POST/PATCH/DELETE /api/admin/members*` | JWT + `BACKEND:ACCOUNT:VIEW/EDIT` 權限 |
| Roles    | `GET/POST/PATCH/DELETE /api/admin/roles*` | JWT + `BACKEND:ROLE:VIEW/EDIT` 權限      |
| Security | `/api/admin/security/ip-{whitelist,blacklist}*`、`/api/admin/security/unlock-account` | JWT + ADMIN 角色 |
| Front    | `GET /api/front/ping`（骨架示範，待實際前台端點取代） | 公開                        |
| Health   | `GET /api/health`（liveness）、`GET /api/health/ready`（readiness，探 DB + Redis） | 公開（中性、不加 /admin，不計速率限制） |
| Metrics  | `GET /api/metrics`（Prometheus，flag 開啟才掛載） | 公開（不計入速率限制；需網路層保護）     |

### RBAC 權限系統

資料表：

- `roles` — 角色；`isDefault = true` 的角色為新帳號的預設角色
- `permissions` — 權限代碼
- `role_permissions` — 多對多關聯

| PermissionCode 常數    | 代碼字串               |
| ---------------------- | ---------------------- |
| `BACKEND_ACCOUNT_VIEW` | `BACKEND:ACCOUNT:VIEW` |
| `BACKEND_ACCOUNT_EDIT` | `BACKEND:ACCOUNT:EDIT` |
| `BACKEND_ROLE_VIEW`    | `BACKEND:ROLE:VIEW`    |
| `BACKEND_ROLE_EDIT`    | `BACKEND:ROLE:EDIT`    |

Seed 預設建立一個角色（`roleCode: SUPERADMIN`，`isDefault: true`）並指派所有權限。

**JWT Payload 設計**：只存 `sub`（memberId）與 `type`（`access` / `refresh`）。每次請求由 `JwtAuthGuard` 以 `sub` 從 Redis 快取或 DB 載入使用者完整資訊（含 email、roleName、permissions），附加至 `request.member`。

**快取 TTL**：取 `min(JWT 剩餘效期, PERMISSION_CACHE_TTL)`，確保 Token 過期後快取同步失效。

**Redis 降級**：Redis 不可用時，`JwtAuthGuard` 自動降級為每次請求直接查 DB，並在日誌中印出警告。服務不中斷，但效能下降。

#### Guard 用法

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

#### 取得當前使用者

```typescript
@Get('me')
@UseGuards(JwtAuthGuard)
getMe(@CurrentMember() member: MemberContext) {
  // member.sub / member.email / member.roleName / member.permissions
}
```

`MemberContext` 定義於 `apps/api/src/adapter/in/web/decorator/current-member.decorator.ts`，欄位為 `sub`（memberId）、`email`、`roleName`、`permissions`、`status`、`lastPasswordChange`。

### 全域中介層

以下 Provider 在 `apps/api/src/app.module.ts` 全域註冊，**所有端點自動套用，無需手動加裝飾器**：

| Provider          | 類別                    | 作用                                                                                                   |
| ----------------- | ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `APP_GUARD`       | `ThrottlerGuard`        | 速率限制（Redis 滑動視窗）；全域預設由 env 配置，各端點可用 `@Throttle()` 覆蓋；Redis 不可用時自動停用 |
| `APP_GUARD`       | `IpBlacklistGuard`      | IP 黑名單檢查（FeatureFlag 控制，關閉時跳過）                                                          |
| `APP_GUARD`       | `IpWhitelistGuard`      | IP 白名單檢查（FeatureFlag 控制，關閉時跳過）                                                          |
| `APP_GUARD`       | `SessionIdleGuard`      | 閒置登出檢查（FeatureFlag 控制，關閉時跳過）                                                           |
| `APP_FILTER`      | `GlobalExceptionFilter` | 統一例外格式，並寫入 System Log                                                                        |
| `APP_INTERCEPTOR` | `LoggingInterceptor`    | 成功請求寫入 System Log（FeatureFlag 控制，fire-and-forget）                                           |
| `APP_INTERCEPTOR` | `TransformInterceptor`  | 成功回應包裝為 `{ success, data, timestamp }`                                                          |

### API 回應格式

**成功回應**：

```json
{ "success": true, "data": { ... }, "timestamp": "2026-04-05T06:00:00.000Z" }
```

**錯誤回應**：

```json
{ "success": false, "message": "帳號或密碼錯誤", "code": "UNAUTHORIZED", "timestamp": "..." }
```

`code` 欄位由例外的 class name 自動轉換為 SCREAMING_SNAKE_CASE（例如 `EmailAlreadyExistsException` → `EMAIL_ALREADY_EXISTS`）。

前端 `@app/api-client` 的 hooks 會自動 unwrap `data` 外殼。

### 功能開關（Feature Flags）

所有安全功能皆受 `FeatureFlagService` 控制，透過環境變數開關，**預設全部關閉**（除 `APPLICATION_ADMIN_ROLE_ENABLED`）。

```typescript
constructor(private readonly featureFlags: FeatureFlagService) {}
if (this.featureFlags.isEnabled('accountLockEnabled')) { ... }
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

### 安全功能細節

- **帳號鎖定**：連續登入失敗達 `APPLICATION_ACCOUNT_LOCK_THRESHOLD` 次後，帳號自動鎖定（DB `lockedAt` 欄位）。失敗計數使用 Redis INCR（30 分鐘 TTL），Redis 不可用時 graceful degradation（不計數，但 DB 鎖定仍有效）。登入成功自動重置計數。
- **IP 黑白名單**：`IpBlacklistGuard` / `IpWhitelistGuard` 全域攔截。IP 連續登入失敗達 `APPLICATION_IP_BLOCK_THRESHOLD` 次自動加入黑名單。資料表：`ip_whitelist`、`ip_blacklist`（後者含 `isAutoBlock` 標記）。
- **密碼策略**：`PasswordPolicyService` 依角色套用不同複雜度（0–3）。複雜度 3 = 大小寫 + 數字 + 特殊符號 + 禁止 18 組常見弱密碼。ADMIN 預設 3、其他角色預設 1。
- **密碼定期更換**：`passwordChangeEnabled` + `APPLICATION_PASSWORD_CHANGE_PERIOD > 0` 時，`JwtAuthGuard` 檢查 `lastPasswordChange`；超期回 `403 { code: 'PASSWORD_CHANGE_REQUIRED' }`。
- **閒置自動登出**：`SessionIdleGuard` 用 Redis TTL；每次認證請求刷新 TTL，超過 `APPLICATION_SESSION_IDLE_TIMEOUT` 分鐘未活動 key 自動消失，回 `401`。Redis 不可用時視為活躍。
- **Google reCAPTCHA**：`GoogleRecaptchaAdapter` 支援 v2 / v3。非正式環境（`GOOGLE_RECAPTCHA_IS_PRODUCTION=false`）永遠通過；v3 需通過 0.5 分數門檻。啟用時登入必須附帶 `recaptchaToken`。
- **登入日誌**：`LOGIN_SUCCESS` / `LOGIN_FAILURE` / `LOGOUT` / `PASSWORD_RESET` 寫入 `auth_logs`（含 IP / UA / detail）。fire-and-forget，不影響主流程。
- **密碼重設**：`POST /api/auth/forgot-password` 不論 email 是否存在皆回成功（防列舉），token 存 `password_reset_tokens` 表；`POST /api/auth/reset-password` 驗證 → 策略檢查 → 更新 → 條件式強制登出。

### 日誌系統

使用 `nestjs-pino` + `pino-http`：

- 開發：`pino-pretty` 彩色輸出至 stdout
- 生產：`pino-roll` 寫檔，每檔 5MB 自動輪轉
  - `apps/api/logs/combined.log` — 所有等級
  - `apps/api/logs/error.log` — 僅 error
- 測試：關閉 pino-roll

每筆請求自動帶 `requestId`（`randomUUID()`），可用於跨日誌追蹤。

**敏感欄位自動脫敏**：`password`、`passwordHash`、`token`、`secret`、`authorization`、`cookie`、`api_key`、`apiKey` 的值替換為 `[REDACTED]`。

### 資料脫敏

`apps/api/src/infrastructure/sanitize.ts` 提供多層脫敏，自動套用於 System Log 的 request / response：

| 場景                                           | 行為                    |
| ---------------------------------------------- | ----------------------- |
| 物件欄位名稱含敏感關鍵字                       | 值替換為 `[REDACTED]`   |
| Base64 圖片資料（`data:image/...`）            | 替換為 `[BASE64_IMAGE]` |
| URL Query String 中的 `email`、`phone`、`name` | 替換為 `[REDACTED]`     |

### Zod 驗證

DTO 使用 `ZodValidationPipe` 搭配 Zod schema，於 route 層級套用：

```typescript
// dto/CreateXxxRequest.ts
export const createXxxSchema = z.object({ name: z.string().min(1) });
export type CreateXxxRequest = z.infer<typeof createXxxSchema>;

// XxxController.ts
@Post()
create(@Body(new ZodValidationPipe(createXxxSchema)) dto: CreateXxxRequest) {}
```

驗證失敗會 throw `BadRequestException`，由 `GlobalExceptionFilter` 包裝回 `{ code: 'BAD_REQUEST' }`。

### 日期工具

`apps/api/src/infrastructure/date.ts` 提供預設時區與中文語系的 dayjs 實例（時區由 `APP_TIMEZONE` 控制）：

```typescript
import dayjs, { formatDate, formatYMD, formatDateWithDay } from '../infrastructure/date';

formatDate(new Date());        // "2026-04-05"
formatYMD(2026, 4, 5);         // "2026年04月05日"
formatDateWithDay(new Date()); // "2026-04-05 (日)"
```

### Seed 管理

Seed 檔案放在 `apps/api/seeds/`，timestamp 前綴確保執行順序，透過 `SeedHistoryRecord` 做冪等控制：

```
apps/api/seeds/
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

執行：`pnpm --filter @app/api db:seed`。**production 環境會被擋下**（除非設定 `ALLOW_PROD_SEED=1`）。

### 測試結構

```
apps/api/src/
├── domain/{model,value-object}/*.spec.ts
├── application/service/*.spec.ts
└── adapter/in/web/{guard,filter,interceptor}/*.spec.ts

apps/api/test/
├── test-app.ts            # createE2EApp()（注入真 PrismaService）、createMockRedis() 工廠
├── setup-env.ts           # e2e 環境變數：DB_DATABASE=*_test、關限流（超大 rate limit）
├── helpers/db.ts          # 測試庫 reset / seed helper（跨 spec 共用）
├── global-setup.ts        # 守門（僅 *_test 庫）→ 建庫 + migrate deploy + seed baseline
├── global-teardown.ts     # 收尾（disconnect）
├── auth.e2e-spec.ts
├── member.e2e-spec.ts
├── role.e2e-spec.ts
├── security.e2e-spec.ts
└── serve-static.e2e-spec.ts   # 單一埠：服務前端 dist + SPA fallback + /api 不被攔截（forceServeStatic）
```

E2E 走**真正的 test 資料庫**（非 mock Prisma），只 mock Redis：

- **專用測試庫**：`test/setup-env.ts` 把 `DB_DATABASE` 覆寫成 `*_test`（本專案 Prisma 走 object-config `PrismaMariaDb`、非 `DATABASE_URL`，故以資料庫「名稱」隔離）；`createE2EApp` 用**真 `PrismaService`** 連該庫。
- **globalSetup 守門**：目標 DB 名稱不是 `*_test` 就中止（絕不誤 migrate / 清空 dev / prod 庫）；通過才建庫 + `prisma migrate deploy` + seed baseline。腳本內跑 prisma 一律 `pnpm exec`（不用 `npx`，否則噴 pnpm `Unknown env config` warn）。
- **序列執行**：`test:e2e` 用 `--runInBand`（等同 `maxWorkers:1`）——所有 spec 共用同一測試庫，平行會互相 `deleteMany` race（`AUTH_UNAUTHENTICATED` / `P2025` 間歇失敗）。
- **關限流**：`setup-env.ts` 設超大 rate limit env 關掉全域 `APP_GUARD ThrottlerGuard`——序列連跑會跨 spec 累計觸發 429；且 `.overrideGuard(ThrottlerGuard)` 對「經 `APP_GUARD` 註冊的全域 guard」**無效**（NestJS 已知坑），只能走 env。
- **每 spec 自理狀態**：`beforeEach` 用 `helpers/db.ts` reset（`deleteMany` 相關表）+ seed 該 spec 需要的資料。
- Redis 仍以 `createMockRedis()` 注入（本次只把 persistence 拉成真 DB）。

> 為何走真 DB：provider 建構子副作用（如 `S3FileStorage` 於建構子建 client）、env 空字串、adapter 即時計算的欄位等，**只有接真 DI + 真 DB 的 e2e 抓得到**，mock 版看不到。

### System Log

`apps/api/src/modules/system-log.module.ts` 透過 `SaveSystemLogPort` 將請求記錄寫入 DB（`PrismaSystemLogRepository`）。欄位：

| 欄位                           | 說明                            |
| ------------------------------ | ------------------------------- |
| `userId`                       | 登入使用者 ID（未登入為空）     |
| `action`                       | 動作描述                        |
| `method`                       | HTTP 方法                       |
| `url`                          | 請求路徑（query string 已脫敏） |
| `statusCode`                   | HTTP 狀態碼                     |
| `execTime`                     | 執行時間（ms）                  |
| `requestTime` / `responseTime` | 請求與回應時間                  |

成功路徑由 `LoggingInterceptor` 處理，錯誤路徑由 `GlobalExceptionFilter` 處理，共用 `system-log-helper.ts` 的 `buildSystemLogData()`。

### 分頁

`apps/api/src/infrastructure/pagination.ts`：

```typescript
import { getPagination, buildPaginationMeta } from '../infrastructure/pagination';

const { page, limit, offset } = getPagination(query);
const meta = buildPaginationMeta(page, limit, totalCount);
// { page, limit, total, totalPages }
```

`page` 最小 1；`limit` 預設來自 `DEFAULT_PAGE_LIMIT`，上限 100。

### 新增 Domain Module 範本

以新增 `Order` 模組為例：

```
1.  apps/api/prisma/schema.prisma                                        # 加 OrderRecord model → db:migrate
2.  apps/api/src/domain/model/Order.ts                                   # 領域實體
3.  apps/api/src/domain/exception/OrderNotFoundException.ts              # 領域例外
4.  apps/api/src/application/port/in/order/CreateOrderUseCase.ts         # Inbound Port
5.  apps/api/src/application/port/out/order/SaveOrderPort.ts             # Outbound Port
6.  apps/api/src/application/service/order/CreateOrderService.ts         # Use Case 實作
7.  apps/api/src/application/facade/OrderFacade.ts                       # Facade
8.  apps/api/src/adapter/out/persistence/order/PrismaOrderRepository.ts
9.  apps/api/src/adapter/in/web/order/CreateOrderRequest.ts              # Zod schema + DTO
10. apps/api/src/adapter/in/web/order/OrderController.ts
11. apps/api/src/modules/order.module.ts                                 # DI 接線（含 JwtModule import）
12. apps/api/src/app.module.ts                                           # 引入 OrderModule
13. apps/api/src/adapter/in/web/filter/GlobalExceptionFilter.ts          # 新增例外對應
14. apps/api/docs/swagger/orders/create-order.yaml                       # Swagger 文件（inline shape，不用 SuccessResponse $ref）
15. apps/api/test/order.e2e-spec.ts                                      # E2E 測試
```

> 若 Controller 使用 `JwtAuthGuard`，記得在對應 Module 的 `imports` 加入 `JwtModule`。
>
> 以下模組標記為 `@Global()`，全域可注入，新模組**不需要** import：
> - `RedisModule` — `TOKEN_BLACKLIST_PORT`、`CLEAR_MEMBER_CONTEXT_PORT`、`MEMBER_CONTEXT_CACHE_PORT`、`SESSION_ACTIVITY_PORT`
> - `FeatureFlagModule` — `FeatureFlagService`
> - `AuthLogModule` — `SAVE_AUTH_LOG_PORT`
> - `SecurityModule` — `ACCOUNT_LOCK_PORT`、`IP_BLOCK_PORT`、`IP_LIST_PORT`
> - `RecaptchaModule` — `RECAPTCHA_VERIFY_PORT`

---

## 慣例參考索引

| 主題                       | 詳細位置                                         |
| -------------------------- | ------------------------------------------------ |
| 過去踩過的坑與決定         | `tasks/lessons.md`                               |
| 跨 change 待辦             | `tasks/todo.md`                                  |
| 進行中 change 提案         | `openspec/changes/<name>/`                       |
| 已封存 change              | `openspec/changes/archive/<日期>-<name>/`        |
| 已批准的能力規格           | `openspec/specs/<capability>/spec.md`            |
| Claude 行為與 workflow     | `CLAUDE.md`（英文）                              |
| 人類 onboarding            | `README.md`                                      |

---

## 完整指令參考

套件管理：**pnpm 11+**（root 透過 `packageManager` 欄位 + corepack 自動鎖版本）。

### Root 跨 workspace

```bash
pnpm install                 # 一次裝完所有 workspace 依賴
pnpm dev                     # concurrently 啟動 apps/api + apps/web
pnpm build                   # 依序 build apps/api → apps/web（api-client source-first，無 build）
pnpm typecheck               # 三個 workspace 全部 tsc --noEmit
pnpm lint                    # 三個 workspace 全部 eslint
pnpm test                    # 跑各 workspace 的 test script
```

### 後端 `apps/api`

```bash
# 開發
pnpm --filter @app/api dev               # watch 模式
pnpm --filter @app/api start:debug       # debug + watch
pnpm --filter @app/api build             # nest build → apps/api/dist
pnpm --filter @app/api start:prod        # 啟動 build 產物

# 程式碼品質
pnpm --filter @app/api lint
pnpm --filter @app/api lint:fix
pnpm --filter @app/api format

# 測試
pnpm --filter @app/api test              # 單元測試 (*.spec.ts)
pnpm --filter @app/api test:watch
pnpm --filter @app/api test:cov
pnpm --filter @app/api test:e2e          # E2E（需 MySQL + Redis）

# 資料庫（一律在 apps/api 工作目錄執行）
pnpm --filter @app/api db:create
pnpm --filter @app/api db:drop
pnpm --filter @app/api db:migrate              # 開發環境（含 generate）
pnpm --filter @app/api db:migrate:deploy       # 生產環境部署
pnpm --filter @app/api db:generate             # 僅產生 Prisma client（搬 monorepo 後第一次 typecheck 必跑）
pnpm --filter @app/api db:seed
pnpm --filter @app/api db:studio

# Swagger
pnpm --filter @app/api swagger:bundle    # 合併分檔 yaml → openapi.bundle.yaml
```

### 前端 `apps/web`

```bash
pnpm --filter @app/web dev               # Vite dev server (5173, proxy /api → :3000)
pnpm --filter @app/web build             # tsc -b && vite build → apps/web/dist
pnpm --filter @app/web typecheck
pnpm --filter @app/web lint
pnpm --filter @app/web preview           # 預覽生產 build

# 加 shadcn 元件（要在 apps/web 工作目錄）
cd apps/web && pnpm dlx shadcn@latest add <component>
```

### API client `packages/api-client`

```bash
# 後端 controller / Swagger 改動後同步型別
pnpm --filter @app/api swagger:bundle
pnpm --filter @app/api-client generate   # openapi.bundle.yaml → src/schema.ts

pnpm --filter @app/api-client typecheck  # source-first，無 build
```
