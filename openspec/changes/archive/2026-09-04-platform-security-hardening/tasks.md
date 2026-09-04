> 每一塊（`##` 標題）須能獨立通過驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`。
> 動到 `main.ts` 的中介層與掛載（塊 4、5）再加 `pnpm --filter @app/api test:e2e` 與 `pnpm build`；
> 動到 swagger 來源 yaml（塊 2）再加
> `pnpm --filter @app/api swagger:bundle && pnpm --filter @app/api-client generate`。
> 全部完成後給**一個** commit 指令，由使用者手動執行。
>
> **塊的依賴**：
> - **塊 1 是動 production code 前的安全網，不可跳過**——它釘住的正是塊 3 要改寫的鎖定行為。
> - 塊 2（env 與純函式，全是加法）與塊 1 獨立，可先做。塊 3 用到它的 `normalizeEmail` 與時效設定，塊 5 用到它的 `resolveSwaggerEnabled`。
> - 塊 3（鎖定時效）內部是鏈式的：Port 介面改了，Adapter 與兩支 Service 必須同一塊改完，否則留下編譯不過的中間狀態。
> - 塊 4（CSP）必須先於塊 5（Swagger 掛載）——`SWAGGER_SIDES` 這張表由塊 4 建立，塊 5 拿它取代 `main.ts` 裡兩次寫死的 `mountSwagger` 呼叫。
> - 塊 6（e2e）需要塊 3、4、5 都完成。

## 1. Characterization test：釘住現行鎖定行為

- [x] 1.1 `LoginService.spec.ts` 加 `characterization：鎖定行為` 四條（已鎖 × 密碼正確 / 密碼錯誤 → 拒絕；未鎖 × 密碼正確 → 放行；功能關閉 → 放行）。
      關鍵是新增的 `givenLockState()` helper：**同時餵新舊兩支 port 方法**（布林的 `isLocked` 與三態的 `checkLock`），讓斷言只依賴行為。塊 3 換掉 port 時這四條一個字都不用改
- [x] 1.2 ~~為 `UnlockAccountService` 補測試~~ —— **改在 adapter 層**：清 `lockedAt` 與 `failedLoginCount` 是 `PrismaAccountLockAdapter` 的職責，service 只呼叫 `unlockAccount()`（既有測試已涵蓋）。
      新建 `PrismaAccountLockAdapter.spec.ts` 7 條——**這是模板第一支 out adapter 的 spec**，先前這一層完全沒有測試，而 C2 的兩個缺陷都住在這裡
- [x] 1.3 **反向驗證**（兩處，各自確認紅的是預期那條）：
      (a) `LoginService` 的鎖定檢查改成 `if (false)` → 兩條 characterization 紅、兩條「放行」仍綠；還原後 12 條全綠
      (b) `unlockAccount` 的 `data` 拿掉 `lockedAt: null` → 只有對應那條紅，`resetFailedLogin` 那條仍綠；還原後 7 條全綠
      —— ⚠️ (b) **第一次的破壞根本沒植入**：perl 的多行正規式沒匹配到，檔案原封不動，而測試自然全綠。是「植入後先 `grep` 確認」這一步抓到的；若照全綠的結果收工，等於用一次沒發生的破壞證明了測試有效。改用行號 `sed` 並以 `git diff --stat` 確認改動存在後才重跑

## 2. 環境變數與純函式（全是加法）

- [x] 2.1 `validate-env.ts` 新增 `APPLICATION_ACCOUNT_LOCK_DURATION_MIN`（`z.coerce.number().int().min(1)`，預設 15），附繁中註解說明「為何一定要有時效」
- [x] 2.2 `validate-env.ts` 新增 `SWAGGER_ENABLED`（`z.enum(['true','false']).optional()`），並加純函式 `resolveSwaggerEnabled(nodeEnv, explicit)` 與讀取全域設定的 `isSwaggerEnabled()`。**判定必須在純函式裡**——測試 mock `getEnv` 時，模組內部的呼叫仍指向真正的實作，純函式沒有這個問題
- [x] 2.3 `resolveSwaggerEnabled` 補單元測試，四種組合各一條（未設定 × production / 非 production、明確 true / false）
- [x] 2.4 `REFRESH_TOKEN_EXPIRES_IN` 預設由 `604800` 改為 `86400`，註解寫明它與儲存位置的綁定關係
- [x] 2.5 新增 `shared/utils/normalize-email.ts`（trim + toLowerCase）與其單元測試。註解要寫明**為何不做 Gmail 的 dot / plus 正規化**——那是 Gmail 的規則不是信箱的規則
- [x] 2.6 更新 swagger 來源 yaml 的 `refreshTokenExpiresIn` 範例值：`admin/auth/login.yaml` 與 `admin/auth/refresh.yaml` 兩處 `604800` → `86400`
- [x] 2.7 跑 `swagger:bundle` + `api-client generate`，確認 `openapi.bundle.yaml` 與 `packages/api-client/src/schema.ts` 一併更新；再跑 `swagger:check` 確認無殘留漂移
- [x] 2.8 `env-schema.spec.ts` 應自動涵蓋兩個新變數（它檢查宣告完整性）；確認守則全綠

## 3. 帳號鎖定時效與三態狀態

- [x] 3.1 `AccountLockPort`：新增 `AccountLockStatus = 'NONE' | 'LOCKED' | 'EXPIRED'`，`isLocked(): Promise<boolean>` 改為 `checkLock(): Promise<AccountLockStatus>`。TSDoc 寫明**為何不用布林**（分不出「從未鎖定」與「鎖過但已到期」，而只有後者要清計數）與**本方法不得有副作用**
- [x] 3.2 `PrismaAccountLockAdapter`：實作 `checkLock`，以 `lockedAt` + `APPLICATION_ACCOUNT_LOCK_DURATION_MIN` 即時判定，**不加欄位**
- [x] 3.3 `PrismaAccountLockAdapter`：五支方法入口全部套 `normalizeEmail`——`recordFailedLogin` / `resetFailedLogin` / `checkLock` / `lockAccount` / `unlockAccount`。漏任何一支都會讓 Redis 鍵與 DB 查詢的大小寫行為再度分歧
- [x] 3.4 `LoginService`：改用 `checkLock()`，`LOCKED` 擋下（**改拋 `AccountLockedException` → 423**，見 6b）、`EXPIRED` 呼叫 `resetFailedLogin()` 後**繼續往下走**（不擋）。用 switch 讓漏處理某個狀態在編譯期就失敗
- [x] 3.5 `UnlockAccountService`：**它也在呼叫 `isLocked()`**（撰寫 tasks 時漏看，讀既有測試才發現），必須同一塊改。判定改為 `status === 'NONE'` 才拋 `AccountNotLockedException`；`LOCKED` 與 `EXPIRED` **都要解鎖**——已逾時但 `lockedAt` 仍有值的帳號要能被清掉殘留計數（spec 有對應 scenario）
- [x] 3.6 補單元測試：`checkLock` 五條（NONE × 2、LOCKED、EXPIRED、剛好滿時效）、email 正規化五條（Redis 鍵 + 四支 DB 查詢）、`LoginService` 的 EXPIRED 兩條、`UnlockAccountService` 的 EXPIRED 一條
- [x] 3.7 塊 1 的四條 characterization 全綠，一個字都沒改——`givenLockState()` helper 吸收了 `isLocked` → `checkLock` 的差異，證明「斷言寫在行為上」這個做法有效
- [x] 3.8 **反向驗證**（三項，每次確認紅的是預期那條）：
      (a) `EXPIRED` 分支不呼叫 `resetFailedLogin` → 對應那條紅、其餘 13 條綠
      (b) `recordFailedLogin` 拿掉 `normalizeEmail` → 只有「不同大小寫寫進同一把 Redis 鍵」紅，四支 DB 查詢那組仍綠（證明兩組各自獨立）
      (c) 時效判定改成永遠回 `LOCKED` → `鎖定已超過時效` 與 `剛好滿時效` 兩條紅，`LOCKED` 那條仍綠
      還原後 35 條全綠、`git status` 只剩本 change 的預期改動
- [x] 3.8b ⚠️ **(a) 第一次抓出的是測試的問題，不是程式的問題**：原本把「到期要清計數」的斷言寫在
      **密碼正確**的情境，而登入成功路徑本來就會呼叫 `resetFailedLogin`（`LoginService` 第 165 行）——
      斷言被成功路徑餵飽，把 `EXPIRED` 分支的清除整段拿掉照樣綠。
      改寫成在**密碼錯誤**的情境斷言後才真的會紅：那條路徑走不到成功時的清除，
      `resetFailedLogin` 只可能來自 `EXPIRED` 分支。
      教訓與 `lessons.md` 的「問這個斷言在功能被拿掉之後還會綠嗎」同型，
      但這次的形狀是**同一支方法有兩個呼叫點，斷言分不出是哪一個**

## 4. 安全標頭與 CSP 範圍

- [x] 4.1 新增 `infrastructure/security-headers.ts`：匯出 `SWAGGER_SIDES`（兩側的 `basePath` 與 bundle 路徑）、`isDocsPath()`、`applySecurityHeaders(app)`
- [x] 4.2 `applySecurityHeaders` 用**單一 middleware 內的分支**選擇兩份 helmet 之一。TSDoc 寫明為何不用 `app.use(path, helmet(...))` 疊加（那只是「前綴符合才跑」，全域那份仍會把 CSP 加回去）
- [x] 4.3 `isDocsPath` 用「完全相等或以 `<base>/` 開頭」，**不是 `startsWith(base)`**——後者會把 `/docs-json` 一起放寬
- [x] 4.4 `main.ts` 移除 `app.use(helmet({ contentSecurityPolicy: false }))`，改呼叫 `applySecurityHeaders(app)`
- [x] 4.5 `test/setup/test-app.ts` 的 `createE2EApp` 也呼叫 `applySecurityHeaders(app)`——不共用的話 e2e 驗的是一個沒有安全標頭的 app，任何 header 斷言都是空的
- [x] 4.6 補 `isDocsPath` 的單元測試：`/api/admin/docs`、`/api/admin/docs/swagger-ui.css`、`/api/front/docs` 為真；`/api/admin/docs-json`、`/api/admin/members`、`/api/admin/docsomething` 為假

## 5. Swagger 掛載條件

- [x] 5.1 `main.ts` 的兩次 `mountSwagger` 改為迴圈跑 `SWAGGER_SIDES`，消除寫死的路徑
- [x] 5.2 掛載整段包在 `isSwaggerEnabled()` 之內，`/docs` 與 `/docs-json` **兩者一起**受控。註解寫明「只關 UI 是最容易犯的錯」
- [x] 5.3 確認關閉不影響開發流程：`swagger:check` 與 api-client codegen 走本機檔案而非 HTTP 端點——實際跑一次兩者驗證

## 6. E2E

新建 `test/e2e/security-hardening.e2e-spec.ts`（9 條）。完整 e2e 由 151 條增至 **160 條，11 suites 全綠**。

- [x] 6.1 安全標頭三條：一般路徑**有** `content-security-policy`、`/api/admin/docs-json` 也有、`/api/admin/docs` **沒有**；另加一條驗其餘標頭（`x-content-type-options` / `x-frame-options`）
- [x] 6.2 連續失敗達閾值 → **423**；`lockedAt` 推到時效之前 → 正確密碼回 200
- [x] 6.3 鎖定逾時後打錯密碼回 401 而非 423
- [x] 6.4 大小寫交替達閾值仍會鎖定；另加一條直接斷言「失敗計數只落在一把 Redis 鍵上」
- [x] 6.5 ~~解鎖端點對大小寫不同的 email 有效~~ —— **不在本檔補**：解鎖端點需要 SUPERADMIN 的完整登入流程，而 `security.e2e-spec.ts` 已有那套 fixture。正規化本身已由 adapter 單元測試（四支 DB 查詢各一條）涵蓋，在 e2e 再驗一次是重複覆蓋而非新增保障
- [x] 6.6 **反向驗證**：拿掉 `createE2EApp` 的 `applySecurityHeaders` → 三條 CSP 相關的紅、五條鎖定的仍綠；還原後 9 條全綠
      —— ⚠️ **`/docs → 沒有 CSP` 那條在破壞前後都是綠的**。它斷言的是「標頭不存在」，分不出「正確豁免」與「整組安全標頭根本沒掛」。單獨看它是無效的，只有搭配「一般路徑有 CSP」才成立。**斷言某物不存在的測試，必須有一條斷言它存在的測試作對照**

### 6b. 本塊發現的三個既有缺陷（實作途中插入）

e2e 第一次跑時 `ACCOUNT_LOCKED` 斷言拿到 `FORBIDDEN`，追下去發現三個疊在同一個 throw 點上的既有問題，且都在本 change 正在改的路徑上：

- [x] 6b.1 **契約不符**：master spec 的 `api-auth` 寫「`423`、`code: "ACCOUNT_LOCKED"`」，實作拋的是通用 `ForbiddenException`，而 NestJS 的 `HttpException` 由 class 名推導錯誤碼 → 實際回 `403` / `FORBIDDEN`。**spec 與實作分歧了多久無從得知，因為沒有任何測試涵蓋這條路徑**
- [x] 6b.2 **死碼**：`domain/exception/AccountLockedException.ts` 存在且正確（`ResponseCodes.ACCOUNT_LOCKED` + `LOCKED` kind → 423），但**零呼叫端**
- [x] 6b.3 **Hard Rule 違規**：`LoginService` 在例外裡內嵌使用者文案。`no-inline-message.spec.ts` 只掃 `domain/exception/`，掃不到 service
- [x] 6b.4 修法：`LoginService` 改拋 `AccountLockedException`，`response-messages.ts` 的 `ACCOUNT_LOCKED` 訊息更新為反映時效（「請稍後再試或聯繫管理員解鎖」）。單元測試與 e2e 的期望同步改為 423
- [ ] 6b.5 **範圍外、留給後續**：`IpBlacklistGuard` / `IpWhitelistGuard` / `PermissionsGuard` / `RolesGuard` 共 5 處同樣內嵌文案。屬 guard 層的既有模式，不在本 change 路徑上，另開 change 處理

## 7. 文件

- [x] 7.1 `openspec/project/backend-runtime.md`：補鎖定時效的說明（含「為何一定要有時效」與「到期必須清計數」）、`SWAGGER_ENABLED` 的推導規則
- [x] 7.2 `openspec/project/frontend.md`：更新「localStorage token × 無 CSP」那節——CSP 已不再全域關閉、refresh 效期已縮短，剩下的只有 `httpOnly` cookie 那一項
- [x] 7.3 ~~`CLAUDE.md` 若有提到 CSP 全域關閉或 swagger 無條件掛載~~ —— **不需要**：`CLAUDE.md` 與 `README.md` 皆未描述這兩件事（grep `CSP` / `contentSecurityPolicy` / `604800` 零命中）

## 8. 收尾

- [x] 8.1 完整驗證鏈實際輸出：

      ```
      typecheck   api / web / api-client 皆 Done
      lint        api / web 皆 Done
      test:cov    api  單元 52 suites / 330 tests；守則 19 suites / 69 tests
                       All files 86.81 | 64.68 | 78.18 | 86.53（門檻 70/60/70/70）
                  web  94 | 96.15 | 87.5 | 92.85（門檻 75/75/60/75）
      test:e2e    11 suites / 160 tests（本 change 前為 151）
      build       api nest build 通過；web ✓ built
      ```
- [x] 8.2 `swagger:check` 通過 —— bundle 與 api-client 產物皆為最新
- [x] 8.3 `tasks/todo.md`：勾掉 C2 並記下三個順手修掉的既有缺陷；C6a 的前置條件已滿足，改寫該條並補上兩個實作提醒（列表的到期判定要與 `checkLock()` 同源、旗標預設關閉時畫面要能分辨「沒有」與「不會有」）
- [x] 8.4 三條新教訓寫進 `tasks/lessons.md`：同一支方法有兩個呼叫點時斷言分不出來源、斷言「不存在」的測試需要正面對照、`@Module` 在 import 時求值讓 spec 本體設的 env 一律太晚
- [x] 8.5 環境變數範例檔（**封存後補做**：使用者另備了無點號的 `apps/api/env.example` 讓 AI 可讀寫，內容與 `.env.example` 相同）：
      - 加 `APPLICATION_ACCOUNT_LOCK_DURATION_MIN=15`、`SWAGGER_ENABLED=`（留空 = 依 `NODE_ENV` 推導），`REFRESH_TOKEN_EXPIRES_IN` 改 86400 並寫明與儲存位置的綁定
      - 順帶補上四個**長期缺漏**的既有變數：`LOG_PURGE_ENABLED` / `LOG_RETENTION_DAYS` / `LOG_PURGE_CRON` / `THROTTLE_FAIL_OPEN`。比對後 envSchema 95 個 ↔ 範例檔 95 個，完全一致
      - `ALLOW_PROD_SEED` **早就已經在檔案裡**——`todo.md` 那條「需人工處理」的待辦是過期的，一併清掉

- [x] 8.6 ⚠️ **封存後才發現的 C2 自身缺陷**：把範例檔實際餵進 `envSchema` 跑一次時炸了——
      `SWAGGER_ENABLED=`（留空）被 dotenv 解析成 `''` 而非 `undefined`，
      而 `z.enum([...]).optional()` 判定「有值但不合法」，**任何照抄範例檔的部署都會啟動失敗**。
      開發機無感，因為本機 `.env` 根本沒有那一行——問題只在「照著範例檔設定」這條新部署必走的路上出現。
      修法照既有的 `SESSION_SECRET` 寫法：`.or(z.literal('')).transform(v => v === '' ? undefined : v)`，
      並補 5 條測試釘住空字串、未設定、明確值與非法值四種情況。
      **根因是驗證方式**：先前只驗「跑得起來」與「單元測試綠」，沒有任何一步把範例檔真的餵進 schema。
      對應的守則提案已寫進 `tasks/todo.md`，建議併進 C3

- [ ] 8.7 **仍需使用者手動執行**：
      - 把 `apps/api/env.example` 覆蓋回 `apps/api/.env.example`（AI 無法存取後者）
      - 實機開啟後台 SPA 與兩份 Swagger UI，看瀏覽器 console 有無 CSP 違規——這是 e2e 驗不到的部分
