## ADDED Requirements

### Requirement: 帳號鎖定頁路由與導航

前端 SHALL 於 `/security/account-locks` 提供帳號鎖定列表頁，
並在 Sidebar 的「安全」群組中新增對應項目，排在既有的 IP 白名單 / 黑名單之後。

頁首 MUST 使用 `@/components/PageHeader`，MUST NOT 自行手寫 `<header>` 結構。
衍生專案的這一頁正是照抄前一頁抄歪的那一頁——三處偏差
（多了內距、用 `<div>` 而非 `<header>`、標題字重不同），
**typecheck / lint / 測試全綠**，是用眼睛看出來的。

副標 MUST 依 `lockEnabled` 切換措辭：副標描述的是**啟用後**的行為，
功能關閉時用現在式陳述會與停用提示直接矛盾，而使用者只會讀到其中一句。

#### Scenario: 進入帳號鎖定頁

- **WHEN** SUPERADMIN 點選 Sidebar 的「帳號鎖定」
- **THEN** 導向 `/security/account-locks` 並載入列表

#### Scenario: 非 SUPERADMIN

- **WHEN** 一般管理員登入
- **THEN** Sidebar MUST NOT 出現「帳號鎖定」項目

### Requirement: 帳號鎖定 DataTable

列表 SHALL 顯示 email、名稱、鎖定時間、解鎖時間、失敗次數與狀態，
並提供 email 搜尋與狀態過濾（鎖定中 / 已到期 / 全部），預設為「鎖定中」。

每一列 MUST 顯示判定後的狀態，MUST NOT 只顯示 `lockedAt` 讓使用者自己心算。

**已到期的列 MUST 同樣提供可按的解鎖**，MUST NOT 設為 disabled 或隱藏。
本專案的解鎖服務只拒絕 `NONE`，`EXPIRED` 是刻意放行的——`lockedAt` 仍有值、
Redis 的失敗計數也可能還在，清掉那些殘留正是管理員按下解鎖時的意圖。
而列表只列 `lockedAt != null` 的帳號，`NONE` 不可能出現，
**因此列表上每一列的解鎖都會成功**。

已到期的列 MUST 標示其狀態，但那是**說明**而非阻擋：讓管理員知道
「這個人已經可以登入了，按解鎖是清掉殘留紀錄」。

解鎖 MUST 呼叫既有的 `POST /api/admin/security/unlock-account`（以 email），
MUST NOT 新增解鎖端點。

#### Scenario: 鎖定中的列

- **WHEN** 某列的 `status` 為 `locked`
- **THEN** 顯示可按的解鎖動作，並顯示 `unlocksAt`

#### Scenario: 已到期的列仍可解鎖

- **WHEN** 某列的 `status` 為 `expired`
- **THEN** 解鎖動作 MUST 仍可按（清除殘留的 `lockedAt` 與失敗計數），
  並標示該帳號目前已能登入

#### Scenario: 解鎖成功

- **WHEN** 管理員對鎖定中的帳號按下解鎖並確認
- **THEN** 呼叫既有端點，成功後重新載入列表並顯示成功提示

#### Scenario: 帳號鎖定功能停用

- **WHEN** 回應的 `lockEnabled` 為 `false`
- **THEN** 頁面 MUST 顯示停用提示，空狀態 MUST NOT 只寫「目前沒有帳號被鎖定」
  ——那會把「不會鎖」說成「沒有人被鎖」，而兩者意義相反

#### Scenario: 狀態過濾

- **WHEN** 切換為「已到期」
- **THEN** 以 `status=expired` 重新查詢，且該狀態反映在網址上
