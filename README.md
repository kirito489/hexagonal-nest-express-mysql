# hexagonal-nest-monorepo

NestJS + React + shadcn 全端 monorepo 初始包。後端採六角架構（Hexagonal Architecture），前端為 admin SPA，API 契約透過 OpenAPI 共享。

技術棧、架構、慣例的完整說明在 **`openspec/project.md`**（單一事實來源）。本檔只負責 onboarding。

## Monorepo 結構

```
hexagonal-nest-express-mysql/
├── apps/
│   ├── api/         # NestJS 後端
│   └── web/         # React + Vite admin SPA
└── packages/
    └── api-client/  # OpenAPI → TS 型別 + TanStack Query hooks
```

## 環境需求

- Node.js **20+**（建議用 nvm）
- pnpm **11+**（透過 corepack 啟用：`corepack enable`）
- MySQL / MariaDB
- Redis

## 快速開始

```bash
# 1. 安裝依賴（root 一次裝完）
pnpm install

# 2. 設定後端環境變數（見下方「必填環境變數」）
cp apps/api/.env.example apps/api/.env
# 編輯 apps/api/.env

# 3. 建立資料庫 + 跑 migration + seed
pnpm --filter @app/api db:create
pnpm --filter @app/api db:migrate
pnpm --filter @app/api db:seed

# 4. 產生 Prisma client + 前端 API 型別（首次必跑）
pnpm --filter @app/api db:generate
pnpm --filter @app/api swagger:bundle
pnpm --filter @app/api-client generate

# 5. 一鍵啟動前後端
pnpm dev
```

啟動後：

- 後端 API：後台 `http://localhost:3000/api/admin/*`、前台 `http://localhost:3000/api/front/*`
- Swagger UI：後台 `http://localhost:3000/api/admin/docs`、前台 `http://localhost:3000/api/front/docs`（兩份獨立文件；只有後台那份餵給 `packages/api-client`）
- 健康檢查：`http://localhost:3000/api/health`（liveness）、`/api/health/ready`（readiness，探 DB + Redis）
- 前端 admin：`http://localhost:5173`（dev proxy `/api` → 後端）

## 常用指令

```bash
# 開發
pnpm dev                                      # 並行啟動前後端
pnpm --filter @app/api dev                    # 只啟動後端
pnpm --filter @app/web dev                    # 只啟動前端

# 上 commit 前必跑
pnpm typecheck                                # 三個 workspace 全部 tsc --noEmit
pnpm lint
pnpm test                                     # 單元測試 + 架構守則（快，開發時用）
pnpm --filter @app/api test:e2e               # 改 controller / 路由時加跑（走真 test DB：需本機 MySQL 的 *_test 庫；Redis 仍 mock）

# 品質檢查（CI 跑的就是這個）
pnpm test:cov                                 # 單元測試 + 覆蓋率門檻 + 架構守則
pnpm --filter @app/api test:arch              # 只跑架構守則（7 支規則檔 / 20 項斷言，約 0.2 秒）
pnpm --filter @app/api swagger:check          # 驗證 swagger bundle 與 api-client 產物是否最新（產物寫入 tmp，不動工作目錄）

# 改後端 controller / Swagger 後同步前端型別
pnpm --filter @app/api swagger:bundle
pnpm --filter @app/api-client generate
```

**完整指令參考**（含 db、shadcn、build 等）：`openspec/project.md` → 「完整指令參考」。

## 新增功能模組

**不要手刻**，用產生器：

```bash
pnpm --filter @app/api gen:module <name>            # 後台模組 → /api/admin/<names>
pnpm --filter @app/api gen:module <name> --front    # 前台模組 → /api/front/<names>
```

會一次產出六角分層的完整骨架（port in/out、service + spec、facade、controller + Zod DTO、Prisma repo、domain exception、module），並自動：

- 註冊進 `app.module.ts`
- 注入錯誤碼與訊息到 `response-codes.ts` / `response-messages.ts`
- 產出 swagger yaml 骨架、註冊進 `openapi.yaml`，並重跑 `swagger:bundle` 與 api-client `generate`

**產出物零手改即通過 `typecheck` / `lint` / 架構守則**，你只需要補 Prisma model 與實際欄位（產生器結尾會列出手動步驟）。

## 品質防線

專案的規則不靠自律，而是**違反了就會有東西失敗**：

| 防線 | 守什麼 | 何時跑 |
| --- | --- | --- |
| TypeScript | 錯誤碼與訊息表的完整性（少一條就編譯失敗） | 隨時 |
| eslint import 邊界 | controller 不得碰持久層、前後台不得互穿、前端下層不得反向相依 routes | `pnpm lint` |
| 架構守則測試 | 不得用原生 `Error`、錯誤碼單一真相、env 必進 schema、API 契約三段同步… | `pnpm test` |
| 覆蓋率門檻 | api 70/60/70/70、web 75/75/60/75 | `pnpm test:cov` |
| GitLab CI | 上述全部 + e2e（MySQL service container） | Merge Request 與 develop / master 推送 |

`git commit --no-verify` 繞得過 husky，繞不過 CI。規則細節見 `openspec/specs/engineering-guardrails/spec.md`。

## 單一埠部署（選用）

預設 dev 前後端分開（Vite 5173 proxy `/api` → 後端 3000）。正式環境可由後端**一個埠**同時服務前端與 API：

1. `pnpm build`（產出 `apps/api/dist` 與 `apps/web/dist`）
2. 設 `WEB_STATIC_ROOT` 指向前端 `dist`（未設則由 api 相對自身編譯輸出找 `apps/web/dist`）
3. `pnpm --filter @app/api start:prod` → 同一 origin 提供 SPA + `/api`（深層 SPA 路由 fallback 回 `index.html`，`/api/*` 不被攔截）

未 build 前端（或純 API 部署）時自動略過靜態掛載，不影響 API。

## 必填環境變數

`apps/api/.env` 啟動時若缺以下任一會立即 exit(1)：

| 變數              | 說明                                       |
| ----------------- | ------------------------------------------ |
| `DB_HOST`         | 資料庫主機                                 |
| `DB_USERNAME`     | 資料庫使用者                               |
| `DB_DATABASE`     | 資料庫名稱                                 |
| `ACCESS_SECRET`   | JWT Access Token 簽名金鑰（≥ 32 字元）     |
| `REFRESH_SECRET`  | JWT Refresh Token 簽名金鑰（≥ 32 字元）    |
| `COOKIE_SECRET`   | Cookie 簽名金鑰（≥ 32 字元）               |

產生隨機 secret：

```bash
openssl rand -hex 32
```

跑 e2e 還需要一項（平時可不設）：

| 變數                | 說明                                                                 |
| ------------------- | -------------------------------------------------------------------- |
| `DB_TEST_DATABASE`  | e2e 專用測試庫名稱，**名稱必須含 `test`** —— globalSetup 會守門檢查，防止誤連 / 誤清 dev、prod 庫 |

完整環境變數（含選填項目、功能開關、密碼策略、reCAPTCHA、AWS、SMTP 等）見 `apps/api/.env.example`。

### 生產環境強制驗證

`NODE_ENV=production` 時，啟動會額外檢查並拒絕：

- `CORS_ORIGIN=*`、`DB_PASSWORD` 為空
- `ACCESS_SECRET` / `COOKIE_SECRET` 含預設佔位符或長度不足
- `BCRYPT_ROUNDS < 12`

## 常見啟動問題

| 症狀                                                             | 原因 / 解法                                                                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| typecheck 報「Property X does not exist on PrismaService」一堆   | Prisma client 沒生成。跑 `pnpm --filter @app/api db:generate`（`predev` / `prebuild` 已自動處理） |
| `pnpm dev` 啟動報 `Cannot find module '.../dist/main'`          | TS incremental cache 跟 nest deleteOutDir 衝突。刪 `apps/api/dist/.tsbuildinfo` 後重跑           |
| 登入回 `pool timeout: failed to retrieve a connection`           | Docker MySQL 剛啟動還沒完全 ready，等 10 秒重試                                                  |
| 後端啟動印 `[FCM] / [S3] 憑證未設定`                             | 未設定的選填功能 debug 訊息，可忽略；正式要用再填 `FCM_*` / `AWS_*` 環境變數                       |
| e2e 報 `DB_TEST_DATABASE … 名稱須含 "test"`                      | 守門機制生效中。在 `.env` 設一個含 `test` 的測試庫名（如 `myapp_test`），庫不存在會自動建           |
| 架構守則測試失敗                                                  | 訊息會直接指出違規的 `檔案:行號` 與修正方式。規則清單見 `openspec/specs/engineering-guardrails/spec.md` |
| swagger 相關的架構測試紅                                          | controller 與 yaml 不同步。補 `docs/swagger/<side>/` 的 yaml 後跑 `swagger:bundle` + api-client `generate` |

## 想看更多

| 想知道                          | 看哪裡                                          |
| ------------------------------- | ----------------------------------------------- |
| 技術棧、目錄細節、慣例規則      | `openspec/project.md`                           |
| 後端 RBAC、認證、API 回應格式   | `openspec/project.md` 之「後端架構」「認證流程」 |
| 前端 API 呼叫、表單、shadcn     | `openspec/project.md` 之「前端架構」            |
| 架構守則有哪些、怎麼加新規則    | `openspec/specs/engineering-guardrails/spec.md`、`openspec/project.md` 之「架構守則測試」 |
| CI 各 job 職責與對應的本機指令  | `openspec/project.md` 之「CI（GitLab）」        |
| 已踩過的坑與決定                | `tasks/lessons.md`                              |
| 開發中 / 已封存的 change        | `openspec/changes/`、`openspec/changes/archive/` |
| API spec（互動式）              | `http://localhost:3000/api/admin/docs`（啟動後可用） |

## License

ISC
