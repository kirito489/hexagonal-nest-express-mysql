## MODIFIED Requirements

### Requirement: 路由保護

`apps/web/` 受保護的路由 SHALL 透過共用 guard 元件檢查**三層**：登入狀態、
細粒度權限、粗粒度角色。

- 受保護路由 MUST 在沒有 `access_token` 時自動導向 `/login`。
- `/login` 路由 MUST 在已有 token 時自動導向 `/`，避免重複登入。
- **在 sidebar 宣告了 `requiredPermission` 的路由 MUST 掛上對應的權限守衛。**
  隱藏不是保護——沒有守衛時手動輸入網址就進得去，然後頁面裡每一支 API
  被後端擋成 403，使用者看到的是空殼配一串錯誤。
- 權限守衛 MUST 引用型別化的權限碼常數，MUST NOT 寫裸字串。
  打錯一個字的後果是**靜默的**：那個項目對所有人消失（含 SUPERADMIN），
  而 typecheck / lint / 測試全綠。

前端這層 SHALL 只負責 UX，MUST NOT 被當成授權機制——真實的門是後端
`PermissionsGuard` 與 `RolesGuard`。守衛元件整個消失只會讓使用者看到一堆 403，
不會讓資料外洩。

#### Scenario: 未登入存取首頁

- **WHEN** 沒有 `localStorage.access_token` 的使用者瀏覽 `/`
- **THEN** 自動導向 `/login`

#### Scenario: 手動輸入沒有權限的路由

- **WHEN** 沒有 `BACKEND:ACCOUNT:VIEW` 的使用者直接輸入 `/members`
- **THEN** 就地顯示「沒有存取權限」，MUST NOT 渲染該頁內容

#### Scenario: 權限載入中

- **WHEN** `/me` 尚未回應
- **THEN** 守衛 MUST NOT 渲染任何內容，避免先閃出頁面再被換掉

## ADDED Requirements

### Requirement: 權限不足時就地顯示說明

權限或角色不足時，守衛 SHALL **就地渲染說明**，MUST NOT 靜默導頁，
也 MUST NOT 導向 `/403` 之類的專用路由。

說明 MUST 包含狀態（沒有存取權限）、出路（聯絡管理員開通）與**缺少的權限碼**。
這是內部後台，使用者拿得到碼才說得出自己要什麼——否則管理員收到的是
「我進不去某一頁」。

**`RequirePermission` 與 `RequireRole` MUST 用同一個呈現。**
兩種行為並存比任何一種單獨存在都糟：下一個人要先查才知道該用哪個。

這個決定的代價是**洩漏了「這個頁面存在」**，是知情的取捨：sidebar 本來就藏著它，
而會手動輸入該網址的人已經知道它存在了。相對地，靜默導頁的失敗模式是
使用者以為自己點錯了，再試一次、再被彈走，而沒有任何東西告訴他要去要權限。

#### Scenario: 非 SUPERADMIN 存取 security 路由

- **WHEN** 一般管理者手動輸入 `/security/ip-blacklist`
- **THEN** 就地顯示「沒有存取權限」，MUST NOT 導回首頁

#### Scenario: 說明標示缺少的權限

- **WHEN** 因缺少 `BACKEND:ROLE:VIEW` 而被擋
- **THEN** 畫面 MUST 顯示該權限碼
