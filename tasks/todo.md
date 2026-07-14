# TODO

_跨 session 追蹤的待辦與跨模組事項。待處理依優先序在上，完成的歸到下方並按日期分組。_

---

## 待處理

### 安全強化（專案審查延伸）

- [ ] **全域 JwtAuthGuard（預設拒絕）** `審查#7` — 將 `JwtAuthGuard` 從各 controller 的 `@UseGuards` 提升為 `APP_GUARD`，並以 `@Public()` decorator 白名單標記 login / refresh / forgot-password 等公開路由，改成「預設拒絕、明示放行」，避免未來新 controller 漏掛認證即裸奔。需同步調整全部 e2e（公開路由標 `@Public`）。
- [ ] **refresh token 重用連坐撤銷** `審查#10` — rotation 偵測到「已黑名單 refresh 又被使用」時，除拒絕該次外應撤銷該使用者所有 session。需在 schema 加 `tokenVersion` 欄位（migration）並於簽發 / 驗證帶入比對。

### 功能

- [ ] **帳號鎖定管理 CRUD（add-account-lock-management）** — `add-security-ip-list-management` 的 Non-Goals 預留。後端 `GET/POST /api/security/locks`、`DELETE /api/security/locks/:id`（list 已鎖帳號 + 分頁 + 搜尋 / 手動鎖定 / 手動解鎖）；前端 `/security/account-locks` 列表頁，sidebar「安全」group 加第三條。沿用 SUPERADMIN role gate。

### 工程設置（kgie-nest-backend 借鏡，未完成批次）

- [ ] **六角模組產生器 `gen:module` + `module-template/`** — 一行 `pnpm gen:module <name>` 產出 port/service/facade/controller/dto/repo 骨架 + 自動註冊 `app.module`。kgie 是單 package 佈局，需改寫成 `apps/api` + `packages/api-client` 三 workspace 路徑（搬概念、重寫模板）。價值高、工多，獨立排期。
- [ ] **`init-project.sh` 模板初始化腳本** — 若要把本專案當「衍生專案母體」才值得（重設 package.json name / git 歷史 / reinstall）。

---

## 完成項目

### 2026-07-14

- [x] **借鏡 kgie-nest-backend 的工程設置（第一批 DX + ESLint 升級）** — typecheck / lint / test（api 211 + web 27）全綠：
  - `.vscode/extensions.json`：推薦擴充（prettier / eslint / prisma / tailwind）。
  - **ESLint 抽共用基底 `packages/eslint-config`**：api / web 皆 extends；基底只放 `ignores` + `js.recommended` + 家規（`houseRules` named export），tseslint 預設由各 workspace 自帶「一組」（避免 Cannot redefine plugin）。
  - **api 從 legacy `.eslintrc.js` 升級 flat config + type-checked（`recommendedTypeChecked`）**：對 `persistence` / `seeds` / `spec` 分區關 `no-unsafe-*`，核心層維持嚴格；加 `prelint: db:generate` 修生成依賴（未生成 client → 假陽性）。
  - type-checked 抓到並修掉 **9 個真發現**：`main.ts` bootstrap 未 catch 的 floating-promise（旗艦發現）、多處多餘 `as`、redis 錯誤未 narrow（`err.message` on any）、PasswordPolicy 冗餘型別（`RoleCode | string`）。
  - **Prettier 全 repo 統一根一份**：根 `.prettierrc`（`semi:true` + `singleQuote` + `trailingComma:all`）+ 根 `.prettierignore`（排除 `**/*.md`、生成檔、`prisma/migrations`、build/lockfile）+ 根 `format`/`format:check`。前端從 Vite 無分號 reformat 加回分號對齊（~107 檔），後端 0 churn；`.vscode` 補 `[typescriptreact]`/`[javascriptreact]` formatOnSave。詳見 lessons.md「ESLint / 工具鏈」。

### 2026-06-25

- [x] **從衍生專案 `ppt-shift-html-demo` 回補共用基建** — typecheck / lint / test(211) / e2e(116) 全綠：
  - 單一埠部署：加 `@nestjs/serve-static`，`app.module` 以 `ServeStaticModule.forRootAsync` 服務 `apps/web/dist`（`exclude: ['/api/{*path}']`、執行期偵測 `index.html`），env `WEB_STATIC_ROOT`；含 `forceServeStatic` e2e（override `AbstractLoader`→`ExpressLoader`）+ `serve-static.e2e-spec.ts`。
  - 排程骨架：加 `@nestjs/schedule` + `cron@4.4.0`，`ScheduleModule.forRoot()` + `SchedulerModule` + 通用 `ExampleScheduler`（`onModuleInit` 動態註冊、`SCHEDULE_ENABLED` 預設關）+ spec。
  - DB：`prisma.service.ts` 加 `allowPublicKeyRetrieval: true`（MySQL 9 本機 dev）。
  - CI：新增 `.gitlab-ci.yml` 共用骨架（install / build / cleanup / pr_agent，專屬值佔位化；部署 job 註解保留為參考範本）。
  - 未搬：TipTap 富文本（偏功能非基建）、PPT 專屬套件（fast-xml-parser / jszip / multer）。
  - 待補：`apps/api/.env.example` 因 `.env*` 受權限保護無法自動寫入，需手動補 `WEB_STATIC_ROOT` / `SCHEDULE_ENABLED` / `SCHEDULE_EXAMPLE_CRON`。

### 2026-05-30

- [x] **專案審查問題修補** — `/review-project` 發現的 15 項安全 / 健壯性問題，typecheck / lint / test / e2e(111) 全綠：
  - 密碼重設 token 改存 sha256；forgot / reset 加 `@Throttle` 並改回 `204`；forgot log 不再寫 email。
  - 新增 `TRUST_PROXY` env 並在 `main.ts` 設定；IP 黑名單取不到來源改 fail-closed。
  - 帳號鎖定 adapter 全 path 補 `deletedAt: null`（`isLocked` 改 `findFirst`）。
  - 外部服務（recaptcha / mail / s3 / firebase）+ Redis 連線加 timeout（Redis 另加 `pingInterval` 偵測 half-open）。
  - JWT 簽發 / 驗證加 issuer / audience（env `JWT_ISSUER` / `JWT_AUDIENCE`），`JwtPayload.type` 改必填。
  - Permission repo 改 `select` + interactive transaction；`findDefaultRoleId` 轉 `DefaultRoleNotFoundException`。
  - 前端 `api/client.ts` refresh 重發後仍 401 改導向登入。

- [x] **初始包基礎建設補強** — 安全與品質四項，typecheck / lint / test 全綠：
  - Helmet HTTP 安全標頭（`main.ts`，關 CSP 以相容 Swagger UI）。
  - 健康檢查升級 liveness `/health` + readiness `/health/ready`（@nestjs/terminus 探 DB `SELECT 1` + Redis `ping()`），含 Swagger 與 e2e。
  - 可觀測性：Sentry 錯誤追蹤 + Prometheus `/api/metrics`，皆 feature flag 預設關閉。
  - 測試覆蓋：後端 30.86% → 86.77%（補 17 個 spec），前端建 jsdom + coverage 基建並補元件 / hook 測試；前後端設保守 coverage 門檻。
