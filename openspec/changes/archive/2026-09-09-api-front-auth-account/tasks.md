> 每一塊（`##` 標題）須能獨立通過驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`。
> 動到 controller / 路由與全域守衛，**必須加 `pnpm --filter @app/api test:e2e`**。
> 全部完成後給**一個** commit 指令，由使用者手動執行。
>
> **塊的依賴**：
> - 塊 1（schema + env）先做，其餘全部依賴它。
> - 塊 2（JWT side）動到**登入路徑上的既有程式碼**：既有 admin auth 的測試
>   必須全綠且**不修改斷言**。要改斷言就代表行為變了，那不是本塊該做的事。
> - 塊 3（守衛與裝飾器）必須在塊 4（端點）之前——端點沒有守衛可掛。
> - 塊 6（守則）排最後：提前寫會是紅的，而那不是「抓到缺陷」只是順序錯了。
>
> ⚠️ **本機無法跑 migration 與 seed**：`hexagonal_express_db` 這個 dev 庫在
> 這台機器上不存在（C6d 已確認，`prisma migrate status` 回 `P1003`）。
> migration 檔會寫好並由 e2e 驗證（e2e 的 globalSetup 會 `migrate deploy` 到 `*_test` 庫），
> 但 **dev 庫的 migrate / seed 要使用者自己跑**。

## 1. Schema 與環境變數

- [x] 1.1 `schema.prisma` 新增 `UserRecord`（`users` 表）：id / email(unique) / password / displayName / emailVerifiedAt / status / tokenVersion / lastLoginAt / createdAt / updatedAt / deletedAt
- [x] 1.2 **不放 `avatarUrl`**：模板不做上傳流程，留一個沒有人寫入的欄位只會讓人以為有（design D1）
- [x] 1.3 用 `lastLoginAt` 而非藍本的 `lastSeenAt`——藍本的語意來自聊天的 presence，模板沒有 presence
- [x] 1.4 `prisma migrate dev --create-only` 產生 migration 檔（**不套用**，dev 庫不在本機）
- [x] 1.5 `envSchema` 新增 `FRONT_ACCESS_SECRET` / `FRONT_REFRESH_SECRET`（`min(32)`），並加進 `productionErrors`
- [ ] 1.6 ⏸ **`.env.example` 補四個鍵——待使用者執行**（`FRONT_ACCESS_SECRET`、`FRONT_REFRESH_SECRET`、`FRONT_DEFAULT_EMAIL`、`FRONT_DEFAULT_PASSWORD`）：該檔在 AI 工具的權限之外（讀寫皆拒）。`env-example-sync.spec.ts` 在補上之前會紅，那是預期的、訊息會直接列出缺哪幾個
- [x] 1.7 `pnpm --filter @app/api db:generate` 讓 PrismaService 認得新 model

## 2. JWT 的側別（動到登入路徑）

- [x] 2.1 `JwtPayload` 加 `side?: 'admin' | 'front'`
- [x] 2.2 admin 側解析用 `payload.side ?? 'admin'`——**加欄位時既發的 admin token 沒有它**，當成必填會讓所有人在部署當下被登出（design D4）
- [x] 2.3 該 fallback 加註解寫明它是過渡期的寬鬆，不是「side 是選填的」
- [x] 2.4 admin 簽發時帶 `side: 'admin'`
- [x] 2.5 既有 admin auth 的單元測試全綠，**斷言一字未改**
- [x] 2.6 **反向驗證**：把 admin 側的 `?? 'admin'` 拿掉 → 應有測試變紅（若無，補一條「沒有 side 的舊 token 仍有效」）

## 3. 前台的守衛與裝飾器

- [x] 3.1 `@FrontAuth()` 裝飾器（`SetMetadata`），放在 `adapter/in/web/decorator/`
- [x] 3.2 全域 `JwtAuthGuard` 看到該標記就 `return true`，把處理權交給下一道
- [x] 3.3 `FrontJwtAuthGuard`：以 `FRONT_ACCESS_SECRET` 驗簽、**嚴格要求 `side === 'front'`**、查 `users` 載入 `UserContext`
- [x] 3.4 `@CurrentUser()` 裝飾器取出 `UserContext`（與 admin 的 `@CurrentMember()` 對稱）
- [x] 3.5 **不做 UserContext 快取**（design D5）：一次主鍵查詢、沒有 join，加快取要配一整套失效機制
- [x] 3.6 守衛單元測試：無 token、admin token（簽章驗不過）、side 不符、帳號停用、tokenVersion 不符

## 4. Port / Service / Controller

- [x] 4.1 `LoadUserPort` / `SaveUserPort`（out 側，不分前後台）+ `PrismaUserRepository`
- [x] 4.2 `FrontLoginService`：驗密碼、擋停用、擋軟刪除、更新 `lastLoginAt`（失敗不阻斷）
- [x] 4.3 **帳號不存在與密碼錯誤回完全相同的 401**——否則端點變成帳號列舉工具
- [x] 4.4 `FrontRefreshTokenService`：驗 `type` / `side` / `tokenVersion`
- [x] 4.5 `FrontLogoutService`：遞增 `tokenVersion`
- [x] 4.6 `FrontMeService`：回 `emailVerified`（前台要據此提示去驗證信箱）
- [x] 4.7 DTO 一律 `z.infer`；`FrontAuthController` + `FrontMeController` + `FrontAuthFacade` + module
- [x] 4.8 各 service 單元測試（mock port）

## 5. Swagger 與 seed

- [x] 5.1 `docs/swagger/front/` 新增四支 yaml 並註冊進 front 的 `openapi.yaml`
- [x] 5.2 **不進 api-client**：那是從 admin 的 openapi 產的，給 `apps/web` 用（design D6）
- [x] 5.3 `swagger:bundle` 後確認 front doc 正常
- [x] 5.4 seed 一個測試前台帳號（密碼與 admin seed 同樣的處理方式）

## 6. 守則（排最後）

- [x] 6.1 `authorization-coverage.spec.ts` 的允許清單加入 `@FrontAuth(`
- [x] 6.2 合成輸入的自我測試補一條：只有 `@FrontAuth()` 的 handler 視為已表態
- [x] 6.3 **反向驗證**：把某個前台已認證 handler 的 `@FrontAuth()` 拿掉 → 守則紅；改成 `@Public()` → 守則綠但**那正是規則擋不到的形狀**，寫進 spec 的說明而非假裝擋得住
- [x] 6.4 `openspec/project/testing.md` 更新該支守則那一列

## 7. 驗證與收尾

- [x] 7.1 e2e：登入四種結果、refresh 三種、logout 後舊 token 失效、`/front/me`、**admin token 打前台回 401**、**前台 token 打 admin 回 401**
- [x] 7.2 `pnpm typecheck && pnpm lint && pnpm test:cov`、`pnpm build`，貼出實際輸出
- [x] 7.3 `smoke-test.md`：四支端點的 curl，含跨側 token 的 401
- [ ] 7.4 ⏸ **待使用者執行**：dev 庫的 `db:migrate` 與 `db:seed`（本機沒有該庫）
- [x] 7.5 更新 `tasks/todo.md`：C6e 拆成兩支，本支完成、註冊流程待做
- [x] 7.6 新踩到的坑寫進 `tasks/lessons.md`
