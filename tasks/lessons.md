# Lessons Learned

_Patterns, rules, and validated decisions accumulated over time. Updated after corrections or after confirming a non-obvious approach worked._

## Prisma / 資料庫

- **修改 schema 後必須執行 `npx prisma generate`**：否則 `@prisma/client` 的 TypeScript 會找不到新 model，甚至 `PrismaClient` 型別報 "has no exported member"。

- **Prisma v7 MariaDB adapter 用物件組態，不用 URL**：`new PrismaMariaDb({ host, port, user, password, database, timezone: 'Z' })`。URL 形式（`mysql://...?timezone=Z`）不被 v7 driver 穩定解析，且密碼含特殊字元會炸 URL parser。

- **DB 時間一律 UTC**：`timezone: 'Z'` 已在 `prisma.service.ts` 設定；JS `Date` 寫入/讀回都當作 UTC，跨時區部署不會位移。

- **Prisma P2002 `unique constraint violation` 應在 Repository 層轉為 domain exception**：`findByEmail + create` 存在競態，Repository 的 `create` 外層 try/catch，`err.code === 'P2002'` 時 throw domain exception；Service 層不需感知 Prisma 錯誤。

## JWT / 認證

- **LoginService 生成 token 時必須帶 `type: 'access'`**：`JwtAuthGuard` 有 `payload.type !== 'access'` 安全檢查，缺少此欄位會拒絕所有請求。

- **JwtAuthGuard 快取命中與 DB 查詢兩條路徑都要檢查 `member.status`**：停用帳號的舊 JWT 在自然過期前仍可通，兩條路徑都要 `if (!data.status) throw new AccountDisabledException()`。

- **可變更 member context 的操作都要清除快取**：`status` / `roleId` / 密碼變更後必須呼叫 `clearMemberContext(memberId)`，否則最長延遲 `PERMISSION_CACHE_TTL` 秒（預設 300s）才生效。

## NestJS / HTTP 層

- **Controller 只回傳原始值，不要自行 wrap**：`TransformInterceptor` 會把回傳值包成 `{ success, data, timestamp }`；Controller 若再包一層 `{ data }` 會變成 `data.data`，測試與前端都要多挖一層。

- **APP_GUARD 的 providers 順序 = 執行順序**：`app.module.ts` 裡 `{ provide: APP_GUARD, useClass: X }` 的宣告順序即套用順序。ThrottlerGuard → IpBlacklistGuard → IpWhitelistGuard → SessionIdleGuard 是刻意設計，新增 Guard 時注意位置。

- **Express 5 下 literal 路由要避免被 `:id` 吃掉**：`@Patch('bulk-status')` 即使宣告在 `@Patch(':id')` 前，仍可能被 `:id` 先匹配。解法：用兩段式路徑（如 `bulk/status`），`:id` 只匹配單一 segment。

- **PATCH/PUT 預設回傳 200，要 204 需明確加 `@HttpCode(HttpStatus.NO_CONTENT)`**：只有 POST 預設 201，其他方法預設皆 200。

## Domain Exception / GlobalExceptionFilter

- **新增 domain exception 後，GlobalExceptionFilter 必須同步加 `instanceof` 分支**：否則 fallback 到 500。每個 domain exception 對應：(1) `src/domain/exception/` 檔案；(2) Filter 有 instanceof 判斷 + 正確 HttpStatus + `code`（SCREAMING_SNAKE_CASE）。

## 測試

- **Guard 邏輯變更後，spec mock payload 必須同步更新**：mock `jwtService.verify` 回傳值若缺少 `type: 'access'`，測試直接失敗且錯誤訊息會誤導排查。

- **Zod v4 的 `z.string().uuid()` 嚴格 RFC 4122**：測試 UUID 不能用 `00000000-0000-0000-0000-000000000010`（版本/變體皆 0），要改成合法 v4 形式如 `00000000-0000-4000-8000-000000000001`。

- **e2e 跑完 Jest worker 卡住 → `forceExit: true`**：`pino-roll` file stream 在 `app.close()` 後仍持有 handle。在 `test/jest.e2e.config.js` 加 `forceExit: true`；各 spec 的 `afterAll(() => app.close())` 仍需保留。

- **新增 Port 方法會讓既有 mock spec 報 TypeScript 錯誤**：擴充 port interface 時要同步在所有相關 spec 的 mock 物件補上 `jest.fn()`，否則 compile fail。

## Swagger

- **採分檔 + `$ref` 結構**：`openapi.yaml` 只放 components / servers / info 與 paths 索引；每個 endpoint 一個獨立 yaml。不要 inline 寫整包 spec。

- **新增 endpoint 後要重新 `npm run swagger:bundle`**：`main.ts` 讀的是 bundle 檔，忘了 bundle Swagger UI 不更新。bundle 同時也會驗證所有 `$ref`。

## Seeds / Scripts

- **`seed-runner.ts` 必須擋 production**：`if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_PROD_SEED) process.exit(1)`，避免誤把測試資料 upsert 到生產庫。
