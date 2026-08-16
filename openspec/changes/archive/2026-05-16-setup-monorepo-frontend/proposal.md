## Why

目前 repo 只有 NestJS 後端，缺少前端管理介面（admin）。同時專案剛起步，仍適合一次性把結構調整為前後端共用的 monorepo，避免日後再大規模搬動。透過 pnpm workspace 與從 OpenAPI 產生的型別安全 client，前端可以共享後端 Swagger 契約，後端改動立即反映到前端型別。

## What Changes

- **BREAKING** 將現有 NestJS 後端從 repo root 搬入 `apps/api/`，所有相對路徑、scripts、設定檔同步調整。
- **BREAKING** 套件管理工具從 `npm` 改為 `pnpm`，刪除 `package-lock.json`、新增 `pnpm-lock.yaml` 與 `pnpm-workspace.yaml`。
- 新增 `apps/web/`：Vite 7 + React 19 + TypeScript 5 + Tailwind CSS v4 + shadcn/ui + React Router v7 + TanStack Query + react-hook-form + zod + TanStack Table 的 admin SPA。
- 新增 `packages/api-client/`：以 `openapi-typescript` 從 `openapi.bundle.yaml` 產生 TS 型別、`openapi-fetch` 作為 runtime client，並包出 TanStack Query hooks。
- 新增 root `package.json`、`tsconfig.base.json`，作為 workspace 共用設定。
- 新增 root 一鍵開發指令 `pnpm dev`（用 `concurrently` 並行跑 `apps/api` 與 `apps/web`）。
- `openspec/`、`tasks/`、`CLAUDE.md`、`pr/`、`docs/` 留在 repo root，繼續作為整個 monorepo 的 meta 文件。
- `.env`、`.env.example` 留在 `apps/api/`，前端不直接讀後端環境變數。
- UI 文字、註解一律使用繁體中文，不導入 i18n 框架。

## Capabilities

### New Capabilities

- `platform-monorepo-workspace`：pnpm workspace 的目錄結構、scripts 命名慣例、共用 tsconfig 與依賴管理規則。
- `platform-frontend-conventions`：admin SPA 的技術選型、路由架構、認證流程、UI 套件慣例、與後端 API 互動方式。
- `platform-api-client-generation`：OpenAPI bundle 產生 TypeScript client 與 React Query hooks 的流程與輸出規範。

### Modified Capabilities

（無；`openspec/specs/` 目前為空，本次屬於初次建立規範）

## Impact

- **Backend 路徑全面改變**：`src/`、`prisma/`、`test/`、`seeds/`、`scripts/`、`nest-cli.json`、`tsconfig*.json`、`prisma.config.ts`、`.env.example`、`.eslintrc.js`、`.prettierrc` 全部從 root 搬入 `apps/api/`。
- **NPM scripts 改寫**：原本 `npm run dev` 等指令改由 `pnpm --filter @app/api dev`（或 root alias）執行；CI 與本機開發者腳本需更新。
- **Swagger bundle 路徑改變**：`openapi.yaml` 與 `openapi.bundle.yaml` 隨 `apps/api/` 一起搬，`packages/api-client/` 透過 workspace 相對路徑或 root path 讀取。
- **Prisma 命令**：`prisma migrate`、`prisma generate`、`prisma studio` 改在 `apps/api/` 工作目錄執行。
- **`.gitignore`**：需新增 `apps/web/node_modules`、`apps/web/dist`、`packages/api-client/dist`、`.pnpm-store` 等。
- **`.gitlab/`、`.vscode/`**：CI 與 IDE 設定可能需重寫工作目錄。
- **依賴**：root 新增 `@fission-ai/openspec`、`concurrently`、`pnpm`（依規範可選 corepack）。
- **未影響**：`openspec/`、`tasks/`、`pr/`、`docs/`、`CLAUDE.md` 結構維持不變；後端業務程式碼（`src/` 內容）只搬位置、不改內容。
