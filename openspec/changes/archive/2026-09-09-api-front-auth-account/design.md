## Context

模板的前後台分界目前只存在於**路徑與模組結構**（`admin/` vs `front/`），
認證層完全沒有側別概念：

- `JwtPayload` = `{ sub, type, tokenVersion }`。
- 全域 `JwtAuthGuard`（`APP_GUARD` 第 4 位）對所有非 `@Public` 路由解析
  admin 的 `MemberContext`（查 `members` 表 + Redis 快取）。
- `front/ping` 是唯一的前台端點，`@Public()`。

`authorization-coverage.spec.ts` 已經要求「收外部輸入的 handler 必須有
`@Permissions` / `@Roles` / `@Public`」——**前台的已認證端點在這三個選項裡沒有位置**。

## Goals / Non-Goals

**Goals:**

- 前台有自己的使用者體系，與後台完全隔離。
- 兩側的 token **不能互通**，而且「忘記檢查」時的預設結果是拒絕。
- 前台的已認證端點在程式碼裡看得出它需要認證。

**Non-Goals:**

- 註冊 / 信箱驗證 / 密碼重設（下一支）。
- `EmailVerifiedGuard`——沒有東西可擋。
- 前台帳號鎖定、後台管理前台使用者、前端畫面。

## Decisions

### D1：`users` 與 `members` 分表，不共用

`members` 帶著 `roleId` / `lockedAt` / `isDefault` / `failedLoginCount` /
`lastPasswordChange` 這些 RBAC 與後台專屬的欄位，前台使用者一個都不需要。
反過來前台需要「顯示名稱」「信箱驗證狀態」，後台沒有。

共用一張表會讓每一支查詢都要記得帶「這是哪一側」的條件，
而**忘記帶的後果是跨側資料外洩**。分表之後那個錯誤在型別層就發生不了。

**欄位刻意從簡**（藍本有 `avatarUrl`，本模板不放）：模板不做上傳流程，
留一個沒有人寫入的欄位只會讓人以為有。衍生專案要時自己加。

`lastLoginAt` 沿用 `members` 的命名而非藍本的 `lastSeenAt`：
藍本的語意來自聊天的 presence（「上次來過」vs「現在在不在」），
模板沒有 presence，用與後台一致的欄位名讓兩側看起來像同一個系統。

### D2：前後台用**各自的 secret**，`side` claim 是第二道

最直覺的做法是共用 secret、靠 `side` claim 分辨。**這裡刻意不採用。**

差別在**忘記檢查時會發生什麼**：

| | 共用 secret + side claim | 各自的 secret |
| --- | --- | --- |
| 某處忘了比對 side | **跨側存取**（前台 token 過得了 admin 端點） | 簽章驗證失敗，**天然 fail-closed** |
| 新增受保護端點 | 必須記得表態 | 用錯 secret 就是驗不過 |

這個專案在其他地方（IP 黑名單、限流、Redis 不可用）一貫選 fail-closed，
這裡沒有理由選相反的。**「忘記」是一定會發生的事，重點是它發生時的預設結果。**

代價是兩個新的必填 secret（production 共四組）。可接受——
產生方式與既有的 `ACCESS_SECRET` / `REFRESH_SECRET` 相同，
部署平台注入四個與注入兩個沒有本質差別。

`side` claim 仍然要有，理由是**可讀性與錯誤訊息**：驗證失敗時能說出
「這是前台的 token」而不是只有一句「簽章無效」。它是第二道，不是唯一那道。

### D3：`@FrontAuth()` 裝飾器，不用 `@Public()` 冒充

前台的已認證端點需要繞過全域 `JwtAuthGuard`（它只認 admin），
但**不能掛 `@Public()`**——那會讓一個需要認證的端點在程式碼裡自稱公開。

後果不只是命名難看：`authorization-coverage.spec.ts` 與 `public-surface.spec.ts`
都以「哪些端點是公開的」為前提在做判斷。用 `@Public()` 冒充會讓那兩條規則
**在錯誤的前提上繼續全綠**，而它們正是為了不讓這種事發生才存在的。

做法：

1. 新增 `@FrontAuth()`（`SetMetadata`），標記「這是前台的已認證端點」。
2. 全域 `JwtAuthGuard` 看到該標記就 `return true`——把處理權交給下一道。
3. `FrontJwtAuthGuard` 以 `FRONT_ACCESS_SECRET` 驗簽、確認 `side === 'front'`、
   查 `users` 表載入 `UserContext`。掛在前台 controller 上（`@UseGuards`）。
4. `authorization-coverage` 的允許清單加入 `@FrontAuth`。

不選「讓全域 `JwtAuthGuard` 依路徑前綴自動分流」：那會讓一個 guard 同時懂兩套
使用者體系與兩組 secret，而**路徑前綴是字串比對**——新增一個前台模組時
忘記路徑慣例就會靜默走錯分支。裝飾器是顯式的表態，漏掛會被守則抓到。

### D4：`side` 缺漏時視為 `admin`，讓既發 token 不失效

`JwtPayload` 加 `side` 之後，**已經簽出去的 admin token 裡沒有這個欄位**。
把它當成必填會讓所有人在部署當下被登出。

處置：admin 側解析時 `payload.side ?? 'admin'`。前台側**必須**是 `'front'`
（前台是全新的，不存在舊 token）。

這是一個**過渡期的寬鬆**，不是永久設計。但也不必排期移除：
admin token 的效期本來就短（access 15 分鐘、refresh 1 天），
下一次 refresh 就會帶上 `side`。寫在這裡是為了讓下一個看到 `?? 'admin'`
的人知道它為什麼在。

### D5：`UserContext` 走 DB 查詢，先不做快取

`MemberContext` 有 Redis 快取（權限解析成本高、且要能被角色變更清除）。
前台的 `UserContext` 只有 `{ id, email, displayName, emailVerified, status }`
——一次主鍵查詢，沒有 join。

**先不加快取**：快取要配一整套失效機制（改資料、停用、tokenVersion），
而目前沒有任何證據說這一次查詢是瓶頸。加了之後「為什麼前台看到舊資料」
會是一個沒有人想除的 bug。

### D6：front 的 swagger 獨立，不進 api-client

`api-client` 是從 **admin** 的 openapi 產生的（`/api/admin/docs`），
給 `apps/web` 用。前台是獨立 repo 的事，**不把前台契約塞進後台的 client**。

front 已經有自己的 doc（`/api/front/docs`、`docs/swagger/front/openapi.yaml`），
新端點加進那一份。

## Risks / Trade-offs

- **[新增兩個必填 secret]** → 部署要多注入兩個。`env-example-sync.spec.ts` 會確認
  `.env.example` 有它們，`validate-env` 在 production 缺少時直接 `process.exit`。
- **[`JwtPayload` 加欄位波及既發 token]** → D4 的 `?? 'admin'` 處理。
  **風險是那個 fallback 被誤讀成「side 是選填的」**，所以要寫進註解與 spec。
- **[多一個 guard 與一個裝飾器]** → 漏掛 `@FrontAuth` 的端點會被全域
  `JwtAuthGuard` 當成 admin 端點擋下（401），**不是靜默放行**——失敗方向是安全的。
  新增守則要求前台的已認證 handler 必須表態。
- **[`users` 表沒有 RBAC]** → 前台目前所有使用者權限相同。衍生專案若需要前台角色，
  那是另一個決定，本支不預設任何結構。

## Migration Plan

1. `prisma migrate dev` 建 `users` 表。
2. 兩個新 secret 進 `.env.example`（開發用值）與部署環境。
3. `db:seed` 建測試帳號。
4. 既有 admin token 不受影響（D4）。
