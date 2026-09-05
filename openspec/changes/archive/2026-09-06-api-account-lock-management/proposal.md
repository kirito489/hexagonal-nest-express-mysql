## Why

**現在沒有任何方式看到誰的帳號被鎖了。** 鎖定是登入失敗達門檻
（`APPLICATION_ACCOUNT_LOCK_THRESHOLD`，預設 3 次）後自動發生的，寫進
`members.locked_at`；管理員只有在使用者主動來反應時才知道。解鎖端點
（`POST /api/admin/security/unlock-account`）早就存在，但它要求管理員
**先知道是誰、而且知道對方的 email**——那正是缺口所在。

前置條件已滿足：`platform-security-hardening`（C2）補上了鎖定時效與三態
`checkLock`，手動解鎖不再是唯一的復原途徑，這一頁因此是「觀測」而非「救援」。

衍生專案 `nexus-nest-backend` 已實作並經實機驗收（`2026-09-03-add-account-lock-management`
＋版面修正 `e674a2a`），本 change 以其為藍本回補，並改用本模板的
`@/components/PageHeader`。

## What Changes

- **新增 `GET /api/admin/security/locks`**：分頁列出有鎖定紀錄的後台帳號，
  支援 email 模糊搜尋與鎖定狀態過濾。沿用 security 模組既有的
  `RolesGuard + @Roles(SUPERADMIN)`，**不新增權限碼**。
- **列表查詢放進 `AccountLockPort`**：到期判定與登入路徑共用同一份實作（design D3）。
- **回應帶 `lockEnabled`**：`APPLICATION_ACCOUNT_LOCK_ENABLED` 預設 `false`，
  關閉時系統永遠不會寫入 `lockedAt`，這一頁會永遠是空的（design D6）。
- **新增前端 `/security/account-locks` 列表頁**，掛在 Sidebar 的「安全」群組，
  頁首用 `@/components/PageHeader`。

**不做**（範圍比 `tasks/todo.md` 記載的小，理由見 design D1 / D2）：

- **不新增 `DELETE /locks/:id`**——它與既有的 `POST unlock-account` 做同一件事，
  只是吃 id 而非 email，而列表頁本來就拿得到 email。**零個新的解鎖端點。**
- **不新增 `POST /locks`（手動鎖定）**——後台已有停用帳號（`status=false`）。
  手動鎖定的語意是「過 N 分鐘會自己解開」，那對「我要擋住這個人」的意圖是錯的。

## Capabilities

### Modified Capabilities

- `api-security-management`：新增「帳號鎖定列表查詢」。
- `ui-security-management`：新增「帳號鎖定頁路由與導航」與「帳號鎖定 DataTable」。

## Impact

| 面向 | 影響 |
| --- | --- |
| Schema / migration | **無**——鎖定狀態已存在 `members.locked_at`，不需要新表 |
| 環境變數 | 無 |
| API 契約 / Swagger | **新增一支 endpoint**，需 `swagger:bundle` + `api-client generate` |
| 前端 | 新增一頁 + Sidebar 一個項目 |
| 權限 | 沿用 SUPERADMIN role gate，**不新增權限碼** |
| 既有端點 | 不動——`unlock-account` 維持原契約 |
