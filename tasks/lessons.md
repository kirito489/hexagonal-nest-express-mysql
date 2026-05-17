# Lessons Learned

_Patterns, rules, and validated decisions accumulated over time. Updated after corrections or after confirming a non-obvious approach worked._

## Prisma / 資料庫

- **修改 schema 後必須執行 `npx prisma generate`**：否則 `@prisma/client` 的 TypeScript 會找不到新 model，甚至 `PrismaClient` 型別報 "has no exported member"。

- **Prisma v7 MariaDB adapter 用物件組態，不用 URL**：`new PrismaMariaDb({ host, port, user, password, database, timezone: 'Z' })`。URL 形式（`mysql://...?timezone=Z`）不被 v7 driver 穩定解析，且密碼含特殊字元會炸 URL parser。

- **DB 時間一律 UTC**：`timezone: 'Z'` 已在 `prisma.service.ts` 設定；JS `Date` 寫入/讀回都當作 UTC，跨時區部署不會位移。

- **Prisma P2002 `unique constraint violation` 應在 Repository 層轉為 domain exception**：`findByEmail + create` 存在競態，Repository 的 `create` 外層 try/catch，`err.code === 'P2002'` 時 throw domain exception；Service 層不需感知 Prisma 錯誤。

- **軟刪除 model 的所有 read path 都要加 `deletedAt: null`**：Prisma `findUnique` 只接受 unique 欄位，要過濾軟刪需改用 `findFirst({ where: { id, deletedAt: null } })`。`count` 用於「是否還有相關紀錄」判斷時（如 DeleteRoleService 阻擋有成員的角色）也要排除軟刪，否則永遠刪不掉。例外是「恢復」場景才用 `loadIncludingDeleted` 顯式 opt-in。

- **PasswordResetToken 等「一次性 token」要原子 claim**：`validateToken + markUsed` 兩步驟之間有 bcrypt 雜湊（非阻塞 CPU 工作），併發請求可雙雙通過驗證。改用 Prisma extended where（`update({ where: { token, usedAt: null, expiresAt: { gt: now } } })` 在單一 UPDATE 同時檢查條件 + 標記使用），找不到 record Prisma 丟 P2025。

## JWT / 認證

- **LoginService 生成 token 時必須帶 `type: 'access'`**：`JwtAuthGuard` 有 `payload.type !== 'access'` 安全檢查，缺少此欄位會拒絕所有請求。

- **`REFRESH_SECRET` 必填且與 `ACCESS_SECRET` 不同**：optional 化會 fallback 到 JwtModule default secret（= ACCESS_SECRET），導致雙 secret 失去意義（access 洩漏 = refresh 也洩漏）。validate-env 一律 `z.string().min(32)` required，不要 optional。

- **`/auth/forgot-password` 的時間差列舉是接受的風險**：email 不存在立刻 return（~10ms），email 存在要寫 DB + 寄 SMTP（~100ms-1s）；攻擊者用回應時間能列舉註冊 email。本專案決定**不修**——admin 工具威脅模型下 attacker 已經要會 fuzz email；要消除得引入 queue（寫 + 寄都 fire-and-forget）或加固定 delay（醜），代價不划算。緩解靠 rate limit（全域 ThrottlerGuard 已涵蓋）。未來真有需求才改 queue 方案。

- **refresh_token 放 localStorage 必搭配 rotation**：access_token 放 localStorage 可接受，但 refresh_token 一起放等於 XSS 一次拿到長效憑證。本專案 `/auth/refresh` 採 **rotation**：每次 refresh 同時發新 access + 新 refresh，舊 refresh 立刻 `tokenBlacklist.addToBlacklist`。攻擊者偷到 refresh 但晚於使用者下次 refresh → 舊 token 已黑名單 → 401。使用者也要更新 storage（前端 `apiClient` 的 `refreshAccessToken` 中處理）。未來強化路線：加 refresh token family / reuse detection（需新增 DB 表），或改 httpOnly cookie + CSRF token（需後端 cookie 處理 + 前端不再碰 refresh）。

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

- **tsconfig 要設 `preserveWatchOutput: true`，否則 `tsc --watch` 會吃掉終端 scrollback**：tsc 預設使用 alternate screen buffer（同 `vim` / `less` 那種），watch 模式每次重建會把畫面整個替換，先前的輸出（如 `[web]` 的 Vite ready URL）會消失且無法往上 scroll 找回。`apps/api/tsconfig.json` 設 `"preserveWatchOutput": true` 就會把每次編譯結果 append 進主畫面，不切換 alt screen。**Why:** 2026-05-17 確認 customLogger 修好 Vite 訊息後，使用者跑 `pnpm dev` 還是看不到 `[web]`，因為 `nest start --watch` 內的 tsc 把畫面切到 alt screen 把它擋掉了。**How to apply:** monorepo 內任何用 `tsc --watch` 的 workspace（包括 NestJS 的 nest start --watch）都加這條。

- **`tsBuildInfoFile` 必須放在 dist 內**：`apps/api/nest-cli.json` 設 `deleteOutDir: true`，每次 `nest build` / `nest start --watch` 會把 dist 整個刪掉；但 TS `incremental: true` 的 `.tsbuildinfo` 預設在 tsconfig 旁邊（root），刪 dist 不會清掉它，導致 TS 以為「沒變動 = 不用 emit」，build 完 dist 是空的，nest 啟動 dist/main 失敗。**Why:** 2026-05-16 setup-monorepo-frontend 階段 10 後第一次 `pnpm dev`，前端 Vite 起來但 `[api]` 報 `Cannot find module '.../dist/main'`，明明 `tsc` 印 `Found 0 errors`。**How to apply:** `apps/api/tsconfig.json` 設 `"tsBuildInfoFile": "./dist/.tsbuildinfo"`，cache 與 build 產物同生共死。如果遇到「明明改過 code 卻沒重編」，先刪 `.tsbuildinfo` 重跑即可。

## Git hooks / Husky

- **Husky pre-commit 在 nvm 環境下找不到 pnpm，要主動 source `nvm.sh`**：用 nvm 安裝的 node / pnpm 路徑只在 zsh 等互動 shell 載入 nvm 後才會進 PATH；git commit 的子 shell（某些 GUI / oh-my-zsh alias 組合）不會繼承這條，hook 跑 `pnpm lint-staged` 會 `command not found`。**Why:** 2026-05-17 starter pack 補上 husky 後第一次 commit 即踩。**How to apply:** `.husky/pre-commit` 開頭加 `if ! command -v pnpm >/dev/null 2>&1; then [ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"; fi`。對非 nvm 用戶（直接安裝 pnpm 或 corepack）這條 if 直接跳過，零成本。

## Docker / 本機服務

- **Docker MySQL 容器剛啟動的前幾秒，Prisma adapter 連線池會 pool timeout**：`docker compose up -d` / `docker start my-mysql` 立刻打 API 會看到 `DriverAdapterError: pool timeout: failed to retrieve a connection from pool after 10000ms (pool connections: active=0 idle=0 limit=10)`，但同時 mysql2 直連、`docker exec mysql ...` 都正常。容器要 5–30 秒完整 ready，Prisma 7 mariadb adapter 在這段過渡期建不起連線。**Why:** 2026-05-17 早上 `pnpm dev` 後立刻試登入打到此狀況，幾秒後 retry 又好了。**How to apply:** 看到 pool timeout 先等 10 秒重試。要徹底解可在 `apps/api/src/main.ts` 加 `wait-on tcp:3306` 或 retry，但 dev 體驗影響不大不值得。

## OpenSpec workflow

- **propose 階段要先核對 API contract，不要假設「list 有的欄位 update 也支援」**：role 的 GET 回應有 `status`，但 `PATCH /api/roles/:id` 的 update DTO 與 service 卻沒處理 `status`。提案寫成「純前端 change」，動工後才發現要連動改後端 + Swagger + api-client + unit spec + e2e。**Why:** 2026-05-18 add-role-management-page Phase 2 開動前才發現必須擴後端，artifacts 整份重改範圍。**How to apply:** 寫 proposal / design 前，先讀 `apps/api/src/adapter/in/web/<module>/{Create,Update}*Request.ts` 與對應 service，把每個前端要做的互動點對應到後端 endpoint 與 DTO 欄位；缺欄位的擴充行為要在 proposal 的 Capabilities 列為 Modified / ADDED，並在 tasks.md 放在「前端開動前」的 phase。

## Swagger

- **採分檔 + `$ref` 結構**：`openapi.yaml` 只放 components / servers / info 與 paths 索引；每個 endpoint 一個獨立 yaml。不要 inline 寫整包 spec。

- **新增 endpoint 後要重新 `npm run swagger:bundle`**：`main.ts` 讀的是 bundle 檔，忘了 bundle Swagger UI 不更新。bundle 同時也會驗證所有 `$ref`。

- **成功回應不要用 `$ref: SuccessResponse`，每個 endpoint 自己 inline 寫 `{success, data: <具體 shape>, timestamp}`**：SuccessResponse 的 `data` 是 generic `type: object, nullable: true`，前端 openapi-typescript 推導出來只會是 `Record<string, unknown> | null`，型別完全沒幫助。每個 endpoint 在 200/201 response 直接 inline 整個外殼 + data 具體 properties（參照 `profile/get-me.yaml`、`auth/login.yaml`）。**Why:** 2026-05-16 setup-monorepo-frontend 階段三補強 9 個 yaml 時確認此 convention。**How to apply:** 新增 endpoint yaml 時不要 `$ref` 到 SuccessResponse，直接 inline；如果該 endpoint 真的沒 data，inline 結構仍要寫 `data: { type: null }` 或對應的 message 型別。

## Seeds / Scripts

- **`seed-runner.ts` 必須擋 production**：`if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_PROD_SEED) process.exit(1)`，避免誤把測試資料 upsert 到生產庫。

## 前端 / React + zod + react-hook-form

- **zod v4.1+ 不要用 `zodResolver`，改用 `standardSchemaResolver`**：`@hookform/resolvers/zod` 的 v4 overload 是針對 zod 4.0 編譯的（內部檢查 `_zod.version.minor === 0`），任何 zod 4.1+ 都會型別錯誤 `Type '4' is not assignable to type '0'`。解法：`import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'`，zod v4 原生實作 Standard Schema spec，型別簽章不依賴 zod 內部版本欄位。**Why:** 2026-05-16 setup-monorepo-frontend 階段二踩到，先用 `as never` 繞過被否決，找出真正乾淨解。**How to apply:** 新表單一律用 `standardSchemaResolver(schema)`，不要用 `zodResolver`；好處是未來換 valibot/arktype 也是同一個 resolver。

- **react-hook-form 表單 schema 不要用 zod `.transform()`**：`standardSchemaResolver(schemaWithTransform)` 會讓 input/output 型別分歧（input 是 raw、output 是 transform 後），但 `useForm<T>` 同時把 T 套在 defaultValues、field control、handleSubmit values 三邊，型別會 narrow 不下來而報 `Type 'FieldValues' is missing the following properties...`。**Why:** 2026-05-18 add-role-management-page 把 EDIT→VIEW normalize 寫在 `roleFormSchema.permissionCodes.transform(...)` 內，typecheck 立即炸。**How to apply:** 表單 schema 只做 validate，**normalize 放 submit handler**（在 `mutateAsync({ body: ... })` 組 body 那一步呼叫 helper）；helper export 出來給其他呼叫端共用，達成 defense in depth 但不打亂表單型別。若一定要在 schema 做轉換，要拆 `z.input<T>` / `z.output<T>` 並用 `useForm<TInput, TContext, TOutput>` 三個泛型，成本不划算。

- **PermissionsField 等「分組多選 checkbox」用垂直 stack，不要把 module 名與 checkboxes 擺同一行**：module label + 兩個含 i18n 文字的 checkbox + 全選 button 想擺同 row，項目寬度一變動就會醜（換行錯位 / 全選被推到下面）。**Why:** 2026-05-18 add-role-management-page 第一版用 `grid-cols-[1fr_auto] flex-wrap` 把所有東西塞同列，遇到「後台-角色與權限管理-檢視 / 編輯」這種長字串就 wrap 跨兩行很難看。**How to apply:** 每個 module 一個 card，內部分兩層：(1) header row（module 名 + 全選 button，`flex justify-between`），(2) checkbox 區（垂直 `flex flex-col gap-2`，每個 checkbox 獨佔一行）。文字長度不再影響排版。

- **shadcn nova preset 的 registry 沒有 `form`**：`pnpm dlx shadcn@latest add form` 會 silent fail（只印 "Checking registry"），其他元件如 input/label/card/sidebar 都正常。解法：自寫 `src/components/ui/form.tsx`，內容是標準 shadcn form pattern（Controller + Slot + FormItemContext + useFormField），需注意 radix-ui 是 mega-package，import 寫 `import { Slot } from 'radix-ui'`。

- **TypeScript 6 把 `baseUrl` 標為 deprecated**：tsconfig 只需要 `paths`，不用 baseUrl。`paths: { "@/*": ["./src/*"] }` 中的相對路徑會以 tsconfig.json 所在位置為基準。shadcn CLI 不依賴 tsconfig 的 baseUrl，看的是 `components.json` 的 aliases。

## Monorepo / pnpm

- **pnpm 11 預設不執行套件的 build scripts，需在 `pnpm-workspace.yaml` 的 `allowBuilds` 段明確核准**：Prisma、bcrypt、@nestjs/core、@firebase/util、protobufjs 等有 postinstall/install script 的套件首次 `pnpm install` 會被擋下並警告 `[ERR_PNPM_IGNORED_BUILDS]`。解法：把每個套件設成 `true`（信任）或 `false`（明確拒絕，如 telemetry-only 的 `@scarf/scarf`）。新加套件遇到此警告時更新 `allowBuilds` 即可。

- **Monorepo 下 Prisma client 落在 pnpm 虛擬 store**：執行 `pnpm db:generate` 後，client 會被生成在 `node_modules/.pnpm/@prisma+client@.../node_modules/@prisma/client`（不是傳統的 `node_modules/@prisma/client`）。`apps/api/package.json` 的 `postinstall` symlink 步驟仍有效，TypeScript 也能解析。重點：搬完 monorepo 後**必須先跑一次 `pnpm db:generate`** 再 typecheck，否則所有 Prisma model 型別找不到，會誤導以為 strict mode 的 catch-unknown 才是元兇。
