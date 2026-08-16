> 每一塊（`##` 標題）須能獨立通過驗證鏈：
> `pnpm build（root，跨三個 workspace）`
> 綠燈後給 commit 指令，由使用者手動執行，再進下一塊。
>
> 〔檔頭補寫於 2026-08-16 的 openspec 慣例整理。驗證鏈取自本檔各塊當時實際記錄的結果，塊與任務內容維持原樣未改。〕

## 1. 前置作業

- [x] 1.1 確認當前 working tree 乾淨（`git status` 無未提交變更）
- [x] 1.2 確認 Node 版本 ≥ 20（`node -v`）
- [x] 1.3 啟用 corepack 並鎖定 pnpm 版本（改用 root `package.json` 的 `packageManager` 欄位鎖版本，作用域限本專案）
- [x] 1.4 在 develop 分支基礎上建立工作分支（使用者選擇直接在 develop 上實作）

## 2. 階段一 / 建立 workspace 骨架

- [x] 2.1 建立 `apps/`、`packages/` 目錄
- [x] 2.2 建立 `apps/api/` 目錄作為後端搬入目的地
- [x] 2.3 建立 root `pnpm-workspace.yaml`，內容為 `packages: ['apps/*', 'packages/*']`
- [x] 2.4 建立 root `tsconfig.base.json`，包含 strict、target ES2022、共用 lib 等設定
- [x] 2.5 建立暫用 root `package.json`（`private: true`、`packageManager: pnpm@<version>`、name: `hexagonal-monorepo`）

## 3. 階段一 / 搬移後端檔案到 `apps/api/`

- [x] 3.1 用 `git mv` 將 `src/`、`prisma/`、`test/`、`seeds/`、`scripts/` 搬入 `apps/api/`（含 `docs/` 因實際只含 swagger 後端 yaml，併入 `apps/api/docs/`）
- [x] 3.2 用 `git mv` 將 `nest-cli.json`、`tsconfig.json`、`tsconfig.build.json`、`tsconfig.scripts.json` 搬入 `apps/api/`
- [x] 3.3 用 `git mv` 將 `prisma.config.ts`、`.eslintrc.js`、`.prettierrc` 搬入 `apps/api/`
- [x] 3.4 用 `git mv` 將 `.env.example` 搬入 `apps/api/`（本機無 `.env`）
- [x] 3.5 寫新的 root `package.json` + 新建 `apps/api/package.json`（內容同原 root，`name` 改為 `@app/api`）
- [x] 3.6 從 `apps/api/package.json` 移除 `@fission-ai/openspec` devDep（已加進 root）
- [x] 3.7 刪除原 root `package-lock.json`、root `node_modules/`、root 殘留 `dist/`
- [x] 3.8 `apps/api/tsconfig.json` 改為 `"extends": "../../tsconfig.base.json"`，移除已在 base 中重複的設定
- [x] 3.9 `.gitignore` 更新：加入 `.pnpm-store/`、`.pnpm-debug.log*`、`.vite/`（既有 `node_modules/`、`dist/` 等 bare pattern 已自動覆蓋所有 workspace）

## 4. 階段一 / Root 設定與指令

- [x] 4.1 root `package.json` 加入 `devDependencies`：`@fission-ai/openspec`、`concurrently`
- [x] 4.2 root `package.json` 加入 scripts：`dev`（concurrently 並行）、`build`（依序）、`typecheck`、`lint`、`test`（皆 `pnpm -r`）
- [x] 4.3 root 執行 `pnpm install`，產生 `pnpm-lock.yaml`；新增 `pnpm-workspace.yaml` 的 `allowBuilds` 段核准 prisma / bcrypt 等 native build
- [x] 4.4 驗證 `pnpm --filter @app/api typecheck` 全綠（須先 `pnpm db:generate` 產 Prisma client）
- [x] 4.5 驗證 `pnpm --filter @app/api lint` 全綠
- [x] 4.6 驗證 `pnpm --filter @app/api test` 全綠（13 suites / 86 tests）
- [x] 4.7 驗證 `pnpm --filter @app/api test:e2e` 全綠（4 suites / 71 tests，需 MySQL + Redis 在 localhost）
- [x] 4.8 驗證 `pnpm --filter @app/api swagger:bundle` 仍可產生 `apps/api/docs/swagger/openapi.bundle.yaml`
- [x] 4.9 略過 `pnpm dev` 即時驗證（需 `.env`，由使用者自行驗證）；改以 `pnpm build` 驗證後端可建置
- [x] 4.10 階段一收尾：commit `fb07cba refactor: 後端搬入 apps/api、改用 pnpm workspace`

## 5. 階段二 / 建立 `apps/web/` 骨架

- [x] 5.1 用 `pnpm create vite apps/web --template react-ts` 初始化前端
- [x] 5.2 `apps/web/package.json` 改 `name` 為 `@app/web`、加 `private: true`、加 `typecheck` script
- [x] 5.3 `apps/web/tsconfig.app.json` 與 `tsconfig.node.json` 改為 `"extends": "../../tsconfig.base.json"`（root tsconfig 保持 Vite 預設的 project references 結構）
- [x] 5.4 設定 Tailwind CSS v4（`tailwindcss` + `@tailwindcss/vite` 外掛、`@import 'tailwindcss';` 載入）
- [x] 5.5 設定 shadcn：`pnpm dlx shadcn@latest init -t vite -b radix -p nova --no-monorepo --no-reinstall --force --yes`（base color: neutral）
- [x] 5.6 確認 `apps/web/components.json`、`apps/web/src/lib/utils.ts`、`apps/web/src/components/ui/button.tsx` 已建立
- [x] 5.7 安裝核心依賴：`react-router-dom@7`、`@tanstack/react-query`、`@tanstack/react-query-devtools`、`@tanstack/react-table`、`react-hook-form`、`@hookform/resolvers`、`zod`、`lucide-react`（最後一項由 shadcn 安裝）
- [x] 5.8 設定 `apps/web/vite.config.ts`：path alias `@/*`、Tailwind plugin、`server.proxy['/api']` → `http://localhost:3000`

## 6. 階段二 / 前端基本結構與頁面

- [x] 6.1 建立 `apps/web/src/lib/storage.ts`（tokenStorage 封裝 localStorage 存取，shadcn 已產 `utils.ts`）
- [x] 6.2 建立 `apps/web/src/api/fetch.ts`：全域 fetch wrapper（注入 Bearer token、處理 401、剝 `{ success, data, timestamp }` 外殼、自訂 `ApiError`）
- [x] 6.3 建立 `apps/web/src/api/query-client.ts`：共用 `QueryClient`（admin 工具用 `refetchOnWindowFocus: false`）
- [x] 6.4 建立 `apps/web/src/routes/_layout.tsx`：Sidebar 骨架（首頁項 + 登出按鈕）
- [x] 6.5 建立 `apps/web/src/routes/login/page.tsx`：登入頁，react-hook-form + zod，繁中文案
- [x] 6.6 建立 `apps/web/src/routes/home/page.tsx`：登入後預設首頁（Card 提示文）
- [x] 6.7 建立 `apps/web/src/components/RequireAuth.tsx`：路由保護 guard，把 from path 放進 location.state
- [x] 6.8 設定 `apps/web/src/App.tsx`：React Router + QueryClientProvider + TooltipProvider，dev 載入 React Query Devtools
- [x] 6.9 用 shadcn 加入 `input`、`label`、`card`、`sidebar`（含 `sheet`、`separator`、`tooltip`、`skeleton`、`use-mobile` hook）；`form` registry 缺檔，自寫 form.tsx（標準 shadcn 模板）
- [x] 6.10 驗證 `pnpm --filter @app/web typecheck` 全綠
- [x] 6.11 驗證 `pnpm --filter @app/web build` 全綠（dist 470KB / gzip 147KB）

## 7. 階段二 / 後端 CORS 與整合測試

- [x] 7.1 `apps/api/src/main.ts` 擴充 CORS 為 comma-separated 多 origin；`.env.example` 預設 `http://localhost:3000,http://localhost:5173`
- [x] 7.2 root 執行 `pnpm dev`，確認前後端皆啟動、輸出帶有 prefix（需 `apps/api/.env` 設好，由使用者執行）
- [x] 7.3 手動測試：瀏覽器開 `http://localhost:5173/login`，輸入 seed 帳號可登入並跳轉 `/`（使用者執行）
- [x] 7.4 手動測試：未登入存取 `/` 自動跳 `/login`（使用者執行）
- [x] 7.5 手動測試：刪掉 `localStorage.access_token` 後重新整理 → 自動跳 `/login`（使用者執行）
- [x] 7.6 階段二收尾：commit（訊息建議 `feat: 新增 apps/web admin SPA 骨架`）

## 8. 階段三 / 建立 `packages/api-client/`

- [x] 8.1 建立 `packages/api-client/{src,package.json,tsconfig.json}` 結構
- [x] 8.2 `package.json`：name `@app/api-client`、type module、source-first 設計（`main`/`types`/`exports` 直接指向 `src/index.ts`，由 Vite 編譯 TS，省略 dist build 階段）
- [x] 8.3 安裝依賴：`openapi-fetch` (dep)、`openapi-typescript` + `openapi-typescript-helpers` (devDep)；peer：`react`、`@tanstack/react-query`
- [x] 8.4 `generate` script：`openapi-typescript ../../apps/api/docs/swagger/openapi.bundle.yaml -o src/schema.ts`
- [x] 8.5 執行 `pnpm --filter @app/api-client generate`，產生 2071 行 schema
- [x] 8.6 實作 `src/client.ts`：`createApiClient(baseUrl, getToken?)` 包裝 `openapi-fetch`，用 `client.use({onRequest})` 注入 Bearer
- [x] 8.7 實作 `src/hooks.ts`：`createApiQueryHooks(client)` → `useApiQuery('GET', path)` / `useApiMutation('POST', path)`；ExtractResponse 自動 unwrap `{success, data, timestamp}` 外殼；runtime 也用 `unwrapEnvelope` helper 對齊
- [x] 8.8 `src/index.ts`：re-export schema 型別、client factory、hooks factory
- [x] 8.9 tsconfig：`extends ../../tsconfig.base.json`、`noEmit: true`（不產 dist，避免雙重 source-of-truth）
- [x] 8.10 驗證 `pnpm --filter @app/api-client typecheck` 全綠

## 9. 階段三 / 後端 OpenAPI 補強 + 前端改用 `@app/api-client`

- [x] 9.0 **後端 swagger yaml 補強**（順帶改）：9 個用 `$ref: SuccessResponse` 的 yaml 改為 inline 寫完整 `{success, data: <具體 shape>, timestamp}`，跟 `profile/get-me.yaml` 同 convention，讓 openapi-typescript 可推導 data 具體型別；同步修正 yaml 內 `ip` → `ipAddress` 與 code 對齊
- [x] 9.1 `apps/web/package.json` 加入 `"@app/api-client": "workspace:*"`
- [x] 9.2 root `pnpm install` 已自動解析 workspace 依賴
- [x] 9.3 建立 `apps/web/src/api/client.ts`：`createApiClient('/api', tokenStorage.get)`，並用 `.use({onResponse})` middleware 處理 401 全域清 token 跳 login
- [x] 9.4 同檔案 export `useApiQuery`/`useApiMutation`（hooks 從 `createApiQueryHooks(apiClient)` 拿）
- [x] 9.5 `routes/login/page.tsx` 改用 `useApiMutation('POST', '/auth/login')`，刪掉原 `apiFetch` import
- [x] 9.6 `routes/home/page.tsx` 用 `useApiQuery('GET', '/me')` 示範，欄位 `email/member/roleName` 直接 autocomplete
- [x] 9.7 IDE 型別補全已驗證（typecheck 通過 = TS 推導正確）
- [x] 9.8 `pnpm --filter @app/web typecheck` 全綠、`build` 全綠（dist 483KB / gzip 152KB）
- [x] 9.9 刪除過時的 `apps/web/src/api/fetch.ts`（被 api-client 取代）
- [x] 9.10 手動測試：登入流程透過 generated client 完整跑通（使用者已驗證）
- [x] 9.11 階段三收尾：commit `d7fe952 feat: 新增 packages/api-client 並整合至 apps/web`

## 10. 驗證與收尾

- [x] 10.1 root 執行 `pnpm install` 確認 lockfile 穩定（`Already up to date`）
- [x] 10.2 root 執行 `pnpm typecheck` 三個 workspace 全綠（需先跑 `pnpm --filter @app/api db:generate`，pnpm install 會 unhook Prisma client symlink）
- [x] 10.3 root 執行 `pnpm lint` 全綠（修正 `apps/api/src/main.ts` prettier、為 `apps/web/eslint.config.js` 加 shadcn 檔案 rule overrides）
- [x] 10.4 root 執行 `pnpm test` 全綠（後端 13 suites / 86 tests）
- [x] 10.5 root 執行 `pnpm --filter @app/api test:e2e` 全綠（4 suites / 71 tests）
- [x] 10.6 root 執行 `pnpm build` 全綠（root build script 移除 api-client，因 source-first 無 build；apps/api `nest build`、apps/web `tsc -b && vite build`）
- [x] 10.7 root 執行 `pnpm dev` 前後端可同時啟動（需 `apps/api/.env`，由使用者驗證）
- [x] 10.8 更新 root `CLAUDE.md`：commands 全改 pnpm，新增 Monorepo 結構、前端目錄、shadcn / swagger inline / standardSchemaResolver 等慣例
- [x] 10.9 更新 `README.md`：標題改 hexagonal-nest-monorepo、技術棧分前後端 + api-client、新增 monorepo 結構與前端目錄、快速開始改 pnpm 與 `apps/api/.env` 路徑、指令參考全改 pnpm
- [x] 10.10 確認 `.gitignore` 涵蓋產出：bare pattern `dist/`、`.vite/`、`.pnpm-store/` 已含
- [x] 10.11 lessons 累積 6 條（前面階段已陸續加：standardSchemaResolver、shadcn form、TS6 baseUrl、pnpm allowBuilds、Prisma monorepo、swagger inline shape）
- [x] 10.12 邀請 `openspec-archive-change` 走完整封存流程
