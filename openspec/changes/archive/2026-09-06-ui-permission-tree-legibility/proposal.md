## Why

角色表單的權限樹**讀不出「這個角色實際上能做什麼」**，兩個原因各自獨立：

**① 群組標題是英文的權限碼片段。** `PermissionsField` 直接渲染
`{platform.platform}` 與 `{g.module}`，也就是把 `BACKEND:ACCOUNT:VIEW`
拆開後的 `BACKEND` / `ACCOUNT`，沒有經過任何中文對照。
而底下的項目名稱是中文（「後台-帳號管理-檢視」），於是**同一張卡片上半英下中**，
且項目名把群組標題的內容又重複了一次。

**② 安全管理在權限樹上完全不存在。** IP 白名單 / IP 黑名單 / 帳號鎖定由
`@Roles(RoleCode.SUPERADMIN)` 保護、沒有權限碼，所以 `GET /roles/permissions`
不會回它們。使用者看到的是「後台有這三頁，但權限設定裡找不到」——
**看起來像漏掉，實際上是刻意的**（能改 IP 名單等同能繞過所有 IP 層防護，
不存在「只給一半」的合理情境）。問題不在那個決定，在於**那個決定在 UI 上不可見**。

順帶解掉一條自相矛盾的既有需求：`ui-role-management` 的「編輯按鈕對 isDefault
與權限的限制」寫著「整個 dropdown 不顯示，**或**編輯項 disabled」——
**一條需求給了兩個答案**，而實作其實兩個都不是（它隱藏的是編輯與刪除兩個項目，
dropdown 本身仍在，因為「檢視」不需要權限）。

## What Changes

- **權限樹群組標題中文化**：`BACKEND` → 後台、`ACCOUNT` → 帳號管理、
  `ROLE` → 角色管理、`ATTACHMENT` → 附件。對照表放前端並加守則擋漂移（design D1）。
- **項目名改為顯示動作**（檢視 / 編輯），不再重複群組標題。
  分組結構本來就按 action 分好（`group.view` / `group.edit`），
  不需要第三份對照表（design D2）。
- **權限樹新增「安全管理」不可指派區塊**：列出 IP 白名單 / IP 黑名單 / 帳號鎖定，
  標示「限超級管理者」、無 checkbox、附一句說明為什麼。
  **不動任何守衛**——安全模型維持原樣，只是讓它在 UI 上看得見（design D3）。
- **把「什麼時候 disabled、什麼時候隱藏」寫成明文**：權限不足時列內動作隱藏、
  資料狀態不允許時 disabled + tooltip。這個分界目前**只存在於實作**
  （`RolesTable` 的 `{canEdit && …}` 與 `DisabledHint`），spec 反而寫著二選一。
- **兩條守則**：權限模組的中文對照必須齊全且無死條目；
  不可指派清單的正確性依賴後端仍用 `@Roles(SUPERADMIN)`，那個守衛要被盯著。

**不做**：

- **不改 `PERMISSION_CATALOG` 的 `name`。** 衍生專案改了，是因為它的側邊欄
  被 `improve-admin-orientation` 改名而權限目錄沒跟上。**本模板兩邊本來就一致**
  （側邊欄「帳號管理」「角色管理」vs 目錄「後台-帳號管理-*」「後台-角色管理-*」），
  照抄只會製造一次不必要的 `db:seed`。
- 不新增 `BACKEND:SECURITY:*` 權限碼、不改 `SecurityController` 的守衛（design D3）。
- 不動 `ATTACHMENT`——它確實在保護附件端點，只是前端還沒有對應頁面（design D4）。

## Capabilities

### Modified Capabilities

- `ui-role-management`：
  - **修改**「權限多選 — Grouped checkboxes」——群組標題改中文、項目改顯示動作，
    並新增不可指派區塊的呈現規則。
  - **修改**「編輯按鈕對 isDefault 與權限的限制」——把「不顯示**或** disabled」
    的二選一改成單一答案。
  - **新增**「不可指派的權限必須可見」。
- `platform-frontend-conventions`：新增「動作控制項的權限呈現規則」。
- `platform-engineering-guardrails`：新增「權限模組的中文對照必須齊全」與
  「不可指派清單必須與後端守衛一致」。

## Impact

| 面向 | 影響 |
| --- | --- |
| Schema / migration | 無 |
| 環境變數 | 無 |
| 權限碼 | **無新增、無移除、`name` 不動** → **不需要重跑 seed** |
| API 契約 / Swagger | 無（`GET /roles/permissions` 的欄位與值都不變） |
| 後端 | **無**（只新增守則測試） |
| 前端 | `PermissionsField` + 兩份新常數 |
