## Why

前台側目前只有 `GET /api/front/ping`，而它是 `@Public()` 的。
**模板沒有任何前台使用者的概念**，衍生專案要做前台時得從零長出整套認證。

更要緊的是**現在補這件事的成本最低**：

`JwtPayload` 是 `{ sub, type, tokenVersion }`——**沒有任何側別欄位**。
今天不出事，是因為前台根本沒有使用者；一旦前台開出去，兩側 token 的邊界
就只剩「`sub` 在不在 `members` 表裡」這個間接效果。那不是設計，是巧合。

而全域 `JwtAuthGuard` 對**所有非 `@Public` 的路由**都解析 admin 的 `MemberContext`
——也就是說前台的已認證端點在現行架構下**沒有位置可以放**：
不是被當成後台使用者查一次（查不到 → 401），就是被迫掛 `@Public()`
而變成「一個叫做公開、實際上自己驗證的端點」。

## What Changes

- **Schema**：新增 `users` 表（前台使用者），與 `members` **完全獨立**（design D1）。
  需要 migration。
- **JWT**：`JwtPayload` 加 `side: 'admin' | 'front'`；**前後台使用各自的 secret**
  （design D2——忘記比對 side 時，各自 secret 是 fail-closed 的那一邊）。
- **新增 `@FrontAuth()` 裝飾器與 `FrontJwtAuthGuard`**：前台的已認證端點用它表態，
  全域 `JwtAuthGuard` 看到這個標記就放行給前台守衛處理（design D3）。
  **不用 `@Public()` 冒充**——那會讓一個需要認證的端點在程式碼裡自稱公開，
  而 `public-surface` 那類規則正是為了不讓這種事發生。
- **四支端點**：`POST /api/front/auth/{login,refresh,logout}`、`GET /api/front/me`。
- **Seed**：一個測試用的前台帳號。
- **守則**：前台的已認證 handler 必須掛 `@FrontAuth()`；
  `authorization-coverage` 的判定要認得這個新裝飾器。

**不做**（見 design 的 Non-Goals 與後續 change）：

- **註冊 / 信箱驗證 / 密碼重設**——那是 `api-front-auth-registration`。
  它有一整套「防濫用」問題要想（重複註冊是否洩漏帳號存在、驗證信節流、
  token 的時效與一次性），塞進來會讓這支大到無法 review。
  本支只建立「帳號體系能站著」所需的最小集合，`emailVerifiedAt` **只存不判斷**。
- **`EmailVerifiedGuard`**——模板前台沒有任何功能可擋，那是為不存在的問題建設施
  （與 C3 刻意不搬 `infra-endpoint` 裝飾器同一個理由）。
- **前台帳號鎖定**。後台那套（`failedLoginCount` + `lockedAt`）本身就是 DoS 面，
  剛在 `platform-security-hardening` 補過時效。前台的暴力破解防護已有全域 throttle
  與 IP 封鎖，不複製一個剛修過的東西。
- **後台管理前台使用者的 CRUD**、**前端畫面**（`apps/web` 是後台）。

## Capabilities

### Added Capabilities

- `api-front-auth`：前台的登入 / refresh / 登出 / me 契約，以及兩側 token 的隔離規則。
- `platform-engineering-guardrails`：新增「前台已認證端點必須表態」。

## Impact

| 面向 | 影響 |
| --- | --- |
| Schema / migration | **新增 `users` 表**，需要 migration |
| 環境變數 | **新增 2 個必填 secret**（`FRONT_ACCESS_SECRET` / `FRONT_REFRESH_SECRET`），要進 `envSchema` 與 `.env.example` |
| API 契約 | 新增 4 支 front 端點；**front 有自己的 swagger doc**（`/api/front/docs`），不影響 admin 的 api-client |
| 既有行為 | `JwtPayload` 加欄位——**既發的 admin token 仍然有效**（`side` 缺漏時視為 admin，見 design D4） |
| 前端 | 無（`apps/web` 是後台） |
| Seed | 新增一支前台使用者的 seed |
