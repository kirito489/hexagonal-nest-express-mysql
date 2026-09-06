## MODIFIED Requirements

### Requirement: 權限多選 — Grouped checkboxes

Dialog 內的權限選擇 SHALL 以分組 checkbox 列表呈現，分組來源為 `GET /api/roles/permissions`。

- 權限選項 MUST 透過 TanStack Query 取得，query key `['GET', '/roles/permissions']`，staleTime 30 分鐘。
- 列表 MUST 依 `platform → module` 分組；每個 module group 內列出該 module 的 `VIEW` / `EDIT` 兩個 checkbox（若後端僅回其中一個，則只列那一個）。
- **群組標題 MUST 顯示中文，MUST NOT 直接渲染權限碼片段。**
  `platform` 與 `module` 是 `BACKEND:ACCOUNT:VIEW` 拆開後的碼，直接顯示會讓
  同一張卡片上半英下中。查不到對照時 MUST 退回原始碼片段而非空字串——
  標題空白的卡片看起來像壞掉，英文標題至少還讀得出是哪一組。
- **checkbox 的文字 MUST 是動作名（檢視 / 編輯），MUST NOT 重複群組標題的內容。**
  群組標題中文化之後，「後台-帳號管理-檢視」把標題講過的話又講一次，
  三層裡有兩層是重複的。
- 每個 module group MUST 提供 group-level「全選 / 全不選」操作（群組標題列右側的小 button）。
- 每個 module 一個 card，內部分兩層：header row（module 名 + 全選 button）+ 垂直 stack 的 checkbox 區，避免長文字 label 換行錯位。
- 表單 state 為 `permissionCodes: string[]`；提交前 MUST `sort()` 並去重。
- 容器 MUST 限制最大高度，內容超過時可滾動（建議 `max-h-[60vh] overflow-auto`）。

#### Scenario: 載入權限清單

- **WHEN** 開啟 create/edit dialog
- **THEN** 依 `GET /api/roles/permissions` 結果以 platform → module 分組顯示，每組列出 VIEW/EDIT checkbox

#### Scenario: 群組標題中文化

- **WHEN** 權限碼為 `BACKEND:ACCOUNT:VIEW`
- **THEN** 群組標題顯示「後台」與「帳號管理」，MUST NOT 顯示 `BACKEND` 或 `ACCOUNT`

#### Scenario: 未知的碼片段

- **WHEN** 後端新增了前端還沒有對照的 module
- **THEN** 標題退回顯示該碼片段，MUST NOT 顯示空白

#### Scenario: group 全選

- **WHEN** 使用者點某 module group 的「全選」
- **THEN** 該 group 內所有 permissionCode（VIEW + EDIT）被加入表單 `permissionCodes`

#### Scenario: group 全不選

- **WHEN** 使用者點某 module group 的「全不選」
- **THEN** 該 group 內所有 permissionCode 從表單 `permissionCodes` 移除

#### Scenario: 提交排序

- **WHEN** 表單送出
- **THEN** 送往後端的 `permissionCodes` 為去重後依字母排序的陣列

### Requirement: 編輯按鈕對 isDefault 與權限的限制

列上的「編輯」操作 SHALL 依**限制的來源**決定呈現方式：

- `isDefault === true`（資料狀態）：**disabled**，tooltip「預設角色不可編輯」。
- 使用者沒有 `BACKEND:ROLE:EDIT` 權限：**該動作項隱藏**。

原文寫的是「整個 dropdown 不顯示，**或**編輯項 disabled」——**一條需求給了兩個答案**，
而實作其實兩個都不是：它隱藏的是編輯與刪除兩個項目，dropdown 本身仍在，
因為「檢視」不需要編輯權限。完整規則見 `platform-frontend-conventions` 的
「動作控制項的權限呈現規則」。

#### Scenario: 預設角色編輯按鈕 disabled

- **WHEN** 列上某 role 的 `isDefault === true`
- **THEN** dropdown 的「編輯」disabled，hover tooltip 顯示「預設角色不可編輯」

#### Scenario: 無編輯權限

- **WHEN** 使用者沒有 `BACKEND:ROLE:EDIT`
- **THEN** dropdown 內不出現「編輯」與「刪除」，但「檢視」仍在且 dropdown 本身仍可開啟

## ADDED Requirements

### Requirement: 不可指派的權限必須可見

權限樹 SHALL 顯示「後台有這個功能、但無法透過角色指派」的區塊。

安全管理（IP 白名單 / IP 黑名單 / 帳號鎖定）由 `@Roles(RoleCode.SUPERADMIN)`
保護、沒有權限碼，因此 `GET /roles/permissions` 不會回它們。
**不畫出來的話，使用者會看到後台有 IP 白名單頁、權限設定裡卻找不到，
合理地判斷成「權限漏設了」。** 顯示成不可指派則當場回答了那個問題。

- 該區塊 MUST NOT 放 checkbox（**也不是 disabled 的 checkbox**）。
  disabled 的勾選框仍在說「這是一個可以勾的東西，只是你現在不能勾」，
  而它對任何人都不能勾。
- MUST 附一句說明**為什麼**不可指派。只寫「無權限」的話使用者會去要那個權限，
  而它要不到。
- 措辭 MUST NOT 提「已授予 / 未授予」——它描述的是**指派機制**而非某個角色的狀態，
  所以不論在看哪一個角色（含超級管理者）都成立。

⚠️ 這份清單寫死在前端。守則盯得住「後端守衛被拿掉」，
**盯不住「新增了 SUPERADMIN-only 頁面卻忘了補進清單」**——
那要靠人記得。這個限制是規則的一部分，不是待補的缺口。

#### Scenario: 檢視權限樹

- **WHEN** 開啟角色的權限設定
- **THEN** 除了可指派的模組外，MUST 顯示「安全管理」區塊與不可指派的說明

#### Scenario: 超級管理者檢視

- **WHEN** 正在編輯的是超級管理者角色
- **THEN** 該區塊的文字不變——它描述的是指派機制，不是這個角色的狀態
