# frontend-admin Specification

## Purpose
TBD - created by archiving change setup-monorepo-frontend. Update Purpose after archive.
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

`apps/web/` 受保護的路由 SHALL 透過共用 guard 元件檢查登入狀態。

- 受保護路由 MUST 在沒有 `access_token` 時自動導向 `/login`。
- `/login` 路由 MUST 在已有 token 時自動導向 `/`，避免重複登入。

#### Scenario: 未登入存取首頁

- **WHEN** 沒有 `localStorage.access_token` 的使用者瀏覽 `/`
- **THEN** 自動導向 `/login`

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

