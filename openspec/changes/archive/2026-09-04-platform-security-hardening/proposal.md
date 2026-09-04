## Why

盤點衍生專案 `nexus-nest-backend` 時，發現模板有四個**現存的安全缺陷**——它們不是「少了某個功能」，而是既有機制在特定情況下失效或無法復原。其中兩個在盤點過程中才被完整確認：

**帳號鎖定是一個沒有復原路徑的死結。** 鎖定沒有時效，而檢查排在密碼驗證之前——被鎖的帳號連「密碼打對」都到不了清除計數那條路。唯一的解鎖途徑 `POST /api/admin/security/unlock-account` 需要一個已登入且具 SUPERADMIN 的管理員，但**觸發鎖定完全不需要認證、也不需要猜對密碼**：把已知的管理員 email 全部各打三次錯密碼，就沒有人能登入解鎖。

**同一個鎖定機制還可以用大小寫繞過。** 失敗計數的 Redis 鍵是 `failed-login:${email}`（原樣、區分大小寫），而 DB 定序是 `utf8mb4_unicode_ci`（不分大小寫）。攻擊者交替使用 `foo@x.com` 與 `Foo@x.com`，Redis 開出兩個各自不到閾值的計數器，DB 卻每次都命中同一個帳號——閾值永遠達不到。

**CSP 全域關閉。** `main.ts` 的 `helmet({ contentSecurityPolicy: false })` 註解寫著理由「本服務為純 API + 獨立前端」，但那個前提在單一埠部署模式（`ServeStaticModule` + `WEB_STATIC_ROOT`）加入時就失效了——該模式下後台 SPA 由同一個 Express 吐出，於是「無 CSP 的頁面」與「`localStorage` 裡效期 7 天的 refresh token」變成同源。

**Swagger 無條件掛載。** `/api/admin/docs-json` 是一份完整的後台地圖（所有端點、參數 schema、錯誤碼、權限碼命名），而它掛在 `app.use()` 上，**全域 `JwtAuthGuard` 碰不到**（Nest 的 guard 只作用於 Nest 路由）。目前沒有任何開關。

## What Changes

- 帳號鎖定加時效 `APPLICATION_ACCOUNT_LOCK_DURATION_MIN`（預設 15 分鐘），逾時自動解除
- **BREAKING（內部介面）**：`AccountLockPort.isLocked(): Promise<boolean>` 改為 `checkLock(): Promise<AccountLockStatus>`，三態 `NONE` / `LOCKED` / `EXPIRED`。布林分不出「從未鎖定」與「鎖過但已到期」，而後者必須一併清除失敗計數
- `LoginService` 收到 `EXPIRED` 時呼叫 `resetFailedLogin`——Redis 計數的 TTL（30 分鐘）比鎖定時效長，不清的話使用者在到期後第一次打錯就立刻重新被鎖，**實際鎖定時間變成計數的 TTL 而非設定的時效**
- 新增 `normalizeEmail`（去頭尾空白 + 轉小寫），套用在失敗計數、鎖定與解鎖的所有路徑，讓 Redis 鍵與 DB 的大小寫行為一致
- CSP 不再全域關閉：抽出 `infrastructure/security-headers.ts`，只在 Swagger UI 路徑放寬，豁免範圍由 `SWAGGER_SIDES` 單一來源決定；`main.ts` 與 `createE2EApp` 共用同一支
- 新增 `SWAGGER_ENABLED`：未設定時依 `NODE_ENV` 推導（production 關、其餘開）。關閉時 `/docs` 與 `/docs-json` **兩者都不掛載**
- `REFRESH_TOKEN_EXPIRES_IN` 預設由 604800（7 天）改為 86400（1 天）
- **BREAKING（對外契約，實作階段才發現）**：帳號鎖定的回應由 `403` / `FORBIDDEN` 改為 `423` / `ACCOUNT_LOCKED`。master spec 一直寫的是後者，但 `LoginService` 拋的是通用 `ForbiddenException`（NestJS 的 `HttpException` 由 class 名推導錯誤碼），而正確的 `AccountLockedException` 是**零呼叫端的死碼**。這條路徑先前沒有任何測試涵蓋，所以分歧了多久無從得知。同時修掉該處內嵌使用者文案的 Hard Rule 違規

不做的事：refresh token 改走 `httpOnly` cookie（會動到前端換發流程，屬獨立 change）、帳號鎖定的管理列表頁（`api-account-lock-management`，C6a，需本 change 的時效先落地）。

## Capabilities

### New Capabilities

- `platform-http-security`：HTTP 層的安全契約——安全標頭與 CSP 的套用範圍、Swagger 文件的暴露條件、token 效期與其儲存位置的綁定關係。這三者目前散在 `main.ts` 的註解與 `openspec/project/` 的敘述裡，沒有任何可驗收的需求，也因此「CSP 全域關閉」的前提失效了三個月都沒有人發現。

### Modified Capabilities

- `api-auth`：「登入」需求——鎖定改為有時效、到期自動解除並清除失敗計數，以及帳號比對一律用正規化後的 email。原需求只寫「連續失敗達閾值時帳號 MUST 被鎖定」，沒有規範解除方式，於是實作出一個沒有復原路徑的版本仍然完全合規。
- `api-security-management`：「解鎖帳號」需求——手動解鎖從**唯一**解除途徑降為時效之外的補充手段，需求敘述與 scenario 一併更新。

## Impact

- **新增檔案**：`apps/api/src/infrastructure/security-headers.ts`、`apps/api/src/shared/utils/normalize-email.ts`（各含 spec）
- **修改檔案**：`AccountLockPort.ts`、`PrismaAccountLockAdapter.ts`、`LoginService.ts`、`UnlockAccountService`、`main.ts`、`validate-env.ts`、`test/setup/test-app.ts`、`.env.example`、`openspec/project/backend-runtime.md`、`openspec/project/frontend.md`
- **無 migration**（時效由 `lockedAt` + 設定值算出，不加欄位）
- **新增兩個環境變數**：`APPLICATION_ACCOUNT_LOCK_DURATION_MIN`、`SWAGGER_ENABLED`，兩者都有預設值，既有部署不改 `.env` 也能啟動
- **行為變更需知會**：`REFRESH_TOKEN_EXPIRES_IN` 預設縮短為 1 天，未在 `.env` 明確設定的部署，使用者重新登入的頻率會提高；production 環境的 `/api/*/docs` 預設關閉
