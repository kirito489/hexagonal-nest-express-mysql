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

## NestJS build

- **`tsBuildInfoFile` 必須放在 dist 內**：`apps/api/nest-cli.json` 設 `deleteOutDir: true`，每次 `nest build` / `nest start --watch` 會把 dist 整個刪掉；但 TS `incremental: true` 的 `.tsbuildinfo` 預設在 tsconfig 旁邊（root），刪 dist 不會清掉它，導致 TS 以為「沒變動 = 不用 emit」，build 完 dist 是空的，nest 啟動 dist/main 失敗。**Why:** 2026-05-16 setup-monorepo-frontend 階段 10 後第一次 `pnpm dev`，前端 Vite 起來但 `[api]` 報 `Cannot find module '.../dist/main'`，明明 `tsc` 印 `Found 0 errors`。**How to apply:** `apps/api/tsconfig.json` 設 `"tsBuildInfoFile": "./dist/.tsbuildinfo"`，cache 與 build 產物同生共死。如果遇到「明明改過 code 卻沒重編」，先刪 `.tsbuildinfo` 重跑即可。

## Vite / Concurrently

- **Vite 8 在 stdout 為 pipe（concurrently / CI）時會抑制 ready banner**：直接在 terminal 跑 `vite` 會印 `VITE vX.X.X ready in XXX ms / ➜ Local: http://localhost:5173/`，但被 `concurrently` 包起來後 stdout 是 pipe，Vite 偵測到非 TTY 就完全靜音。dev server 實際**有跑**（curl 該 port 拿得到 HTML），只是 log 看不到。連寫個小 plugin 用 `console.log` 或 `process.stderr.write` 也無效（Vite 內部對 stream 做了處理）。**Why:** 2026-05-16 setup-monorepo-frontend phase 10 後手動測 `pnpm dev` 時 `[web]` 沒任何輸出，誤以為 Vite 沒起來；用 `ps` / `lsof -ti:5173` / `curl` 才確認其實是好的。**How to apply:** 別期待在 `pnpm dev` 看到 Vite ready 訊息；直接開瀏覽器 `http://localhost:5173/` 即可。要解決得換 PTY 支援的 runner（如 `npm-run-all2 --pty`），但成本不划算。

## Docker / 本機服務

- **Docker MySQL 容器剛啟動的前幾秒，Prisma adapter 連線池會 pool timeout**：`docker compose up -d` / `docker start my-mysql` 立刻打 API 會看到 `DriverAdapterError: pool timeout: failed to retrieve a connection from pool after 10000ms (pool connections: active=0 idle=0 limit=10)`，但同時 mysql2 直連、`docker exec mysql ...` 都正常。容器要 5–30 秒完整 ready，Prisma 7 mariadb adapter 在這段過渡期建不起連線。**Why:** 2026-05-17 早上 `pnpm dev` 後立刻試登入打到此狀況，幾秒後 retry 又好了。**How to apply:** 看到 pool timeout 先等 10 秒重試。要徹底解可在 `apps/api/src/main.ts` 加 `wait-on tcp:3306` 或 retry，但 dev 體驗影響不大不值得。

## Swagger

- **採分檔 + `$ref` 結構**：`openapi.yaml` 只放 components / servers / info 與 paths 索引；每個 endpoint 一個獨立 yaml。不要 inline 寫整包 spec。

- **新增 endpoint 後要重新 `npm run swagger:bundle`**：`main.ts` 讀的是 bundle 檔，忘了 bundle Swagger UI 不更新。bundle 同時也會驗證所有 `$ref`。

- **成功回應不要用 `$ref: SuccessResponse`，每個 endpoint 自己 inline 寫 `{success, data: <具體 shape>, timestamp}`**：SuccessResponse 的 `data` 是 generic `type: object, nullable: true`，前端 openapi-typescript 推導出來只會是 `Record<string, unknown> | null`，型別完全沒幫助。每個 endpoint 在 200/201 response 直接 inline 整個外殼 + data 具體 properties（參照 `profile/get-me.yaml`、`auth/login.yaml`）。**Why:** 2026-05-16 setup-monorepo-frontend 階段三補強 9 個 yaml 時確認此 convention。**How to apply:** 新增 endpoint yaml 時不要 `$ref` 到 SuccessResponse，直接 inline；如果該 endpoint 真的沒 data，inline 結構仍要寫 `data: { type: null }` 或對應的 message 型別。

## Seeds / Scripts

- **`seed-runner.ts` 必須擋 production**：`if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_PROD_SEED) process.exit(1)`，避免誤把測試資料 upsert 到生產庫。

## 前端 / React + zod + react-hook-form

- **zod v4.1+ 不要用 `zodResolver`，改用 `standardSchemaResolver`**：`@hookform/resolvers/zod` 的 v4 overload 是針對 zod 4.0 編譯的（內部檢查 `_zod.version.minor === 0`），任何 zod 4.1+ 都會型別錯誤 `Type '4' is not assignable to type '0'`。解法：`import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'`，zod v4 原生實作 Standard Schema spec，型別簽章不依賴 zod 內部版本欄位。**Why:** 2026-05-16 setup-monorepo-frontend 階段二踩到，先用 `as never` 繞過被否決，找出真正乾淨解。**How to apply:** 新表單一律用 `standardSchemaResolver(schema)`，不要用 `zodResolver`；好處是未來換 valibot/arktype 也是同一個 resolver。

- **shadcn nova preset 的 registry 沒有 `form`**：`pnpm dlx shadcn@latest add form` 會 silent fail（只印 "Checking registry"），其他元件如 input/label/card/sidebar 都正常。解法：自寫 `src/components/ui/form.tsx`，內容是標準 shadcn form pattern（Controller + Slot + FormItemContext + useFormField），需注意 radix-ui 是 mega-package，import 寫 `import { Slot } from 'radix-ui'`。

- **TypeScript 6 把 `baseUrl` 標為 deprecated**：tsconfig 只需要 `paths`，不用 baseUrl。`paths: { "@/*": ["./src/*"] }` 中的相對路徑會以 tsconfig.json 所在位置為基準。shadcn CLI 不依賴 tsconfig 的 baseUrl，看的是 `components.json` 的 aliases。

## Monorepo / pnpm

- **pnpm 11 預設不執行套件的 build scripts，需在 `pnpm-workspace.yaml` 的 `allowBuilds` 段明確核准**：Prisma、bcrypt、@nestjs/core、@firebase/util、protobufjs 等有 postinstall/install script 的套件首次 `pnpm install` 會被擋下並警告 `[ERR_PNPM_IGNORED_BUILDS]`。解法：把每個套件設成 `true`（信任）或 `false`（明確拒絕，如 telemetry-only 的 `@scarf/scarf`）。新加套件遇到此警告時更新 `allowBuilds` 即可。

- **Monorepo 下 Prisma client 落在 pnpm 虛擬 store**：執行 `pnpm db:generate` 後，client 會被生成在 `node_modules/.pnpm/@prisma+client@.../node_modules/@prisma/client`（不是傳統的 `node_modules/@prisma/client`）。`apps/api/package.json` 的 `postinstall` symlink 步驟仍有效，TypeScript 也能解析。重點：搬完 monorepo 後**必須先跑一次 `pnpm db:generate`** 再 typecheck，否則所有 Prisma model 型別找不到，會誤導以為 strict mode 的 catch-unknown 才是元兇。
