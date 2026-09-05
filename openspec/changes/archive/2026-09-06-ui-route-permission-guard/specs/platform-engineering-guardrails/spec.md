## ADDED Requirements

### Requirement: 前端的權限碼必須存在於後端目錄

架構檢查 SHALL 比對 `apps/web/src/lib/permission-codes.ts` 的每個權限碼
與後端 `PERMISSION_CATALOG`，前端出現後端沒有的碼即失敗。

**它擋的是一個沒有症狀的錯誤**：`BACKEND:ACCOUNT:VEIW` 會讓那個 sidebar 項目
對**所有人**消失（含 SUPERADMIN），而 typecheck / lint / 測試全綠——
回報進來只會是「選單不見了」，那句話指不到任何地方。

型別（`PermissionCode`）是第一道防線，本規則是第二道：它擋的是
**常數本身就寫錯**，以及**後端把碼改名或移除**。

檢查 MUST 先斷言「解析得出東西」（前端檔案讀得到、解出的碼數量大於零、
後端目錄非空），否則正規式或常數寫法一變，規則會靜默空轉成「全部通過」。

本規則 SHALL 放在 api 側。前端既有的架構測試以 `import.meta.glob` 讀原始碼，
刻意不用 node 的 fs，因此讀不到 `apps/api` 的權限目錄。

#### Scenario: 前端權限碼打錯

- **WHEN** `permission-codes.ts` 出現 `BACKEND:ACCOUNT:VEIW`
- **THEN** 檢查失敗，訊息指出該碼不在後端目錄中

#### Scenario: 後端移除權限碼

- **WHEN** `PERMISSION_CATALOG` 刪掉某個碼，而前端仍留著
- **THEN** 檢查失敗

#### Scenario: 解析失效

- **WHEN** 前端常數改寫成正規式解不出的形式
- **THEN** 「掃描範圍有效」該條失敗，而不是讓比對空轉成通過

### Requirement: 路由與 sidebar 的權限宣告必須一致

架構檢查 SHALL 比對 `_nav-items.ts` 與 `App.tsx`：同一個 path 兩邊宣告的權限碼
MUST 相同，且 sidebar 宣告了 `requiredPermission` 的 path MUST 在路由上掛守衛。

兩邊不一致代表**使用者看得到卻進不去，或反過來**——而兩種都不會有東西失敗。

解析 MUST 先把 `App.tsx` 切成單條 `<Route` 區塊再比對。
跨區塊的正規式會從某條路由的 `path` 往後吃到**下一條**路由的守衛宣告，
於是那條路由本身反而沒被比對到。

⚠️ **本規則涵蓋不到不在 `NAV_ITEMS` 的路由**（`/xxx/:id` 這類明細頁）。
它們漏掛守衛時抓不到。這個限制是規則的一部分，不是待補的缺口——
放寬到「每條路由都要有守衛」會把 `/` 與 `/login` 一起掃進來，
而為它們開的例外會讓規則抓不到真正的漏掛。

#### Scenario: sidebar 藏了但路由沒守衛

- **WHEN** 某 path 在 `NAV_ITEMS` 宣告了 `requiredPermission`，
  但 `App.tsx` 的對應路由沒有掛權限守衛
- **THEN** 檢查失敗，訊息指出「隱藏不是保護——手動輸入網址就進得去了」

#### Scenario: 兩邊宣告不同的權限碼

- **WHEN** sidebar 要 `BACKEND:ROLE:VIEW`、路由要 `BACKEND:ACCOUNT:VIEW`
- **THEN** 檢查失敗，訊息列出該 path 與兩邊的值

#### Scenario: 明細路由

- **WHEN** 新增 `/members/:id` 且未掛守衛
- **THEN** 本規則通過——這是已知且刻意的涵蓋範圍限制
