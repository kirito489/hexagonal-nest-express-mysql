# Lessons Learned

_Accumulated rules and validated decisions. Each entry records the rule, the mechanism, and how to apply it directly — no changelog/history narrative._

## Prisma / 資料庫

- **修改 schema 後必須執行 `npx prisma generate`**：否則 `@prisma/client` 的 TypeScript 會找不到新 model，甚至 `PrismaClient` 型別報 "has no exported member"。

- **Prisma v7 MariaDB adapter 用物件組態，不用 URL**：`new PrismaMariaDb({ host, port, user, password, database, timezone: 'Z' })`。URL 形式（`mysql://...?timezone=Z`）不被 v7 driver 穩定解析，且密碼含特殊字元會炸 URL parser。

- **DB 時間一律 UTC**：`timezone: 'Z'` 已在 `prisma.service.ts` 設定；JS `Date` 寫入/讀回都當作 UTC，跨時區部署不會位移。

- **MySQL 9 本機開發要設 `allowPublicKeyRetrieval: true`**：MySQL 9 預設 `caching_sha2_password`，非 TLS 連線冷快取下首次認證需向 server 取 RSA 公鑰；localhost dev 未啟用 TLS、不允許取回公鑰時會 `ER_CANNOT_RETRIEVE_RSA_KEY` 連不上。作法：`prisma.service.ts` 的 `PrismaMariaDb({ ... })` 加 `allowPublicKeyRetrieval: true`。生產走 TLS 時此選項無作用，安全上僅在無 TLS 的 MITM 情境有理論風險（dev/localhost 可接受）。

- **Prisma P2002 `unique constraint violation` 應在 Repository 層轉為 domain exception**：`findByEmail + create` 存在競態，Repository 的 `create` 外層 try/catch，`err.code === 'P2002'` 時 throw domain exception；Service 層不需感知 Prisma 錯誤。

- **軟刪除 model 的所有 read path 都要加 `deletedAt: null`**：Prisma `findUnique` 只接受 unique 欄位，要過濾軟刪需改用 `findFirst({ where: { id, deletedAt: null } })`。`count` 用於「是否還有相關紀錄」判斷時（如 DeleteRoleService 阻擋有成員的角色）也要排除軟刪，否則永遠刪不掉。例外是「恢復」場景才用 `loadIncludingDeleted` 顯式 opt-in。

- **PasswordResetToken 等「一次性 token」要原子 claim**：`validateToken + markUsed` 兩步驟之間有 bcrypt 雜湊（非阻塞 CPU 工作），併發請求可雙雙通過驗證。改用 Prisma extended where（`update({ where: { token, usedAt: null, expiresAt: { gt: now } } })` 在單一 UPDATE 同時檢查條件 + 標記使用），找不到 record Prisma 丟 P2025。

- **密碼重設 token DB 只存 sha256 雜湊**：`randomBytes(32)` 產生原文，DB 存 `createHash('sha256')`，claim 時把輸入 hash 後比對；原文僅回傳給呼叫端寄信。token 是高熵隨機值，單向 hash 即足以防 DB 外洩反推，不需 bcrypt。

## JWT / 認證

- **LoginService 生成 token 時必須帶 `type: 'access'`**：`JwtAuthGuard` 有 `payload.type !== 'access'` 安全檢查，缺少此欄位會拒絕所有請求。`JwtPayload.type` 設為必填 union `'access' | 'refresh'`。

- **`REFRESH_SECRET` 必填且與 `ACCESS_SECRET` 不同**：optional 化會 fallback 到 JwtModule default secret（= ACCESS_SECRET），導致雙 secret 失去意義（access 洩漏 = refresh 也洩漏）。validate-env 一律 `z.string().min(32)` required，不要 optional。

- **`@nestjs/jwt` 的 `sign`/`verify` 會 merge module 的 `signOptions`/`verifyOptions`**：`issuer`/`audience` 只要在 `jwt.module` 設一次（`signOptions` + `verifyOptions` 各放一份），各呼叫點即使帶 per-call options（如 refresh 簽發/驗證用的 `secret`、`expiresIn`）也會自動套用同一組 iss/aud，不必每處重複。env 用 `JWT_ISSUER` / `JWT_AUDIENCE`（皆有預設值）。注意：**改 iss/aud 屬破壞性變更**——既有已簽發的 token 驗證會失敗，部署後所有使用者需重新登入。

- **`/auth/forgot-password` 的時間差列舉是已知殘留風險**：email 不存在立刻 return（~10ms），email 存在要寫 DB + 寄 SMTP（~100ms-1s），攻擊者能用回應時間列舉註冊 email。已實作的緩解：`forgot-password` / `reset-password` 加 per-route 嚴格 `@Throttle({ limit: 3, ttl: 60s })`、回應改 `204` 不回 message、service log 不寫 email。要徹底消除得引入 queue（寫 + 寄都 fire-and-forget）或固定 delay，成本不划算，未來真有需求才做。

- **refresh_token 放 localStorage 必搭配 rotation**：access_token 放 localStorage 可接受，但 refresh_token 一起放等於 XSS 一次拿到長效憑證。`/auth/refresh` 採 **rotation**：每次 refresh 同時發新 access + 新 refresh，舊 refresh 立刻 `tokenBlacklist.addToBlacklist`；攻擊者偷到 refresh 但晚於使用者下次 refresh → 舊 token 已黑名單 → 401。前端 `apiClient` 的 `refreshAccessToken` 要同步更新 storage。未來強化路線：refresh token family / reuse detection（需新增 DB 表），或改 httpOnly cookie + CSRF token。

- **JwtAuthGuard 快取命中與 DB 查詢兩條路徑都要檢查 `member.status`**：停用帳號的舊 JWT 在自然過期前仍可通，兩條路徑都要 `if (!data.status) throw new AccountDisabledException()`。

- **可變更 member context 的操作都要清除快取**：`status` / `roleId` / 密碼變更後必須呼叫 `clearMemberContext(memberId)`，否則最長延遲 `PERMISSION_CACHE_TTL` 秒（預設 300s）才生效。

## NestJS / HTTP 層

- **Controller 只回傳原始值，不要自行 wrap**：`TransformInterceptor` 會把回傳值包成 `{ success, data, timestamp }`；Controller 若再包一層 `{ data }`（或 `{ message }`）會變成 `data.data`，測試與前端都要多挖一層。不需回傳內容的端點直接回 `void` + `@HttpCode(204)`。

- **APP_GUARD 的 providers 順序 = 執行順序**：`app.module.ts` 裡 `{ provide: APP_GUARD, useClass: X }` 的宣告順序即套用順序。ThrottlerGuard → IpBlacklistGuard → IpWhitelistGuard → SessionIdleGuard 是刻意設計，新增 Guard 時注意位置。

- **Express 5 下 literal 路由要避免被 `:id` 吃掉**：`@Patch('bulk-status')` 即使宣告在 `@Patch(':id')` 前，仍可能被 `:id` 先匹配。解法：用兩段式路徑（如 `bulk/status`），`:id` 只匹配單一 segment。

- **PATCH/PUT 預設回傳 200，要 204 需明確加 `@HttpCode(HttpStatus.NO_CONTENT)`**：只有 POST 預設 201，其他方法預設皆 200。

- **`request.ip` 在反向代理後不可信，要明確設定 `trust proxy`**：Express 預設不採信 `X-Forwarded-For`，部署在 LB / 反向代理後 `request.ip` 會變成 proxy 內網 IP，導致 IP 黑名單失效、白名單誤判、登入失敗封鎖失準。用 env `TRUST_PROXY` 控制（預設 `'loopback'` = 安全、不採信外部 XFF），部署時依拓樸改為信任跳數（如 `'1'`）或具體 CIDR；**切勿用 `true`**（會無條件採信偽造的 XFF）。封鎖類 Guard（IP 黑名單）取不到 IP 時應 fail-closed（拒絕）而非放行。

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

  寫 `declare module 'express-serve-static-core' { interface Request { ... } }` 會 **silent fail**（typecheck 過但 augmentation 不生效，`request.member` 仍報 `TS2339: Property 'member' does not exist on type 'Request'`）。作法：在 `apps/api/src/types/*-augment.d.ts` 用 global namespace 形式擴 Request，檔案結尾加 `export {}` 讓 TS 視為 module；tsconfig 的 `include: ["src/**/*"]` 會自動載入。

## Domain Exception / GlobalExceptionFilter

- **新增 domain exception 後，GlobalExceptionFilter 必須同步加 `instanceof` 分支**：否則 fallback 到 500。每個 domain exception 對應：(1) `src/domain/exception/` 檔案；(2) Filter 有 instanceof 判斷 + 正確 HttpStatus + `code`（SCREAMING_SNAKE_CASE）。Repository 層不要讓 Prisma 原生錯誤（P2025 等）冒泡到 service，轉成明確的 domain exception。

## 測試

- **寫 spec 前一定先 Read 受測檔的真實簽章，不要憑模式猜**：常見誤判——`execute({ id })` 其實是 `execute(id: string)`、repo 回 `{ list, meta }` 其實是 `{ data, total }`（轉換在 service）、建構子參數順序、元件 / helper 名稱。作法：每個 spec 動筆前先讀「受測 class/function 本體 + 它呼叫的 port interface + in-port Command 型別」三者；委派型 service 要確認回傳是原樣轉發還是有 map 轉換。

- **`jest.clearAllMocks()` 不清 mock implementation，throw 會洩漏到後續測試**：`mockImplementation(() => { throw ... })` 設的錯誤，`clearAllMocks` 只重置呼叫紀錄、不還原 implementation，後面的 test 會繼續 throw。作法：一次性行為用 `mockImplementationOnce` / `mockResolvedValueOnce`；或 `beforeEach` 用 `mockReset()`（會清 implementation）而非 `clearAllMocks()`。

- **`mockResolvedValueOnce` 佇列沒被消費完會洩漏到後續測試（莫名 500 / 狀態碼錯亂）**：`clearAllMocks()` 不清 once 佇列。SUT 改查詢方法（如 `isLocked` 從 `findUnique` 改 `findFirst`）後，原本餵給它的 `findUnique.mockResolvedValueOnce(...)` 變孤兒，殘留值被「下一個剛好呼叫 `findUnique` 的測試」吃掉、回傳缺欄位物件導致 mapper crash。作法：改 SUT 查詢方法時全文搜尋相關測試的 `mockResolvedValueOnce` / `mockReturnValueOnce`，確認每個 once 仍會被消費；改 `findFirst` 的就把 mock 也改 `findFirst`，別留孤兒。

- **coverage 門檻聚焦邏輯層，用 `coveragePathIgnorePatterns` 排除 wiring/DTO**：`*.module.ts`、`main.ts`、`*Controller.ts`、`*Request.ts`、`*Query.ts`、`port/`、`facade/`、`adapter/out/`、`validate-env.ts` 屬 wiring / 宣告 / 已由 e2e 涵蓋，納入只會稀釋數字、逼著為 DI 配線寫無意義測試。作法：後端 jest 設 `coveragePathIgnorePatterns` 排除上述再設 `coverageThreshold`（本專案 70/60/70/70）；前端 vitest 的 coverage `include` 只列可獨立單測的純函式 + 共用元件，排除需 Router / api-client context 的組合層（pages、與 /me 整合的 hooks）。

- **Guard 邏輯變更後，spec mock payload 必須同步更新**：mock `jwtService.verify` 回傳值若缺少 `type: 'access'`，測試直接失敗且錯誤訊息會誤導排查。

- **Zod v4 的 `z.string().uuid()` 嚴格 RFC 4122**：測試 UUID 不能用 `00000000-0000-0000-0000-000000000010`（版本/變體皆 0），要改成合法 v4 形式如 `00000000-0000-4000-8000-000000000001`。

- **e2e 跑完 Jest worker 卡住 → `forceExit: true`**：`pino-roll` file stream 在 `app.close()` 後仍持有 handle。在 `test/jest.e2e.config.js` 加 `forceExit: true`；各 spec 的 `afterAll(() => app.close())` 仍需保留。

- **新增 Port 方法會讓既有 mock spec 報 TypeScript 錯誤**：擴充 port interface 時要同步在所有相關 spec 的 mock 物件補上 `jest.fn()`，否則 compile fail。

## NestJS build

- **tsconfig 設 `preserveWatchOutput: true`，否則 `tsc --watch` 會吃掉終端 scrollback**：tsc 預設用 alternate screen buffer，watch 每次重建會整個替換畫面，先前輸出（如 `[web]` 的 Vite ready URL）消失且無法往上 scroll。作法：monorepo 內任何用 `tsc --watch` 的 workspace（含 `nest start --watch`）都設 `"preserveWatchOutput": true`。

- **`tsBuildInfoFile` 必須放在 dist 內**：`nest-cli.json` 的 `deleteOutDir: true` 每次 build 會刪整個 dist，但 `incremental` 的 `.tsbuildinfo` 預設在 root 不會被清，TS 以為「沒變動 = 不用 emit」→ build 完 dist 是空的、啟動 `dist/main` 失敗。作法：`apps/api/tsconfig.json` 設 `"tsBuildInfoFile": "./dist/.tsbuildinfo"`；遇到「改了 code 卻沒重編」先刪 `.tsbuildinfo` 重跑。

## Git hooks / Husky

- **Husky pre-commit 在 nvm 環境下找不到 pnpm，要主動 source `nvm.sh`**：nvm 安裝的 node / pnpm 只在互動 shell 載入 nvm 後才進 PATH，git commit 的子 shell 不一定繼承，hook 跑 `pnpm lint-staged` 會 `command not found`。作法：`.husky/pre-commit` 開頭加 `if ! command -v pnpm >/dev/null 2>&1; then [ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"; fi`（非 nvm 用戶這條 if 直接跳過）。

## Docker / 本機服務

- **Docker MySQL 容器剛啟動的前幾秒，Prisma adapter 連線池會 pool timeout**：容器要 5–30 秒才完整 ready，這段過渡期 Prisma 7 mariadb adapter 建不起連線（報 `pool timeout ... after 10000ms`），但 mysql2 直連、`docker exec` 都正常。作法：看到 pool timeout 先等 10 秒重試；要徹底解可加 `wait-on tcp:3306` 或 retry，但 dev 影響不大不值得。

## 外部服務 / Redis

- **所有外部服務呼叫都要設 timeout**：recaptcha 用 `fetch(..., { signal: AbortSignal.timeout(5000) })`；nodemailer `createTransport` 設 `connectionTimeout` / `greetingTimeout` / `socketTimeout`；AWS S3 用 `client.send(cmd, { abortSignal: AbortSignal.timeout(ms) })`；firebase-admin 不支援 AbortSignal，用 `Promise.race` 加逾時上限。沒 timeout 時單一外部服務變慢會耗盡連線池 / event loop、拖垮整個 API。

- **Redis client 設 `socket.connectTimeout` + `pingInterval`**：`isOpen` 只看連線旗標，偵測不到 half-open（socket 開著卻無回應）；half-open 時指令會 hang 到 client 自己 timeout。`pingInterval` 定期送 PING 偵測並觸發 reconnect。token 黑名單採 fail-closed（Redis 斷線拋 503，不放行已登出 token）。

## 前端 / TanStack Query infinite

- **`useInfiniteQuery` 不會走 `useApiQuery` 的 envelope unwrap，要手動呼叫 `unwrapEnvelope`**：`useApiQuery` / `useApiMutation` 內部會剝開 `{ success, data, timestamp }`；但自寫 `useInfiniteQuery` 的 `queryFn` 用 `apiClient.GET(...)` 不經過 unwrap，`lastPage.list` 會是 undefined（實際是 `{ success, data: { list, meta } }`）。作法：把 `unwrapEnvelope` 從 `@app/api-client` export，自寫 `queryFn` 在 return 前呼叫一次。

## API endpoint 設計

- **「分頁列表」與「按 id 取單筆」是同一 capability 的兩個 endpoint，不要借用其他模組同資料的 endpoint**：Combobox 編輯要顯示「不在第一頁的角色」名稱，`GET /api/roles/:id` 看似夠用但需 `BACKEND:ROLE:VIEW`，只有 `BACKEND:ACCOUNT:VIEW` 的會員管理者打不到。作法：同資料但「呼叫情境不同 = 權限模型不同」時，開薄的窄化 endpoint（如 `GET /api/members/role/options/:id`，沿用會員管理權限），不要借別模組。

## Zod / 後端 validation

- **`z.coerce.boolean()` 對字串 `'false'` 會 coerce 成 `true`，list query 不要用**：coerce 底層走 JS `Boolean()`，非空字串皆 truthy，`?status=false` 會被變成 `true`。作法：query 的 boolean filter 一律用 `z.enum(['true', 'false']).optional().transform((v) => v === undefined ? undefined : v === 'true')`，Swagger 配 `enum: [true, false]`，client 只送這兩個值。

## Hexagonal 架構慣性

- **不要讓 Facade 直接呼叫 Out Port、跳過 UseCase / Service 層**：少了 service 層，domain 規則（IP 正規化、unlock 前狀態檢查等）沒地方放，只能擠 facade 或 controller。作法：新模組從一開始就完整四層 `Controller → Facade → UseCase → Service → Port`；admin / management 類即使動作簡單，service 層佔位也保留（未來補 domain rule 零摩擦）。

- **`@Roles` / RolesGuard 受 feature flag 控制，要注意爆炸半徑**：`RolesGuard` 在 `adminRoleEnabled` 關閉時一律放行，會讓所有 `@Roles` 端點（如 SecurityController 的 IP 黑白名單、帳號解鎖）對任何已登入者開放。生產環境由 validate-env 強制 `adminRoleEnabled=true`（關閉即 `process.exit(1)`）守住；dev 關閉時 security 模組形同不設防，勿在共用環境關閉。

## 模組產生器 / gen:module

- **新後端模組用 `pnpm --filter @app/api gen:module <name>` 產骨架,不要手刻**：產生器 `apps/api/scripts/gen-module.ts`（單檔內嵌模板 map，token 用 `%name%`/`%Name%`/`%NAME%`/`%names%`/`%Names%`/`%NAMES%`/`%camelName%`）一次產出最小 CRUD 六角骨架（port in/out、5 service + spec、facade、controller + Zod DTO、Prisma repo、NotFound exception、module）並自動接線 `app.module` imports 與 `GlobalExceptionFilter` 的 `DOMAIN_EXCEPTION_MAP`（NotFound→404）。冪等 skip-if-exists（`--force` 覆寫），錨點找不到會警告降級不中斷。**邊界**：`Prisma<Name>Repository` 依賴 schema.prisma 的 `<Name>Record` model（欄位 id/name/status/createdAt/updatedAt/deletedAt），要先建 model + `db:generate` 才 typecheck 過（其餘 23 檔立即乾淨）；欄位僅佔位 `name`/`status`，產完依實際欄位調整 DTO/port/service/repo。前端 CRUD 頁不在產生範圍。

## OpenSpec workflow

- **propose 階段先核對 API contract，不要假設「list 有的欄位 update 也支援」**：例如 role 的 GET 回應有 `status`，但 `PATCH /api/roles/:id` 的 DTO / service 沒處理 `status`，誤判成「純前端 change」會在動工後才發現要連動改後端 + Swagger + api-client + spec + e2e。作法：寫 proposal / design 前先讀 `adapter/in/web/<module>/{Create,Update}*Request.ts` 與對應 service，把每個前端互動點對應到後端 endpoint 與 DTO 欄位；缺欄位的擴充列為 Modified / ADDED 並排在「前端開動前」phase。

- **archive commit body 必須列出新建 / 修改的 master spec，不要只有標題**：`openspec-archive-change` 只搬資料夾、合併 spec，commit message 看不到動了哪些 spec，未來 `git log` 難追「某 capability 何時定義 / reqs 變動」。作法：archive commit 用此樣板（短橫線縮排，禁用 `- +` / `- ~` 等自訂前綴）：

  ```
  chore: 封存 <change-name>

    - 移到 openspec/changes/archive/<YYYY-MM-DD>-*/
    - master specs：
      <spec-A> 新建（N reqs：簡述涵蓋範圍）
      <spec-B> 修（簡述變動）
  ```

  Reqs 數量用 `grep -c "^### Requirement:" openspec/specs/<spec>/spec.md` 取得。

- **archive 前先把 swagger / api-client / 前端同步完，archive commit 純粹搬檔 + 落 master spec**：swagger 修正、bundle 重打、api-client 重生屬 feat / refactor 的尾巴，混進 archive 會讓未來 cherry-pick / revert 歸檔時連帶動到 swagger、污染歷史。作法（按順序）：(1) `swagger:bundle`；(2) `api-client generate`；(3) `typecheck && lint && test`；(4) 全綠後 commit feat / refactor；(5) 再 `openspec-archive-change`。archive 後若 `git status` 還有 swagger / schema.ts 變動，是前面沒做乾淨。

## Swagger

- **採分檔 + `$ref` 結構**：`openapi.yaml` 只放 components / servers / info 與 paths 索引；每個 endpoint 一個獨立 yaml。不要 inline 寫整包 spec。

- **新增 endpoint 後要重新 `npm run swagger:bundle`**：`main.ts` 讀的是 bundle 檔，忘了 bundle Swagger UI 不更新。bundle 同時也會驗證所有 `$ref`。

- **成功回應不要用 `$ref: SuccessResponse`，每個 endpoint 自己 inline 寫 `{ success, data: <具體 shape>, timestamp }`**：`SuccessResponse.data` 是 generic `type: object, nullable: true`，openapi-typescript 推導出來只會是 `Record<string, unknown> | null`，型別失去意義。作法：endpoint 在 200/201 直接 inline 整個外殼 + data 具體 properties（參照 `profile/get-me.yaml`、`auth/login.yaml`）；真的沒 data 也要寫 `data: { type: null }` 或對應 message 型別。

## Seeds / Scripts

- **`seed-runner.ts` 必須擋 production**：`if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_PROD_SEED) process.exit(1)`，避免誤把測試資料 upsert 到生產庫。

## 前端 / React hooks

- **自訂 hook 回傳的函式若會進到呼叫端 useEffect deps，必須 `useCallback` 包起來，否則無限迴圈**：每 render 建新 function instance → 進 deps 後 effect 每 render 都跑 → effect 內呼叫會改父 state / URL 的 setter（如 `setSearchParams`）→ 父 re-render → 新 instance → 再跑 → Chrome 擋 `Throttling navigation to prevent the browser from hanging`。`useRef` 持有狀態用 `useCallback([])` 包是安全的（mount 建一次，閉包讀 `ref.current` 永遠最新）。作法：任何 `useXxx()` 回傳函式若可能進 deps 就一律 `useCallback`，jsdoc 標註當路標（react-compiler 不會抓這條）。

- **`useCallback` dep 不要放整個 hook 回傳的 object，要 destructure 出 method 再放**：`useCallback(..., [coreObject])` 中 `coreObject` 每 render 都是新 reference，等於沒包（無限迴圈）。作法：`const { setX: coreSetX } = core; useCallback(..., [coreSetX])` 把 method destructure 成 local const 再放 dep；`exhaustive-deps` 看到單一變數就接受。

## 前端 / React + zod + react-hook-form

- **zod v4.1+ 不要用 `zodResolver`，改用 `standardSchemaResolver`**：`@hookform/resolvers/zod` 的 v4 overload 針對 zod 4.0 編譯（檢查 `_zod.version.minor === 0`），zod 4.1+ 會報 `Type '4' is not assignable to type '0'`。作法：`import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'`（zod v4 原生實作 Standard Schema，型別不依賴 zod 內部版本欄位；未來換 valibot/arktype 也同一 resolver）。

- **react-hook-form 表單 schema 不要用 zod `.transform()`**：`standardSchemaResolver(schemaWithTransform)` 讓 input/output 型別分歧，但 `useForm<T>` 把 T 同時套在 defaultValues / control / handleSubmit 三邊，會報 `Type 'FieldValues' is missing the following properties...`。作法：表單 schema 只做 validate，normalize 放 submit handler（組 body 時呼叫 helper，helper export 給其他呼叫端共用）。真要在 schema 轉換得拆 `z.input<T>` / `z.output<T>` + `useForm<TInput, TContext, TOutput>`，成本不划算。

- **分組多選 checkbox（如 PermissionsField）用垂直 stack，不要把 module 名與 checkboxes 擺同一行**：label + 含 i18n 文字的 checkbox + 全選 button 同 row，寬度一變動就換行錯位 / 全選被推下去。作法：每個 module 一張 card，分兩層——header row（module 名 + 全選 button，`flex justify-between`）、checkbox 區（垂直 `flex flex-col gap-2`，每個獨佔一行）。

- **shadcn nova preset 的 registry 沒有 `form`**：`pnpm dlx shadcn@latest add form` 會 silent fail（只印 "Checking registry"），其他元件如 input/label/card/sidebar 都正常。解法：自寫 `src/components/ui/form.tsx`，內容是標準 shadcn form pattern（Controller + Slot + FormItemContext + useFormField），radix-ui 是 mega-package，import 寫 `import { Slot } from 'radix-ui'`。

- **TypeScript 6 把 `baseUrl` 標為 deprecated**：tsconfig 只需要 `paths`，不用 baseUrl。`paths: { "@/*": ["./src/*"] }` 中的相對路徑會以 tsconfig.json 所在位置為基準。shadcn CLI 不依賴 tsconfig 的 baseUrl，看的是 `components.json` 的 aliases。

## Monorepo / pnpm

- **pnpm 11 預設不執行套件的 build scripts，需在 `pnpm-workspace.yaml` 的 `allowBuilds` 段明確核准**：Prisma、bcrypt、@nestjs/core、@firebase/util、protobufjs 等有 postinstall/install script 的套件首次 `pnpm install` 會被擋下並警告 `[ERR_PNPM_IGNORED_BUILDS]`。解法：把每個套件設成 `true`（信任）或 `false`（明確拒絕，如 telemetry-only 的 `@scarf/scarf`）。新加套件遇到此警告時更新 `allowBuilds` 即可。

- **Monorepo 下 Prisma client 落在 pnpm 虛擬 store**：執行 `pnpm db:generate` 後 client 生成在 `node_modules/.pnpm/@prisma+client@.../node_modules/@prisma/client`（不是傳統的 `node_modules/@prisma/client`）。`apps/api/package.json` 的 `postinstall` symlink 仍有效，TypeScript 也能解析。重點：搬完 monorepo 後**必須先跑一次 `pnpm db:generate`** 再 typecheck，否則所有 Prisma model 型別找不到，會誤導以為是 strict mode 的問題。

## ESLint / 工具鏈

- **Monorepo 共用 ESLint 基底放 `packages/eslint-config`,基底「不含」任何 typescript-eslint 預設集**：api 走 `recommendedTypeChecked`、web 走 `recommended`,兩者都會註冊 `@typescript-eslint` 外掛;若共用基底也帶一組 tseslint 預設,和 workspace 自帶的那組併存會觸發 `ConfigError: Cannot redefine plugin "@typescript-eslint"`。作法:基底只放 `ignores` + `js.configs.recommended` + 家規(以 named export `houseRules` 交由各 workspace「在自己的 tseslint 預設之後」最後套用,否則 `no-explicit-any` 等會被 recommended 蓋回 error);tseslint 預設由各 workspace 自帶且僅一組。

- **api 的 `lint` 必須先 `db:generate`,否則 type-aware 規則對 Prisma 回傳大量假陽性**：client 未生成時 `this.prisma.x.count()` 回 `any`,`recommendedTypeChecked` 會誤報 `no-unsafe-call`(型別解析不到)與 `require-await`(回傳不被視為 Promise)。作法:`apps/api/package.json` 加 `"prelint": "pnpm db:generate"`(對齊既有的 `predev`/`prebuild`/`pretypecheck`)。注意 lint-staged 直接呼叫 `eslint --fix` 不走 pre 腳本,靠 dev 環境 client 已生成。

- **type-checked lint 對「ORM 邊界 / jest mock / seed 腳本」的 `no-unsafe-*` 是雜訊,分區關掉、核心層維持嚴格**：Prisma 查詢結果、mapper、jest mock 回傳天生 `any`,全開 `no-unsafe-*` 會爆數百個假訊號淹沒真發現(本專案 524→9)。作法:`eslint.config.mjs` 對 `src/adapter/out/persistence/**`、`seeds/**`+`scripts/**`、`**/*.spec.ts`(另加 `unbound-method`)關掉 no-unsafe-* 家族;application/domain/infrastructure 維持全嚴格,真發現(floating-promise 等)才浮得出來。

- **Prettier 全 repo 統一一份根 `.prettierrc`(`semi:true` + `singleQuote:true` + `trailingComma:all`)**：前後端同一套;前端原為 Vite 無分號,已 reformat 加回分號對齊(一次性 ~107 檔),後端 0 churn(根設定與 api 既有風格一致,`eslint-plugin-prettier` 走 walk-up 解析同一份根設定)。`format`/`format:check` 放**根**(`prettier --write/--check .`)並從 repo root 跑——因為 **`.prettierignore` 相對「執行目錄(CWD)」解析**(不像 `.prettierrc` 逐檔就近),放根 + 根執行才吃得到。根 ignore 必排除:手寫繁中文件(`**/*.md`,否則 openspec / README / CLAUDE 被 reflow)、工具生成檔(`packages/api-client/src/schema.ts`、swagger bundle)、`prisma/migrations`、build / lockfile。shadcn `components/ui` 也一併吃根設定(引號等),格式不另設特例(eslint 的 `components/ui` 特例只關 lint 規則、與格式無關)。formatOnSave 需 `.vscode/settings.json` 對 `[typescriptreact]`/`[javascriptreact]` 也設 prettier formatter(前端多為 .tsx)。

## 可觀測性 / Sentry & metrics

- **`instrument.ts`（Sentry init）必須自行呼叫 `dotenv.config()`**：ES module import 會 hoist 到所有語句前，即使 `main.ts` 第一行 import instrument、第二行才 `dotenv.config()`，instrument 內的 `Sentry.init` 仍早於 main 的 dotenv 執行而讀不到 env。作法：`instrument.ts` 固定「`dotenv.config({ quiet: true })` → `getEnv()` → `Sentry.init()`」；`main.ts` 第一行 import 它（main 的 dotenv 重複呼叫無害）。

- **可觀測性套件用 feature flag 包、預設關閉，兩種包法**：Sentry 由 `Sentry.init({ enabled: flag && !!DSN })` 控制，停用時 `captureException` 是 no-op，呼叫端可無條件呼叫；Prometheus 會掛 endpoint，要用 `...(flag ? [PrometheusModule.register()] : [])` 在 imports 條件 spread，關閉時完全不註冊 `/api/metrics`。作法：SDK 自帶 enabled 開關的走 init 旗標 + 呼叫端無條件呼叫；會掛 controller / endpoint 的走 imports 條件 spread。

## 單一埠部署 / ServeStaticModule

- **單一埠：由 api 服務前端 `dist`，用 `forRootAsync` + 執行期偵測，不要在 `@Module` 載入時判斷**：`ServeStaticModule.forRootAsync({ useFactory })` 在 `app.init()` 時才偵測 `index.html`（前端未 build / 純 API 部署時回 `[]` 等同不掛載，dev 走 Vite 不受影響）。`@Module` 的 imports 陣列在 import 時就 evaluate，那時 e2e fixture 還沒建。靜態根目錄預設相對 api 編譯輸出找 `apps/web/dist`，可用 env `WEB_STATIC_ROOT` 覆寫（見 `app.module.ts` 的 `resolveWebStaticRoot`）。

- **`exclude` pattern 要用 Express 5 / path-to-regexp v8 的 named wildcard `'/api/{*path}'`**：舊式 `/api*`、`/api/*` 都不對；`'/api/*path'` 會漏掉裸 `/api`。`'/api/{*path}'` 能涵蓋 `/api`、`/api/health`、`/api/docs`、`/api/metrics` 且不誤殺 `/`、`/assets/*`。漏設 exclude 會讓 API 的 404 回 `index.html`（HTML）而非 JSON，前端會壞。

- **e2e 測 serve-static 要把 `AbstractLoader` override 成 `ExpressLoader`**：`@nestjs/serve-static` 的 loader factory 依 `httpAdapter` 是否存在挑 loader；測試用 `Test...compile()` 在 `createNestApplication(ExpressAdapter)` 之前就實例化 loader → 拿到 **NoopLoader**（靜態檔全 404）。作法：測試 `.overrideProvider(AbstractLoader).useClass(ExpressLoader)`（`test-app.ts` 的 `forceServeStatic` 旗標）對齊生產；fixture 目錄由 `WEB_STATIC_ROOT`（setup-env 指向 `os.tmpdir()`）指定，spec 的 `beforeAll` 先寫 `index.html`。

## 排程 / @nestjs/schedule

- **`@Cron('expr')` decorator 的表達式在「模組載入時」就求值，讀不到 `.env`**：import 會 hoist 到檔案最上方，`AppModule`（含排程器）在 `main.ts` 的 `dotenv.config()` 之前就被 require，decorator 內 `process.env.X` 拿到 undefined；在 decorator 內呼叫 `getEnv()` 更會在 env 未載入時觸發驗證而 `process.exit(1)`。作法：改在 `onModuleInit()`（dotenv 已載入）用 `SchedulerRegistry.addCronJob(name, CronJob.from({ cronTime, onTick, timeZone }))` 動態註冊（範式見 `ExampleScheduler`）；env gate（`SCHEDULE_ENABLED`）預設關，測試環境保持關閉避免背景 cron 與開檔 handle。

- **`@nestjs/schedule` 沒有 re-export `CronJob`，要顯式安裝 `cron`**：動態註冊用的 `CronJob.from(...)` 來自 `cron` 套件，且版本要與 `@nestjs/schedule` 內部相依一致（本專案 `cron@4.4.0`）以免 `addCronJob` 型別不相容。
