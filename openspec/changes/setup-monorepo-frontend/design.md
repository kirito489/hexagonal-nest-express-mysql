## Context

目前 repo 只有 NestJS 後端，所有檔案都在 root。`openspec/specs/` 為空，屬於 fresh setup 狀態。後端使用 `npm` + `package-lock.json`，Prisma 7 + MariaDB，Swagger 採分檔 + `$ref` 結構，bundle 後給 `main.ts` 載入。

本次調整時機：

- 後端尚未上線，可承受 BREAKING 重構。
- 前端尚未開始，骨架選擇空間最大。
- 採 monorepo 一次到位，避免日後再搬一次。

## Goals / Non-Goals

**Goals：**

- 建立 `apps/api` + `apps/web` + `packages/api-client` 的 pnpm workspace 結構。
- 後端業務程式碼**不修改**，只搬路徑與調整工具設定。
- 前端 admin 採可長期擴充的技術棧（Vite + React 19 + shadcn + TanStack Query + React Router v7 + zod）。
- 後端 OpenAPI 改動可在前端編譯期捕捉（型別安全 client）。
- 前後端可在 root 一鍵啟動（`pnpm dev`）。

**Non-Goals：**

- 不導入 i18n 框架（UI 文字全部繁中 hardcode）。
- 不導入 Storybook、E2E（Playwright）、CI/CD 改造，留待後續 change。
- 不引入 Turborepo 或 Nx（pnpm workspace + concurrently 已足夠，避免過早優化）。
- 不導入 SSR（Vite SPA 足以滿足 admin 需求）。
- 不重新設計後端架構（Hexagonal、Prisma、Swagger 結構維持原樣）。
- 不處理 Docker、GitLab CI 重寫（路徑改變後若 break 再單獨開 change）。

## Decisions

### D1：套件管理改用 pnpm

- **選擇**：pnpm（>=9）+ Corepack 鎖版本。
- **替代方案**：保持 npm workspaces、改用 yarn workspaces。
- **理由**：
  - pnpm workspace `filter` 比 npm workspaces 直覺，dependency hoisting 更可控。
  - 全域 user CLAUDE.md 指定 pnpm > npm > yarn。
  - 對 monorepo 規模（apps/api + apps/web + packages/api-client）效益最大。

### D2：Workspace 目錄結構

```
hexagonal-nest-express-mysql/
├── apps/
│   ├── api/              # 現有 NestJS 全部搬入
│   └── web/              # 新增 Vite + React admin
├── packages/
│   └── api-client/       # OpenAPI 產生的 TS client
├── openspec/             # 保留於 root
├── tasks/                # 保留於 root
├── pr/                   # 保留於 root
├── docs/                 # 保留於 root
├── CLAUDE.md             # 保留於 root
├── package.json          # workspace root
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
└── tsconfig.base.json
```

- `openspec/` 留 root：spec 涵蓋整個 monorepo（後端、前端、共用 package 都需要 spec）。
- `tasks/` 留 root：lessons 與 todo 跨整個 repo。
- `.env` 留 `apps/api/`：只有後端需要，前端用 Vite 環境變數。

### D3：Workspace 套件命名

- `@app/api`：後端
- `@app/web`：前端
- `@app/api-client`：共用 OpenAPI client

選擇 `@app/*` 而非具體公司 scope，方便此 starter pack 被 fork 後依專案改名。

### D4：前端核心技術棧

| 領域     | 選擇                           | 替代方案                           | 理由                                                |
| -------- | ------------------------------ | ---------------------------------- | --------------------------------------------------- |
| 建構工具 | Vite 7                         | Next.js、Remix                     | SPA 已足夠，不需 SSR；Vite dev server 啟動快        |
| UI 框架  | React 19                       | Vue、Svelte                        | 與後端 TS 生態一致，shadcn 原生支援                 |
| 樣式     | Tailwind CSS v4                | CSS Modules、styled-components     | shadcn 預設依賴，v4 不需要 PostCSS 設定             |
| 元件庫   | shadcn/ui                      | MUI、Ant Design                    | Copy-paste 元件落地，可完全客製                     |
| 路由     | React Router v7（declarative） | TanStack Router、v7 framework mode | 不需 file-based 路由，declarative 模式對 admin 足夠 |
| 資料層   | TanStack Query v5              | SWR、Redux Toolkit Query           | 與 openapi-fetch 整合最成熟                         |
| 表單     | react-hook-form + zod          | Formik、自寫                       | zod 與後端 DTO 驗證一致                             |
| 表格     | TanStack Table v8              | AG Grid                            | shadcn DataTable 即用此                             |
| Lint     | ESLint 9 + prettier            | Biome                              | 與後端設定一致                                      |
| 圖示     | lucide-react                   | heroicons                          | shadcn 預設                                         |

### D5：API client 產生策略

- **工具**：`openapi-typescript` 產生型別 + `openapi-fetch` 作為 runtime。
- **替代方案**：`orval`（產生完整 React Query hooks）、手寫 fetch wrapper。
- **理由**：
  - `orval` 產出檔案龐大且額外維護成本高。
  - `openapi-fetch` runtime 極輕（~3KB），完全靠 TS 型別保證安全。
  - 我們自行包薄薄一層 TanStack Query hooks，可控制錯誤處理、Auth header 注入等。
- **產生流程**：
  1. 後端改 controller / Swagger yaml。
  2. `pnpm --filter @app/api swagger:bundle` 重新打包 `openapi.bundle.yaml`。
  3. `pnpm --filter @app/api-client generate` 讀 bundle 產生 `src/schema.ts`。
  4. `schema.ts` git commit，不放 gitignore（讓 PR diff 可見 API 變動）。

### D6：Dev workflow

- root `package.json` 提供：
  - `pnpm dev`：用 `concurrently` 並行跑 `apps/api dev` + `apps/web dev`。
  - `pnpm build`：依序 `api-client build` → `apps/api build` → `apps/web build`。
  - `pnpm typecheck`：`pnpm -r typecheck`。
  - `pnpm lint`：`pnpm -r lint`。
- 前端 Vite dev server：5173（預設）；proxy `/api/*` 到 `http://localhost:3000`（後端）。
- 前端不啟動後端、後端不啟動前端，各自獨立可單獨跑。

### D7：認證流程（前端）

- 登入後 access token 存 `localStorage`（admin tool，非公開 web app，可接受）。
- TanStack Query 的 `queryFn` 統一從 `localStorage` 讀 token 注入 `Authorization` header。
- 401 全域 handler：清除 localStorage、跳回 `/login`。
- Refresh token 機制留待後續 change（目前後端有 `/auth/refresh` endpoint，前端先不自動 refresh）。

### D8：Tooling 設定共用方式

- Root `tsconfig.base.json`：共用 `strict`、`target`、`module`、`paths` 別名。
- 各 workspace 自己的 `tsconfig.json` 用 `extends`。
- ESLint / Prettier：各 workspace 獨立設定（前後端規則差異大），不嘗試共用。
- VSCode `.vscode/settings.json` 若有的話需配合 monorepo 路徑調整（typescript.tsdk 等）。

## Risks / Trade-offs

- **[Risk] 後端搬路徑可能破壞 Prisma migration 工作目錄假設** → 在 `apps/api/package.json` 的 `prisma` scripts 用 `--schema=prisma/schema.prisma`（相對 `apps/api/`），並驗證 `npm run db:migrate` 仍可跑。
- **[Risk] `pino-roll` 寫 log 的相對路徑可能因 cwd 改變而落到錯誤位置** → 啟動時 `process.cwd()` 應該是 `apps/api/`（透過 `pnpm --filter` 跑），驗證 log 仍寫到 `apps/api/logs/`。
- **[Risk] e2e `test/jest.e2e.config.js` 用相對路徑找 `.env.test`** → 搬完後重跑 e2e 驗證。
- **[Risk] OpenAPI bundle 路徑改變後 `main.ts` 找不到 yaml** → `apps/api/main.ts` 內讀 `openapi.bundle.yaml` 的路徑保持相對 `apps/api/`。
- **[Risk] root + workspace 兩層 `node_modules`、IDE TypeScript Server 抓到錯版本** → root `package.json` 設 `packageManager: pnpm@x`，並在 `tsconfig.base.json` 設定 paths，IDE 重啟。
- **[Trade-off] 不導入 Turborepo** → 任務數量少（dev / build / lint / typecheck），手動 `pnpm -r` 已足夠；日後 build 變慢再評估。
- **[Trade-off] api-client 不用 orval** → 失去自動生成 React Query hooks 的便利，多一點手寫 wrapper；換來檔案數少、依賴少、可控。
- **[Trade-off] access token 放 localStorage** → 有 XSS 風險。admin 工具且使用者可控，接受此風險換取簡單性；正式 production 若有疑慮再改 httpOnly cookie。

## Migration Plan

採三階段執行，每階段獨立可驗證，可暫停：

1. **階段一：搬後端 + 改 pnpm**
   - 建 `apps/api/`，搬所有後端檔案。
   - 建 root `package.json`、`pnpm-workspace.yaml`、`tsconfig.base.json`。
   - 刪 `package-lock.json`、跑 `pnpm install`。
   - 驗證：`pnpm --filter @app/api typecheck`、`lint`、`test`、`test:e2e`、`swagger:bundle` 全綠。

2. **階段二：建 `apps/web/`**
   - `pnpm create vite apps/web` 初始化。
   - 加 Tailwind v4、shadcn、React Router、TanStack Query、表單、表格。
   - 寫一個 login 頁 + 一個受保護的 home 頁作為骨架。
   - 驗證：`pnpm --filter @app/web dev` 可啟動，proxy 到後端登入 API 成功。

3. **階段三：建 `packages/api-client/`**
   - 加 `openapi-typescript`、`openapi-fetch`、`@tanstack/react-query` peer。
   - 寫 generate script 讀 `apps/api` 的 bundle。
   - 包出基本 hooks（`useApi(...).useQuery / useMutation`）。
   - 把 `apps/web` 的 login 改為使用 api-client。
   - 驗證：前端登入流程走 generated client，型別正確。

**回退策略**：每階段對應一個獨立 commit；若某階段失敗，可 `git revert` 回前一階段。階段一風險最高（牽動所有後端工具），優先驗證完整再進階段二。

## Open Questions

- 是否需要把 `swagger:bundle` 加進 git pre-commit hook 或 husky？目前傾向**先不加**，避免引入新工具；改用 CI 檢查 `openapi.bundle.yaml` 是否與 source yaml 同步。
- VSCode workspace settings 是否需要拆成 multi-root？目前傾向單一 root + 各子目錄獨立設定。
- 前端是否需要環境變數區分（dev / staging / prod）？目前傾向**最小化**：只區分 dev（`/api` proxy 到 localhost）與 prod（同網域）；不導入 `.env` 分層。
