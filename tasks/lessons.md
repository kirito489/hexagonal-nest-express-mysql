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

- **Express 5 的 Request augmentation 要用 `declare global { namespace Express }`，不要用 `declare module 'express-serve-static-core'`**：Express 5 的 `@types/express-serve-static-core` 把 `Request` 宣告在 `declare global { namespace Express { interface Request {} } }` 之內，不是 module export，所以擴自定欄位（如 `JwtAuthGuard` 掛上的 `member: MemberContext`）要走 global namespace augmentation：

  ```ts
  declare global {
    namespace Express {
      interface Request {
        member?: MemberContext;
      }
    }
  }
  export {};
  ```

  寫 `declare module 'express-serve-static-core' { interface Request { ... } }` 會 **silent fail**：typecheck 過、但 augmentation 完全不生效，呼叫端 `request.member` 仍報 `TS2339: Property 'member' does not exist on type 'Request'`。**Why:** 2026-05-28 整頓 TypeScript 風格、把 4 處 `as Request & { member: MemberContext }` 換成 augmentation，首版用 `declare module` typecheck 立刻爆炸。**How to apply:** 在 `apps/api/src/types/*-augment.d.ts` 用 global namespace 形式擴 Request；檔案結尾加 `export {}` 讓 TS 視為 module（避免污染全域，但允許 import MemberContext 型別）。tsconfig 的 `include: ["src/**/*"]` 會自動載入，不需另外 reference。

## Domain Exception / GlobalExceptionFilter

- **新增 domain exception 後，GlobalExceptionFilter 必須同步加 `instanceof` 分支**：否則 fallback 到 500。每個 domain exception 對應：(1) `src/domain/exception/` 檔案；(2) Filter 有 instanceof 判斷 + 正確 HttpStatus + `code`（SCREAMING_SNAKE_CASE）。

## 測試

- **寫 spec 前一定先 Read 受測檔的真實簽章，不要憑模式猜**：批次補測試時最容易踩——以為 `execute({ id })` 結果是 `execute(id: string)`；以為 repo 回 `{ list, meta }` 結果是 `{ data, total }`（轉換在 service）；以為建構子是 `(port, flags)` 結果是 `(flags, port)`；以為元件叫 `ConfirmDialog` 結果只有 `DeleteConfirmDialog`；以為 helper 是 `getClientIp` 結果根本不存在。**Why:** 2026-05-30 補 coverage 時連續多輪「猜簽章→測試紅→重寫」，浪費大量往返。**How to apply:** 每個 spec 動筆前先讀「受測 class/function 本體 + 它呼叫的 port interface + in-port Command 型別」三者；service 委派型的還要確認回傳是原樣轉發還是有 map 轉換。一次讀齊再寫，比寫完被 jest 打回快得多。

- **`jest.clearAllMocks()` 不清 mock implementation，throw 會洩漏到後續測試**：用 `mockImplementation(() => { throw ... })` 設一次性錯誤後，`clearAllMocks` 只重置呼叫紀錄、不還原 implementation，後面的 test 會繼續 throw。**Why:** 2026-05-30 ResetPasswordService spec「密碼策略不合」用 `mockImplementation` throw，污染了後兩個 test。**How to apply:** 一次性行為一律用 `mockImplementationOnce` / `mockResolvedValueOnce`；或在 `beforeEach` 用 `mockReset()`（會清 implementation）而非 `clearAllMocks()`。

- **coverage 門檻聚焦邏輯層，用 `coveragePathIgnorePatterns` 排除 wiring/DTO**：`*.module.ts`、`main.ts`、`*Controller.ts`、`*Request.ts`、`*Query.ts`、`port/`、`facade/`、`adapter/out/`、`validate-env.ts` 這些屬 wiring / 宣告 / 已由 e2e 涵蓋的層，納入 coverage 只會稀釋數字、逼著為 DI 配線寫無意義的測試。**Why:** 2026-05-30 建 coverage gate，全量計算時 service 補到 ~99% 但整體仍被一堆 0% 的 controller/adapter 拉到 40%。**How to apply:** 後端 `package.json` jest 設 `coveragePathIgnorePatterns` 排除上述，再設 `coverageThreshold`（本專案 70/60/70/70）。前端 vitest 的 coverage `include` 只列「可獨立單測的純函式 + 共用元件」，排除需 Router / api-client context 的組合層（pages、與 /me 整合的 hooks），門檻才有意義。

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

## 前端 / TanStack Query infinite

- **`useInfiniteQuery` 不會走 `useApiQuery` 的 envelope unwrap，要手動呼叫 `unwrapEnvelope`**：`useApiQuery` / `useApiMutation` 內部會把後端 `{ success, data, timestamp }` 外殼剝開，呼叫端 `.data` 直接拿到內層內容。但 `useInfiniteQuery` 用 `apiClient.GET(...)` 自寫 `queryFn` 時不會經過 hooks 內的 unwrap，呼叫端 `lastPage.list` 永遠是 undefined（因為實際長相是 `{ success, data: { list, meta } }`）。**Why:** 2026-05-18 paginate-member-role-options change Phase 9 完工後手動驗證 Combobox 顯示「找不到角色」即踩到此問題。**How to apply:** 在 `@app/api-client` 內把 `unwrapEnvelope` export 出來；自寫 `useInfiniteQuery` / `useQuery` 的 `queryFn` 都在 return 前呼叫一次，與 `useApiQuery` 行為一致。

## API endpoint 設計

- **分頁列表 + 「按 id 取單筆」是同一個 capability 的兩個 endpoint，不要借用其他模組同樣資料的 endpoint**：本專案 Combobox 編輯時要顯示「不在第一頁的角色」名稱，看起來 `GET /api/roles/:id` 就夠用，但那個 endpoint 需要 `BACKEND:ROLE:VIEW` 權限；只有 `BACKEND:ACCOUNT:VIEW` 的會員管理者打不到，UX 會破。**Why:** 2026-05-18 paginate-member-role-options change 設計階段曾考慮借用 `/api/roles/:id`，後拍板開窄化 endpoint `GET /api/members/role/options/:id`，回應只含 `{ id, name, isDefault }` 並沿用會員管理權限。**How to apply:** 同樣資料但「呼叫情境不同 = 權限模型不同」時，寧可開薄薄的窄化 endpoint，也不要借用別的模組。維護成本看起來增加，但避免「打得到 list 卻打不到單筆」的權限詭異感。

## Zod / 後端 validation

- **`z.coerce.boolean()` 對字串 `'false'` 會 coerce 成 `true`，list query 不要用**：zod 的 coerce 底層走 JS `Boolean()`，凡是非空字串都是 truthy，所以 `?status=false` 進來會被 schema 變成 `true`，跟使用者意圖相反。**Why:** 2026-05-18 add-status-filter-to-list-pages change 動工前發現此風險，提前避開。**How to apply:** query 接 boolean filter 一律用 `z.enum(['true', 'false']).optional().transform((v) => v === undefined ? undefined : v === 'true')`，並在 Swagger 將 `type: boolean` 配 `enum: [true, false]` 限制；client 也只送這兩個合法值。陷阱避得早一點，未來 e2e 才不會踩。

## Hexagonal 架構慣性

- **不要讓 Facade 直接呼叫 Out Port，跳過 UseCase / Service 層**：早期 security 模組為了快速落地寫成 `Controller → Facade → Port`（無 use case / service），結果 domain 規則（IP 正規化、unlock 前的狀態檢查）沒地方放，只能擠 facade 或 controller。其他模組（member / role）都是 `Controller → Facade → UseCase → Service → Port`，重構時得補回兩層。**Why:** 2026-05-18 refactor-security-module 階段 4 補上 7 個 use case + 7 個 service；service 內才有空間寫 `EmailNotFoundException` / `AccountNotLockedException` 兩個 domain 檢查。**How to apply:** 新模組從一開始就完整四層；admin/management 類即使動作再簡單，service 層佔位也保留（未來補 domain rule 時零摩擦）。

## OpenSpec workflow

- **propose 階段要先核對 API contract，不要假設「list 有的欄位 update 也支援」**：role 的 GET 回應有 `status`，但 `PATCH /api/roles/:id` 的 update DTO 與 service 卻沒處理 `status`。提案寫成「純前端 change」，動工後才發現要連動改後端 + Swagger + api-client + unit spec + e2e。**Why:** 2026-05-18 add-role-management-page Phase 2 開動前才發現必須擴後端，artifacts 整份重改範圍。**How to apply:** 寫 proposal / design 前，先讀 `apps/api/src/adapter/in/web/<module>/{Create,Update}*Request.ts` 與對應 service，把每個前端要做的互動點對應到後端 endpoint 與 DTO 欄位；缺欄位的擴充行為要在 proposal 的 Capabilities 列為 Modified / ADDED，並在 tasks.md 放在「前端開動前」的 phase。

- **archive commit 不要只有標題，body 必須列出新建 / 修改的 master spec**：`openspec-archive-change` 跑完只把 change 資料夾搬走、合併 spec，git diff 看得到但 commit message 看不到。連續 3 次 archive commit body 空白被 review 點到（`ef167399` / `fa3708a` / `64f80f3`），未來 `git log` 找「某 capability 何時定義 / reqs 變動」會卡住。**Why:** 2026-05-18 add-status-filter-to-list-pages archive 後 review 第三次點此問題，決定樣板化。**How to apply:** archive commit 一律用以下樣板（短橫線縮排）：

  ```
  chore: 封存 <change-name>

    - 移到 openspec/changes/archive/<YYYY-MM-DD>-*/
    - master specs：
      <spec-A> 新建（N reqs：簡述涵蓋範圍）
      <spec-B> 修（簡述變動）
  ```

  Reqs 數量可從 `grep -c "^### Requirement:" openspec/specs/<spec>/spec.md` 取得。
  禁止用自訂前綴（如 `- +` / `- ~`）— 統一樣板才有樣板價值。

- **archive 前先把 swagger / api-client / 前端通通同步完，archive commit 純粹是搬檔 + 落 master spec**：曾發生 archive commit 還夾帶 `swagger:bundle` 重打、`api-client generate` 重生、swagger 描述對齊等 — 這些屬於 feat / refactor 沒收尾的尾巴，應在那邊完成。混在 archive 會讓未來想 cherry-pick / revert 歸檔動作時連帶動到 swagger，污染歷史。**Why:** 2026-05-18 `9bdb354` 歸檔 add-security-ip-list-management 時夾帶 swagger 修正 + bundle 重打 + api-client 重生 被 review 點到。**How to apply:** archive 前 checklist（按順序）：(1) `pnpm --filter @app/api swagger:bundle`；(2) `pnpm --filter @app/api-client generate`；(3) `pnpm typecheck && pnpm lint && pnpm test`；(4) 全綠後 commit feat / refactor；(5) 再跑 `openspec-archive-change`。若 archive 跑完 `git status` 還看到 swagger 或 schema.ts 有變動，是步驟 1-3 沒做乾淨，要回去補。

## Swagger

- **採分檔 + `$ref` 結構**：`openapi.yaml` 只放 components / servers / info 與 paths 索引；每個 endpoint 一個獨立 yaml。不要 inline 寫整包 spec。

- **新增 endpoint 後要重新 `npm run swagger:bundle`**：`main.ts` 讀的是 bundle 檔，忘了 bundle Swagger UI 不更新。bundle 同時也會驗證所有 `$ref`。

- **成功回應不要用 `$ref: SuccessResponse`，每個 endpoint 自己 inline 寫 `{success, data: <具體 shape>, timestamp}`**：SuccessResponse 的 `data` 是 generic `type: object, nullable: true`，前端 openapi-typescript 推導出來只會是 `Record<string, unknown> | null`，型別完全沒幫助。每個 endpoint 在 200/201 response 直接 inline 整個外殼 + data 具體 properties（參照 `profile/get-me.yaml`、`auth/login.yaml`）。**Why:** 2026-05-16 setup-monorepo-frontend 階段三補強 9 個 yaml 時確認此 convention。**How to apply:** 新增 endpoint yaml 時不要 `$ref` 到 SuccessResponse，直接 inline；如果該 endpoint 真的沒 data，inline 結構仍要寫 `data: { type: null }` 或對應的 message 型別。

## Seeds / Scripts

- **`seed-runner.ts` 必須擋 production**：`if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_PROD_SEED) process.exit(1)`，避免誤把測試資料 upsert 到生產庫。

## 前端 / React hooks

- **自訂 hook 回傳的函式若會進到呼叫端 useEffect deps，必須 `useCallback` 包起來，否則陷無限迴圈**：每次 render 都建新 function instance → 進 deps 後 effect 每 render 都跑 → effect 內若呼叫會改父 state / URL 的 setter（如 `setSearchParams`）就觸發父層 re-render → 新 function instance → 又跑 → Chrome 直接擋 `Throttling navigation to prevent the browser from hanging`。`useRef` 持有的狀態用 `useCallback([], )` 包是安全的（mount 時建一次，閉包讀 `ref.current` 永遠是最新值）。**Why:** 2026-05-18 add-status-filter-to-list-pages review 全修把 SearchBar 的 `isFirstRun` ref 抽成 `useIsFirstRun` helper，回傳 `() => { ... }` 沒用 `useCallback`；SearchBar 把 `consumeFirstRun` 放進 deps 後 `/members` / `/roles` 一進場就被 throttling，URL 連改數十次。**How to apply:** 任何 `useXxx()` 回傳函式都檢查「呼叫端是否會放進 deps」；只要可能就一律 `useCallback`，jsdoc 寫明「必須 useCallback，否則無限迴圈」當路標。對 lint：react-compiler 不會幫你抓這條，要靠紀律 + e2e 進場時實際開頁面看 console 有無 throttling 警告。

- **`useCallback` dep 不要放整個 hook 回傳的 object，要 destructure 出 method 再放**：上一條的延伸。寫 wrapper hook 時很容易：`const { ... } = useFooHook()` → 為了讓 wrapper 的 setter 也 stable 寫 `useCallback(..., [coreObject])` — 但 `coreObject` 每次 render 都是新 reference，wrapper setter 每 render 失效，跟「沒包 useCallback」效果一樣（無限迴圈）。**Why:** 2026-05-18 抽 `useListUrlState` 後寫 4 個 wrapper hook（`use-members-url-state` / `use-roles-url-state` / `use-ip-{white,black}list-url-state`）都用 `[core]` 當 dep，一進 `/security/ip-whitelist` 立刻 throttling。**How to apply:** `const { setX: coreSetX } = core; const wrapper = useCallback(..., [coreSetX])` — 把 method destructure 成 local const 再放 dep。或乾脆別寫 wrapper、呼叫端直接 `core.setX(...)`。對 lint：`react-hooks/exhaustive-deps` 看到 `core.setX` 會要求整個 `core`；destructure 後它看到單一變數就會接受。

## 前端 / React + zod + react-hook-form

- **zod v4.1+ 不要用 `zodResolver`，改用 `standardSchemaResolver`**：`@hookform/resolvers/zod` 的 v4 overload 是針對 zod 4.0 編譯的（內部檢查 `_zod.version.minor === 0`），任何 zod 4.1+ 都會型別錯誤 `Type '4' is not assignable to type '0'`。解法：`import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'`，zod v4 原生實作 Standard Schema spec，型別簽章不依賴 zod 內部版本欄位。**Why:** 2026-05-16 setup-monorepo-frontend 階段二踩到，先用 `as never` 繞過被否決，找出真正乾淨解。**How to apply:** 新表單一律用 `standardSchemaResolver(schema)`，不要用 `zodResolver`；好處是未來換 valibot/arktype 也是同一個 resolver。

- **react-hook-form 表單 schema 不要用 zod `.transform()`**：`standardSchemaResolver(schemaWithTransform)` 會讓 input/output 型別分歧（input 是 raw、output 是 transform 後），但 `useForm<T>` 同時把 T 套在 defaultValues、field control、handleSubmit values 三邊，型別會 narrow 不下來而報 `Type 'FieldValues' is missing the following properties...`。**Why:** 2026-05-18 add-role-management-page 把 EDIT→VIEW normalize 寫在 `roleFormSchema.permissionCodes.transform(...)` 內，typecheck 立即炸。**How to apply:** 表單 schema 只做 validate，**normalize 放 submit handler**（在 `mutateAsync({ body: ... })` 組 body 那一步呼叫 helper）；helper export 出來給其他呼叫端共用，達成 defense in depth 但不打亂表單型別。若一定要在 schema 做轉換，要拆 `z.input<T>` / `z.output<T>` 並用 `useForm<TInput, TContext, TOutput>` 三個泛型，成本不划算。

- **PermissionsField 等「分組多選 checkbox」用垂直 stack，不要把 module 名與 checkboxes 擺同一行**：module label + 兩個含 i18n 文字的 checkbox + 全選 button 想擺同 row，項目寬度一變動就會醜（換行錯位 / 全選被推到下面）。**Why:** 2026-05-18 add-role-management-page 第一版用 `grid-cols-[1fr_auto] flex-wrap` 把所有東西塞同列，遇到「後台-角色與權限管理-檢視 / 編輯」這種長字串就 wrap 跨兩行很難看。**How to apply:** 每個 module 一個 card，內部分兩層：(1) header row（module 名 + 全選 button，`flex justify-between`），(2) checkbox 區（垂直 `flex flex-col gap-2`，每個 checkbox 獨佔一行）。文字長度不再影響排版。

- **shadcn nova preset 的 registry 沒有 `form`**：`pnpm dlx shadcn@latest add form` 會 silent fail（只印 "Checking registry"），其他元件如 input/label/card/sidebar 都正常。解法：自寫 `src/components/ui/form.tsx`，內容是標準 shadcn form pattern（Controller + Slot + FormItemContext + useFormField），需注意 radix-ui 是 mega-package，import 寫 `import { Slot } from 'radix-ui'`。

- **TypeScript 6 把 `baseUrl` 標為 deprecated**：tsconfig 只需要 `paths`，不用 baseUrl。`paths: { "@/*": ["./src/*"] }` 中的相對路徑會以 tsconfig.json 所在位置為基準。shadcn CLI 不依賴 tsconfig 的 baseUrl，看的是 `components.json` 的 aliases。

## Monorepo / pnpm

- **pnpm 11 預設不執行套件的 build scripts，需在 `pnpm-workspace.yaml` 的 `allowBuilds` 段明確核准**：Prisma、bcrypt、@nestjs/core、@firebase/util、protobufjs 等有 postinstall/install script 的套件首次 `pnpm install` 會被擋下並警告 `[ERR_PNPM_IGNORED_BUILDS]`。解法：把每個套件設成 `true`（信任）或 `false`（明確拒絕，如 telemetry-only 的 `@scarf/scarf`）。新加套件遇到此警告時更新 `allowBuilds` 即可。

- **Monorepo 下 Prisma client 落在 pnpm 虛擬 store**：執行 `pnpm db:generate` 後，client 會被生成在 `node_modules/.pnpm/@prisma+client@.../node_modules/@prisma/client`（不是傳統的 `node_modules/@prisma/client`）。`apps/api/package.json` 的 `postinstall` symlink 步驟仍有效，TypeScript 也能解析。重點：搬完 monorepo 後**必須先跑一次 `pnpm db:generate`** 再 typecheck，否則所有 Prisma model 型別找不到，會誤導以為 strict mode 的 catch-unknown 才是元兇。

## 可觀測性 / Sentry & metrics

- **`instrument.ts`（Sentry init）必須自行呼叫 `dotenv.config()`**：ES module 的 import 會提升（hoist）到所有語句之前，所以即使在 `main.ts` 把 `import './instrument'` 放第一行、`dotenv.config()` 放第二行，instrument 內的 `Sentry.init` 仍會早於 main 的 dotenv 執行而讀不到 env。解法：instrument 在自己檔案最上方先 `dotenv.config({ quiet: true })` 再 `Sentry.init`。**Why:** 2026-05-30 接入 Sentry（add 可觀測性）時，instrument 必須最早載入才能正確 instrument，但又依賴 env。**How to apply:** `instrument.ts` 結構固定為「dotenv.config() → getEnv() → Sentry.init()」；`main.ts` 第一行 import 它（main 的 dotenv.config 重複呼叫無害）。

- **可觀測性套件用 feature flag 包起來、預設關閉，兩種不同包法**：Sentry 由 `Sentry.init({ enabled: flag && !!DSN })` 控制——停用時 `Sentry.captureException` 是 no-op，所以呼叫端（如 GlobalExceptionFilter 的 fallback 500 分支）可無條件呼叫，不必自己判旗標。Prometheus 則用 `...(getEnv().APPLICATION_METRICS_ENABLED ? [PrometheusModule.register()] : [])` 在 AppModule imports 條件式掛載，關閉時完全不註冊 `/api/metrics`。**Why:** 2026-05-30 兩者皆要 flag 預設關閉、wiring 就緒。**How to apply:** 「SDK 自帶 enabled 開關」的（Sentry）走 init 旗標 + 呼叫端無條件呼叫；「會掛 controller / endpoint」的（Prometheus）走 imports 陣列條件 spread，避免關閉時還曝露端點。
