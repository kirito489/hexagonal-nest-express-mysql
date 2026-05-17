## ADDED Requirements

### Requirement: 全域 toast 使用 sonner

`apps/web/` SHALL 採用 `sonner` 作為唯一的全域 toast 函式庫，覆蓋所有 mutation 成功 / 失敗、API 錯誤、其他即時通知。

- `App.tsx` MUST 掛載 `<Toaster />` 元件一次（與 React Router 同層）。
- 業務頁面 MUST 透過 `toast.success(...)` / `toast.error(...)` / `toast.info(...)` 觸發訊息，**禁止**自寫 `<div className="toast">` 或頁面內 inline 錯誤紅字（欄位驗證錯誤除外，那走 react-hook-form 的 FormMessage）。
- toast 文字 MUST 為繁體中文。
- 不導入其他 toast lib（如 `react-hot-toast`、`react-toastify`、shadcn 舊版 `toast`）。

#### Scenario: API 錯誤統一回饋

- **WHEN** 任何 mutation 拋出 `Error`
- **THEN** 該 page 的 mutation handler 呼叫 `toast.error(err.message)`，畫面顯示紅色 toast

#### Scenario: 成功動作

- **WHEN** 任何 mutation 成功
- **THEN** 該 page 呼叫 `toast.success('<繁中描述>')`

### Requirement: Sidebar 多項目導航與權限可見性

Sidebar SHALL 支援多項目導航，並依使用者權限動態決定哪些項目可見。

- Sidebar 項目 MUST 集中宣告為一份資料結構（如 `nav-items.ts`），包含 `label` / `path` / `icon` / `requiredPermission?`。
- 渲染時 MUST 過濾 `requiredPermission` 不在 `member.permissions` 中的項目，不渲染對應 `SidebarMenuItem`。
- 沒有 `requiredPermission` 的項目對所有登入使用者可見（如「首頁」、「個人設定」）。

#### Scenario: 無 BACKEND:ACCOUNT:VIEW 權限

- **WHEN** 使用者登入後 permissions 不含 `BACKEND:ACCOUNT:VIEW`
- **THEN** Sidebar 不顯示「會員管理」項目

#### Scenario: 角色變更後即時反應

- **WHEN** 管理員修改使用者 roleId 後，使用者重新登入或 MemberContext 快取重整
- **THEN** Sidebar 依新 permissions 重新計算可見項目

### Requirement: URL query string 同步列表頁狀態

任何「列表 + 分頁 + 搜尋 + 開啟編輯 dialog」型態的頁面 SHALL 將以下狀態同步到 URL query string：

- `page`：當前頁碼
- `limit`：每頁筆數
- 各項搜尋條件（如 `name`、`email`、`status` 等）
- `edit`：當前編輯中 entity 的 id（若 dialog 走 URL 控制）

實作上 MUST 透過 React Router 的 `useSearchParams` 取得 / 設定；不要把這些狀態放 component local state（除非有臨時值 → 確認時才寫進 URL，如搜尋 input 的 debounce 中間值）。

#### Scenario: 重新整理保留狀態

- **WHEN** 使用者在 `/members?page=2&name=alan` 按重新整理
- **THEN** 列表仍顯示第 2 頁、`name=alan` 的結果，搜尋框預填 `alan`

#### Scenario: 瀏覽器上一頁回到先前篩選

- **WHEN** 使用者搜尋 `bob` 後按瀏覽器「上一頁」
- **THEN** URL 與 UI 都回到搜尋 `bob` 之前的狀態
