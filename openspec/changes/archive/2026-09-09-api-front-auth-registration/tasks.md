> 每一塊（`##` 標題）須能獨立通過驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`。
> 動到 controller / 路由，**必須加 `pnpm --filter @app/api test:e2e`**。
> 全部完成後給**一個** commit 指令，由使用者手動執行。
>
> **塊的依賴**：
> - 塊 1（共用 token 函式）先做，且它**動到 admin 的密碼重設路徑**——
>   既有測試必須全綠且**不修改斷言**。要改斷言就代表行為變了，那不是重構。
> - 塊 2（schema + env）先於其餘。
> - 塊 6（節流）在端點之後，否則沒有東西可掛。
>
> ⚠️ **`.env.example` 在 AI 工具權限之外**：四個新變數要由使用者補，
> `env-example-sync.spec.ts` 在那之前會紅（訊息會列出缺哪幾個）。

## 1. 抽出共用的一次性 token 機制（動到 admin 路徑）

- [x] 1.1 新增 `shared/utils/one-time-token.ts`：`generateToken()`（`randomBytes(32)` hex）與 `hashToken()`（sha256）
- [x] 1.2 `PrismaPasswordResetTokenRepository` 改用它，**行為逐字不變**
- [x] 1.3 **只抽純函式，不抽 Prisma 查詢**——兩邊操作不同 model，硬共用會生出帶 model 名稱參數的抽象，比重複更糟（design D2）
- [x] 1.4 既有 admin 密碼重設的測試全綠，**斷言一字未改**
- [x] 1.5 **反向驗證**：把 `hashToken` 改成回傳原文 → admin 的既有測試必須有東西變紅。還原

## 2. Schema 與環境變數

- [x] 2.1 `schema.prisma` 新增 `UserTokenRecord`（`user_tokens`）：id / userId / token(unique) / purpose(enum) / expiresAt / usedAt / createdAt
- [x] 2.2 `purpose` 用 **enum 而非自由字串**：打錯字的後果是「token 永遠 claim 不到」，看起來像 token 失效不像程式錯誤，排查方向會被帶偏
- [x] 2.3 索引：`userId`（作廢該使用者其他 token）、`expiresAt`（清理）
- [x] 2.4 手寫 migration（dev 庫不在本機，由 e2e 的 `migrate deploy` 驗證）
- [x] 2.5 `envSchema` 新增四個變數，放進**重組後的正確分區**：`APP_FRONT_URL` / `APP_FRONT_VERIFY_REDIRECT_PATH` 進「應用基本」；`EMAIL_VERIFICATION_EXPIRES_IN` / `FRONT_PASSWORD_RESET_EXPIRES_IN` 進「密碼與加密」
- [x] 2.6 `APP_FRONT_URL` 加進 `productionErrors`——沒有它驗證信的連結會指向 `undefined/...`，而那要等第一個使用者點信才會發現
- [x] 2.7 `db:generate`

## 3. Port 與 Repository

- [x] 3.1 `UserTokenPort`：`create(userId, purpose, expiresInMinutes)`、`claim(token, purpose)`、`invalidateAll(userId, purpose)`
- [x] 3.2 `PrismaUserTokenRepository`：claim 用 **extended `where` 一次 UPDATE**（token + 未使用 + 未過期 + **purpose**），P2025 視為失敗
- [x] 3.3 **claim 必須比對 purpose**——少了它，驗證信的 token 就能重設密碼（design D1）
- [x] 3.4 `LoadUserPort` / `SaveUserPort` 補所需方法（建立帳號、寫 `emailVerifiedAt`、更新密碼、遞增 `tokenVersion`）
- [x] 3.5 Repository 單元測試（mock Prisma），含「purpose 不符 → claim 失敗」

## 4. 信箱節流

- [x] 4.1 `EmailThrottlePort` + Redis 實作，key 用 `normalizeEmail` 後的 email（不正規化的話交替大小寫可繞過，與帳號鎖定曾被繞過同型）
- [x] 4.2 **Redis 不可用時 fail-open**（design D4）：與登入節流的 fail-closed 相反，理由是後果不對稱——寄信節流失效只是多寄幾封信，fail-closed 會讓註冊完全不可用
- [x] 4.3 單元測試：計數累積、大小寫歸一、Redis 失敗時放行

## 5. Service 與 Controller

- [x] 5.1 `FrontRegisterService`：email 已存在時**回相同回應、不建帳號、改寄通知信給既有擁有者**（design D5）
- [x] 5.2 寄信一律 **fire-and-forget**——SMTP timeout 會製造比狀態碼更明顯的列舉訊號
- [x] 5.3 `FrontVerifyEmailService`：claim → 寫 `emailVerifiedAt`
- [x] 5.4 `FrontResendVerificationService`：先 `invalidateAll(VERIFY_EMAIL)` 再發新的
- [x] 5.5 `FrontForgotPasswordService` / `FrontResetPasswordService`；後者成功後**遞增 `tokenVersion`** 並作廢其他重設 token（design D6）
- [x] 5.6 密碼一律過既有的密碼政策檢查（重用 `PasswordPolicy`）
- [x] 5.7 Controller：五支全 `@Public()`；**`verify-email` 回 302 導回前台**，失敗也導回（design D3）
- [x] 5.8 DTO 一律 `z.infer`
- [x] 5.9 各 service 單元測試（mock port），重點在「已存在的信箱不建帳號但回應相同」

## 6. 節流掛載與 Swagger

- [x] 6.1 三支寄信端點掛 `@Throttle`（沿用 admin forgot-password 的 3 次 / 分鐘）並接上信箱節流
- [x] 6.2 `docs/swagger/front/` 新增五支 yaml 並註冊；`verify-email` 標明回 302
- [x] 6.3 `swagger:bundle`

## 7. 驗證與收尾

- [x] 7.1 e2e：註冊（新／已存在兩條路徑回應相同）、驗證（成功／過期／無效三種導向）、重發、忘記／重設密碼、**用驗證 token 打重設密碼 → 400**、重設後既發 JWT 失效
- [x] 7.2 `pnpm typecheck && pnpm lint && pnpm test:cov`、`pnpm build`、`test:e2e`，貼出實際輸出
- [x] 7.3 `smoke-test.md`：五支端點的 curl，含帳號列舉的防護驗證（兩種 email 的回應須逐字相同）
- [ ] 7.4 ⏸ **待使用者執行**：`.env.example` 補四個變數、dev 庫 `db:migrate`
- [x] 7.5 更新 `tasks/todo.md`：C6e 兩支皆完成
- [x] 7.6 新踩到的坑寫進 `tasks/lessons.md`
