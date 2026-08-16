## MODIFIED Requirements

### Requirement: 新增與編輯共用 Dialog

新增與編輯 SHALL 走同一個 shadcn `Dialog`，由 mode（`create` / `edit`）切換按鈕文字與初值。

- Dialog 表單欄位：Email / 名稱 / 密碼 / 角色 / 狀態。
- **新增模式**：密碼必填（8-30 字元）；提交後 `POST /members`，成功 toast + invalidate list + 關閉 dialog。
- **編輯模式**：密碼選填（**空字串視為不改**）；提交後 `PATCH /members/:id`，成功同上。
- 角色欄位使用 cmdk 為基底的 Combobox（`RoleCombobox`）渲染，內部以 `useInfiniteQuery` 從 `GET /api/members/role/options?page=&limit=&search=` 分頁取得角色清單，下拉清單滾到底時透過 IntersectionObserver 觸發 `fetchNextPage`。
- Combobox 內含搜尋輸入；輸入經 `useDebouncedValue` debounce 300ms 後寫入 query 觸發新搜尋。
- 角色選項以 `id` 去重；`isDefault === true` 的選項 MUST disabled 並標示「（預設）」（與角色列表 badge 一致），使用者 MUST NOT 能將其指派給新建 / 編輯中的會員。
- 編輯模式時若初值的 `roleId` 不在分頁第一頁，Combobox MUST 並列 fetch `GET /api/members/role/options/:id` 取得 fallback option，將其合併進顯示清單頂端，確保使用者能看到既有角色名稱與 `isDefault` 狀態。fallback fetch 失敗（404）時 Combobox MUST 顯示「（已停用 / 不可用）」並維持 roleId 為當前值。
- 角色 query 的 staleTime 維持 10 分鐘；endpoint 仍需 `BACKEND:ACCOUNT:VIEW` 權限。
- 表單驗證使用 react-hook-form + zod + `standardSchemaResolver`，錯誤即時顯示在欄位下方。
- 編輯模式由 URL `?edit=<uuid>` 控制 dialog 開關；重新整理會自動嘗試載入該 uuid 的資料，若 404 / 沒權限 graceful close + toast。

#### Scenario: 新增成功

- **WHEN** 使用者填完欄位按「儲存」且 API 回 201
- **THEN** 顯示 toast「會員已新增」、列表 invalidate 重抓、dialog 關閉

#### Scenario: 編輯時密碼空白

- **WHEN** 使用者開啟編輯 dialog，只改名稱，密碼欄留空，按儲存
- **THEN** PATCH body 不含 password 欄位（或送空字串由後端 schema 轉 undefined），會員密碼不變

#### Scenario: Email 重複

- **WHEN** 新增時 email 已存在，後端回 409 + `EMAIL_ALREADY_EXISTS`
- **THEN** 顯示 toast「Email 已被使用」，dialog 不關閉，使用者可調整後重送

#### Scenario: 角色 Combobox 載入分頁

- **WHEN** 使用者開啟 dialog 並點開角色 Combobox
- **THEN** 顯示第一頁前 20 筆角色；滾動到清單底端時自動載入下一頁直到 `hasNextPage === false`

#### Scenario: 角色搜尋

- **WHEN** 使用者在 Combobox 搜尋輸入框輸入 `admin`
- **THEN** 300ms 後重新打 `GET /api/members/role/options?search=admin&page=1`，清單顯示符合條件的角色

#### Scenario: 預設角色 disabled

- **WHEN** Combobox 清單中出現 `isDefault === true` 的角色
- **THEN** 該選項 disabled 並標示「（預設）」，使用者點擊 MUST NOT 變更表單 `roleId`

#### Scenario: 編輯模式 fallback option

- **WHEN** 使用者開啟編輯 dialog，初值 `roleId` 不在第一頁範圍內
- **THEN** Combobox 並列 fetch `GET /api/members/role/options/:id`，將該角色合併進顯示清單頂端，使用者能看見當前角色名稱（並維持 `isDefault` disabled 行為）

#### Scenario: 編輯模式 fallback 角色已停用

- **WHEN** 使用者開啟編輯 dialog，初值 `roleId` 對應的角色已停用或軟刪除（API 回 404）
- **THEN** Combobox 維持 roleId 為當前值並顯示「（已停用 / 不可用）」placeholder，使用者可選別的啟用中角色覆蓋
