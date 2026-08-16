# 後端工具與產生器

> 日誌、資料脫敏、Zod 驗證、日期工具、檔案儲存、Seed、System Log、分頁，以及 gen:module 產生器。

> 本檔為 `openspec/project.md` 的一部分，導覽見該檔。

---

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

### 檔案儲存與上傳安全

儲存走 port + driver 切換（`STORAGE_DRIVER=local|s3`），module 依 env 綁定實作，呼叫端只認 port。

上傳安全三件套，缺一不可：

| 措施 | 作法 |
| --- | --- |
| MIME 白名單 | 只允許明列的 content-type |
| 副檔名由 MIME 推導 | **不信任使用者送來的檔名副檔名** |
| 大小上限 | `MAX_UPLOAD_BYTES`，超過即拒 |

其他要點：multipart 的中文檔名需 latin1→UTF-8 還原；刪除時 key 由 fileUrl 尾兩段還原（與 base URL / driver 無關）；本機媒體 static 要排除 SPA fallback 並加 `nosniff` / CSP。

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

**一律用產生器，不要手刻**：`pnpm --filter @app/api gen:module <name> [--admin|--front]`

產生器**自動**完成（以 `order` 為例）：

```
domain/exception/OrderNotFoundException.ts          # 引用 ResponseCodes，靜態訊息只傳 (code, kind)
application/port/{in,out}/…/                        # Inbound / Outbound Port
application/service/<side>/order/                   # Use Case 實作 + spec
application/facade/<side>/OrderFacade.ts
adapter/out/persistence/order/PrismaOrderRepository.ts
adapter/in/web/<side>/order/{OrderController,…Request}.ts
modules/<side>/order.module.ts
app.module.ts                                       # 自動註冊 OrderModule
shared/constants/response-codes.ts                  # 自動注入 ORDER_NOT_FOUND
shared/constants/response-messages.ts               # 自動注入對應訊息（型別要求兩者成對）
docs/swagger/<side>/orders/*.yaml                   # 5 支 endpoint 的 yaml 骨架
docs/swagger/<side>/openapi.yaml                    # 自動註冊 paths
→ 自動重跑 swagger:bundle 與 api-client generate
```

**產出物零手改即通過 `typecheck` / `lint` / 全部架構守則**（唯一例外是 Prisma model 尚未建立造成的型別錯誤）。

你要手動完成的：

```
1. prisma/schema.prisma          # 加 OrderRecord model → db:migrate
2. 依實際欄位調整 DTO / port / service / Prisma repo
3. 同步 docs/swagger/<side>/orders/ 的 yaml 骨架（欄位、描述）
4. 視需要在 Controller 掛權限 guard（見 RoleController）
5. test/order.e2e-spec.ts        # E2E 測試（用 test/helpers/assertions.ts 的共用斷言）
```

> **`GlobalExceptionFilter` 不需要修改** —— domain exception 的 `kind` 會自動映射 HTTP status。

> 若 Controller 使用 `JwtAuthGuard`，記得在對應 Module 的 `imports` 加入 `JwtModule`。
>
> 以下模組標記為 `@Global()`，全域可注入，新模組**不需要** import：
> - `RedisModule` — `TOKEN_BLACKLIST_PORT`、`CLEAR_MEMBER_CONTEXT_PORT`、`MEMBER_CONTEXT_CACHE_PORT`、`SESSION_ACTIVITY_PORT`
> - `FeatureFlagModule` — `FeatureFlagService`
> - `AuthLogModule` — `SAVE_AUTH_LOG_PORT`
> - `SecurityModule` — `ACCOUNT_LOCK_PORT`、`IP_BLOCK_PORT`、`IP_LIST_PORT`
> - `RecaptchaModule` — `RECAPTCHA_VERIFY_PORT`
