# platform-http-security Specification

## Purpose

定義 HTTP 層的安全契約：安全標頭與 CSP 的套用範圍、API 文件的暴露條件、
以及 token 效期與其儲存位置的綁定關係。

這三者的共同點是**它們的正確性取決於一個沒有寫下來的前提**，而前提失效時不會有任何錯誤訊息：
CSP 全域關閉的理由是「純 API + 獨立前端」，那個前提在單一埠部署模式加入時就失效了；
Swagger 掛在 `app.use()` 上，全域 `JwtAuthGuard` 碰不到，所以「有登入才看得到」從來就不成立；
refresh token 的效期只有搭配它的儲存位置才有意義。

寫成需求是為了讓前提本身成為被檢查的對象——每一條都附帶它成立的條件，
條件變了就該回頭改需求，而不是等某次審查偶然發現。

## Requirements
### Requirement: 安全標頭的套用範圍

系統 SHALL 對所有回應套用 HTTP 安全標頭（`X-Frame-Options`、HSTS、`X-Content-Type-Options`、CSP 等），套用邏輯 MUST 抽在單一函式中，由 `main.ts` 與 e2e 的應用組裝路徑**共用**。

CSP MUST NOT 全域關閉。放寬範圍僅限 Swagger UI 的路徑（它依賴 inline script/style），其餘一律套預設。豁免範圍 MUST 與 Swagger 的掛載位置由**同一份資料**決定，不得各自維護。

路徑判斷 MUST 用「完全相等或以 `<base>/` 開頭」，MUST NOT 用單純的前綴比對——後者會把 `/docs-json` 一併放寬，而那是 JSON 不是 UI。

實作 MUST 用單一 middleware 內的分支選擇兩份設定之一，MUST NOT 用「掛一份路徑限定的 helmet 再接一份全域 helmet」——後者只是「前綴符合才跑」，不會讓全域那份跳過，文件路徑仍會被加回 CSP。

CSP MUST NOT 依 `NODE_ENV` 切換內容。開發與正式跑不同的 CSP，等於把違規延到正式環境才發現。

#### Scenario: 一般路徑

- **WHEN** 請求任一非 Swagger UI 的路徑
- **THEN** 回應 MUST 帶 `Content-Security-Policy` 標頭

#### Scenario: Swagger UI 路徑

- **WHEN** 請求 `/api/admin/docs` 或其底下的靜態資源
- **THEN** 回應 MUST NOT 帶 `Content-Security-Policy` 標頭

#### Scenario: OpenAPI JSON 不在豁免範圍

- **WHEN** 請求 `/api/admin/docs-json`
- **THEN** 回應 MUST 帶 `Content-Security-Policy` 標頭——它不是 UI，不需要放寬

#### Scenario: e2e 應用未套用安全標頭

- **WHEN** e2e 組裝的應用沒有呼叫該共用函式
- **THEN** 視為缺陷——任何 header 斷言都會變成在驗一個沒有安全標頭的 app

### Requirement: API 文件的暴露條件

Swagger UI 與 OpenAPI spec SHALL 由 `SWAGGER_ENABLED` 控制。未設定時 MUST 依 `NODE_ENV` 推導：production 關閉、其餘開啟。明確設定 MUST 優先於推導。

關閉時 `/docs` 與 `/docs-json` **MUST 兩者都不掛載**。只關 UI 是不足的——`docs-json` 才是完整的後台地圖（所有端點、參數 schema、錯誤碼、權限碼命名），而它沒有介面所以容易被漏掉。

這兩條路徑以 `app.use()` 掛載原生 middleware，**全域 `JwtAuthGuard` 碰不到**（框架的 guard 只作用於框架路由），因此暴露與否只能由掛載時機決定，不能靠授權守則。

推導邏輯 MUST 抽成不讀取全域狀態的純函式，讓測試能直接餵入兩個參數驗證四種組合。

#### Scenario: production 未設定

- **WHEN** `NODE_ENV=production` 且 `SWAGGER_ENABLED` 未設定
- **THEN** 兩條路徑都不掛載，請求 `/api/admin/docs-json` 得到 404

#### Scenario: production 明確開啟

- **WHEN** `NODE_ENV=production` 且 `SWAGGER_ENABLED=true`
- **THEN** 兩條路徑都掛載

#### Scenario: 開發環境未設定

- **WHEN** `NODE_ENV=development` 且 `SWAGGER_ENABLED` 未設定
- **THEN** 兩條路徑都掛載

#### Scenario: 只關閉 UI

- **WHEN** 關閉後 `/docs` 回 404 但 `/docs-json` 仍有回應
- **THEN** 視為缺陷——有價值的那份仍然暴露

### Requirement: Token 效期與儲存位置綁定

Refresh Token 的效期 SHALL 依其**儲存位置**決定，兩者是一組決定而非兩個獨立設定。

Token 存放於 `localStorage` 時，`REFRESH_TOKEN_EXPIRES_IN` MUST NOT 設為長效期，預設 MUST 為 86400（1 天）。判準是「被偷走之後攻擊者能用多久」——`localStorage` 中的值任何 XSS 都讀得到，而 refresh 輪替會讓它續命。

改為 `httpOnly` + `SameSite=Strict` cookie 之後，效期才適合重新評估。在那之前調長效期 MUST 被視為破壞這條約束，而不是單純的參數調整。

#### Scenario: 調長效期而未改儲存位置

- **WHEN** 有人把 `REFRESH_TOKEN_EXPIRES_IN` 調回 604800 而 token 仍存在 `localStorage`
- **THEN** 違反本需求——效期只有在儲存位置改為 `httpOnly` cookie 後才適合放長

#### Scenario: 部署需要維持舊效期

- **WHEN** 既有部署因換發頻率考量要維持 7 天
- **THEN** MUST 在 `.env` 明確設定，讓那個決定是顯性的而非繼承來的預設值

