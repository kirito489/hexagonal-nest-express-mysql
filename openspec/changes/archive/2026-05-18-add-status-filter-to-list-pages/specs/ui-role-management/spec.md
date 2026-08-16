## MODIFIED Requirements

### Requirement: 分頁與搜尋 URL state 同步

列表頁的分頁與搜尋條件 SHALL 同步到 URL query string，重新整理與分享連結保留狀態。

- 支援的 query 參數：`page`（預設 1）、`limit`（預設後端 `DEFAULT_PAGE_LIMIT`）、`name`、`status`（`'true'` / `'false'` / 省略代表「全部」）、`edit`（編輯中 role 的 uuid）、`view`（檢視中 role 的 uuid，與 edit 互斥）。
- 搜尋輸入 MUST debounce 300ms 後寫入 URL 並觸發新請求（重用既有 `useDebouncedValue` hook）。
- 「狀態」下拉（共用 `StatusFilterSelect`）MUST 即時寫入 URL；切換時 page MUST 重置為 1。
- 狀態為「全部」時 URL MUST 不寫 `status` 參數（避免 URL 噪音）。
- 翻頁按鈕 MUST 改寫 URL `page` 參數而非僅改 component state。
- URL 直接輸入或瀏覽器上一頁 MUST 觸發對應的 list query 與 dialog 開關。

#### Scenario: 使用者搜尋

- **WHEN** 使用者在 search input 輸入 `admin`
- **THEN** 300ms 後 URL 變成 `/roles?name=admin`，DataTable 重新請求並渲染過濾後的結果

#### Scenario: 分享連結保留狀態

- **WHEN** 使用者複製 `/roles?page=2&limit=20&name=admin` 給同事
- **THEN** 同事開啟連結時看到第 2 頁、每頁 20 筆、含 `admin` 的結果

#### Scenario: 使用者篩選停用角色

- **WHEN** 使用者在「狀態」下拉選「停用」
- **THEN** URL 變成 `/roles?status=false`、page 重置為 1，DataTable 重抓只回 `status === false` 的角色

#### Scenario: 切回「全部」清除 URL 參數

- **WHEN** 使用者在「狀態」下拉選「全部」
- **THEN** URL 不再含 `status` 參數，DataTable 重抓回啟用 + 停用兩者
