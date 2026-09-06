# platform-frontend-conventions Specification

## Purpose

定義 `apps/web/` 後台前端的跨頁共通基礎：技術棧、目錄結構、認證 / 路由保護、
API client、表單與資料層 convention、全域 UI 元件（toast / sidebar）、URL state
同步原則。個別模組（如會員管理、角色管理）的 UI 行為由各自的 capability spec 規範。
## Requirements
### Requirement: 前端技術棧

`apps/web/` SHALL 採用以下技術棧：

- 建構工具：Vite 7（或當下穩定版）。
- UI 函式庫：React 19、TypeScript 5（strict）。
- 樣式系統：Tailwind CSS v4，不導入 PostCSS 額外設定。
- 元件庫：shadcn/ui，元件以 copy-paste 方式落地於 `apps/web/src/components/ui/`，不以 npm 依賴形式安裝。
- 路由：React Router v7（declarative mode）。
- 資料層：TanStack Query v5。
- 表單：react-hook-form + zod。
- 表格：TanStack Table v8。
- 圖示：lucide-react。

#### Scenario: shadcn 元件加入專案

- **WHEN** 開發者執行 `pnpm dlx shadcn@latest add button`
- **THEN** `apps/web/src/components/ui/button.tsx` 被建立，且 `package.json` 不新增 shadcn npm 依賴

### Requirement: 前端原始碼結構

`apps/web/src/` SHALL 採以下子目錄區分職責：

- `components/ui/`：shadcn 元件落地處。
- `components/`：專案自製可重用元件。
- `routes/`：頁面層元件，依路由路徑分子目錄。
- `api/`：包裝 `@app/api-client` 的 hooks 與全域 fetch wrapper。
- `lib/`：工具函式（含 shadcn 預設的 `cn()`）。
- `types/`：跨檔案共用的 TS 型別。

#### Scenario: 新增頁面

- **WHEN** 開發者新增 `/members` 頁面
- **THEN** 對應檔案位於 `apps/web/src/routes/members/` 之下

### Requirement: UI 語言為繁體中文

`apps/web/` 的所有使用者可見文字 SHALL 使用繁體中文 hardcode，不導入 i18n 框架。

- 表單 label、錯誤訊息、按鈕文字、頁面標題 MUST 為繁體中文。
- MUST NOT 安裝 `react-i18next`、`i18next`、`react-intl` 或同類套件。
- 註解亦 MUST 使用繁體中文，不使用日文或雙語。

#### Scenario: 登入頁標題

- **WHEN** 使用者瀏覽 `/login`
- **THEN** 頁面顯示繁體中文標題（例如「登入」）而非英文或日文

### Requirement: Vite dev server 透過 proxy 連到後端

`apps/web/` 的 Vite dev server SHALL 設定 proxy 將 API 請求轉發到後端，避免開發時的 CORS 問題。

- `vite.config.ts` MUST 設定 `server.proxy['/api']` 指向後端 dev server（預設 `http://localhost:3000`）。
- 前端在 dev 與 prod 環境 MUST 一律以 `/api/...` 開頭呼叫後端，無需切換 base URL。

#### Scenario: 開發時呼叫登入 API

- **WHEN** 前端 dev 模式發送 `POST /api/auth/login`
- **THEN** Vite proxy 轉發到 `http://localhost:3000/auth/login`，前端不直接連 `localhost:3000`

### Requirement: 認證 token 儲存

`apps/web/` SHALL 將 access token 儲存於 `localStorage`，並透過全域 fetch wrapper 注入 `Authorization` header。

- 登入成功後 MUST 將後端回傳的 access token 存入 `localStorage`，鍵名固定為 `access_token`。
- 所有受保護的 API 請求 MUST 自動帶上 `Authorization: Bearer <token>`。
- 收到 401 回應時 MUST 清除 `localStorage` 並導向 `/login`。

#### Scenario: 登入後跳轉

- **WHEN** 使用者於 `/login` 成功登入
- **THEN** token 寫入 `localStorage.access_token`，並導向 `/`（首頁）

#### Scenario: Token 過期

- **WHEN** API 回傳 401
- **THEN** `localStorage.access_token` 被清除，路由跳轉到 `/login`

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

### Requirement: 表單驗證統一使用 zod

`apps/web/` 的表單 SHALL 使用 react-hook-form + zod 進行驗證。

- 表單 MUST 定義 zod schema 並透過 `zodResolver` 傳入 `useForm`。
- 表單錯誤訊息 MUST 為繁體中文（透過 zod schema 的 `message` 設定）。

#### Scenario: 登入表單驗證

- **WHEN** 使用者於登入頁送出空 email
- **THEN** 顯示繁體中文錯誤訊息（例如「請輸入 Email」）

### Requirement: TanStack Query 全域設定

`apps/web/` SHALL 在 root 提供統一的 `QueryClient` 實例與全域錯誤處理。

- `QueryClient` MUST 透過 `QueryClientProvider` 包覆整個 App。
- 401 錯誤的全域處理 MUST 在 `QueryCache.onError` 或 fetch wrapper 統一執行（清 token、跳 login）。
- 開發環境 MUST 載入 `@tanstack/react-query-devtools`。

#### Scenario: 開發環境 DevTools 可用

- **WHEN** `pnpm --filter @app/web dev` 啟動的網頁載入完成
- **THEN** React Query DevTools 浮動按鈕可見

### Requirement: 後端有 CORS 設定允許前端 dev origin

`apps/api/` 後端在 dev 環境 SHALL 允許 `http://localhost:5173` 等前端 dev origin 的 CORS 請求。

- 此為新增的後端調整：原有 CORS 設定 MUST 擴充以容納前端 Vite dev server origin。
- prod 環境的 CORS 白名單 MUST 透過環境變數設定，不 hardcode。

#### Scenario: 前端開發環境跨來源請求

- **WHEN** 前端 dev server (`http://localhost:5173`) 透過 proxy 以外的方式呼叫後端
- **THEN** 後端不回 CORS 拒絕（或透過 proxy 即可，不必直接 cross-origin）

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

Sidebar SHALL 支援多項目分組導航、依使用者權限動態決定哪些項目可見，footer 提供登出按鈕。

- Sidebar 項目 MUST 集中宣告為一份資料結構（`routes/_nav-items.ts`），每筆 NavItem 包含：
  - `label` / `path` / `icon`（必要）
  - `group?: string`：屬於哪個 sidebar group（如「使用者與權限」「安全」）；未指定為「無 group」獨立顯示於最上。
  - `requiredPermission?: string`：細粒度權限門檻，使用者 permissions 不含此 code 時項目隱藏。
  - `requiredRoleCode?: 'SUPERADMIN'`：粗粒度 role 門檻（與 permission 並用，兩者皆通才顯示）；給 security 等 SUPERADMIN-only 模組用。
- 渲染邏輯 MUST 滿足：
  1. 先依 `requiredPermission` 與 `requiredRoleCode` 過濾出可見項目。
  2. 依 `group` 分組；每組渲染一個 `<SidebarGroup>` + `<SidebarGroupLabel>`（label 顯示 group 名）。
  3. 無 group 的項目（如「首頁」）獨立成一塊，固定排在所有 group 之上。
  4. 若某 group 過濾後完全空（所有 item 都被權限擋掉），整個 group MUST NOT 渲染，連 SidebarGroupLabel 都不出現。
- Sidebar footer MUST 提供「登出」按鈕，點擊執行 `tokenStorage.clear` + `queryClient.clear` + navigate('/login')。

#### Scenario: 無 BACKEND:ACCOUNT:VIEW 權限

- **WHEN** 使用者登入後 permissions 不含 `BACKEND:ACCOUNT:VIEW`
- **THEN** Sidebar 不顯示「會員管理」項目；若「使用者與權限」group 內所有項目都因權限被擋，整個 group 連 label 也不出現

#### Scenario: 非 SUPERADMIN 角色

- **WHEN** 使用者 roleCode 非 `'SUPERADMIN'`
- **THEN** Sidebar「安全」group 整組（含 label）不顯示，無論使用者其他 permissions 為何

#### Scenario: 角色變更後即時反應

- **WHEN** 管理員修改使用者 roleId 後，使用者重新登入或 `useCurrentMember` 快取重整
- **THEN** Sidebar 依新 permissions / roleCode 重新計算可見項目與 group

#### Scenario: 點 footer 登出

- **WHEN** 使用者點 sidebar footer 的「登出」按鈕
- **THEN** 清掉 access / refresh token、清掉 TanStack Query cache、導向 `/login`

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

### Requirement: 列表頁的頁首一律使用共用元件

列表頁的頁首 SHALL 使用共用的 `PageHeader` 元件，MUST NOT 各自手寫結構。
元件提供標題、選填副標、選填動作區三個部分。

**有無動作區的排版差異 MUST 由元件自己決定**，MUST NOT 交給呼叫端。
沒有動作區時不套水平排版；有動作區才套。留給呼叫端決定的話，
「這一頁忘了加 flex」不會有任何東西擋得住——而那正是分歧的來源。

存在理由是**「照抄前一頁」在第 N 頁會抄歪**：衍生專案的第八個列表頁三處都偏了
（多了內距、頁首用 `<div>` 而非 `<header>`、標題字重不同），
而 typecheck / lint / 測試**全綠**——那是用眼睛看出來的。

明細頁、登入頁、首頁不適用本需求：它們沒有這層結構，硬套會讓元件長出一堆選項。

#### Scenario: 新增一個列表頁

- **WHEN** 新增列表頁並需要標題與新增按鈕
- **THEN** 使用 `PageHeader` 並把按鈕作為 children 傳入，MUST NOT 複製既有頁面的頁首結構

#### Scenario: 沒有動作區的列表頁

- **WHEN** 某列表頁只有標題與副標、沒有動作按鈕
- **THEN** 頁首 MUST NOT 套用水平分散排版——由元件依 children 有無自動決定

### Requirement: 能用結構消除的偏差不寫成守則

當一種偏差可以用「抽成共用元件」消除時，SHALL 優先用結構解決，
MUST NOT 改為新增架構守則。

理由是**例外會讓守則失效**：頁首這類規則若寫成「所有 `page.tsx` 都必須用 `PageHeader`」，
就得為明細頁、登入頁、首頁開豁免；規則放寬到能容納它們之後，
就抓不到真正的偏差了。而**會誤報的守則會被繞過**——處理方式是把檔案加進白名單，
規則從此空轉。

判準：**沒有可以寫歪的地方，就不需要有人記得寫對。**
守則的定位是「無法用結構消除的約束」（跨層相依、契約同步、清單完整性），
不是「凡是重複的都盯著」。

#### Scenario: 發現多處重複且結構相同的 UI

- **WHEN** 數個頁面出現逐字相同的結構片段
- **THEN** 抽成共用元件，MUST NOT 改為新增一條檢查它們是否一致的守則

#### Scenario: 該結構存在合理例外

- **WHEN** 部分頁面因性質不同而不適用該結構
- **THEN** 那些頁面不使用該元件即可，MUST NOT 為此在守則裡開豁免清單

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

### Requirement: 動作控制項的權限呈現規則

動作控制項在不可用時 SHALL 依**限制的來源**決定呈現方式，全 codebase 只有一套規則。

| 限制來源 | 呈現 | 理由 |
| --- | --- | --- |
| **權限不足**（列內動作） | **隱藏** | 一列可能有多個動作，把要不到的權限逐列 disabled 給人看沒有意義，只是噪音 |
| **資料狀態不允許** | **disabled + tooltip 說明原因** | 那是可以改變的狀態，使用者需要知道差在哪 |

- 因權限不足而隱藏時，MUST NOT 連帶隱藏同一個容器內不需要該權限的動作
  （例如「檢視」不需要編輯權限，dropdown 本身仍要能開啟）。
- 因資料狀態 disabled 時，tooltip MUST 說明**具體原因**
  （「預設角色不可編輯」「角色有 N 位使用者」），MUST NOT 只寫「不可用」。
- **頁面級的限制**（整個路由需要某權限）不套用本規則，由路由守衛處理，
  見「路由保護」與「權限不足時就地顯示說明」。

這個分界原本**只存在於實作**：`RolesTable` 用 `{canEdit && …}` 隱藏、
用 `DisabledHint` 表示資料狀態，而 spec 寫著「不顯示**或** disabled」的二選一。
一條需求給兩個答案，等於沒有規則。

#### Scenario: 無編輯權限的列

- **WHEN** 使用者沒有該模組的 EDIT 權限
- **THEN** 列內的編輯 / 刪除動作隱藏，檢視動作仍在

#### Scenario: 有權限但資料狀態不允許

- **WHEN** 使用者有 EDIT 權限，但該列是預設角色
- **THEN** 編輯動作 disabled 並以 tooltip 說明「預設角色不可編輯」

#### Scenario: 對任何人都不可用的功能

- **WHEN** 某功能不透過角色權限指派（如安全管理）
- **THEN** MUST NOT 用 disabled 的控制項表達——那仍在說「這是可以勾的東西」；
  改為純說明並講出原因

