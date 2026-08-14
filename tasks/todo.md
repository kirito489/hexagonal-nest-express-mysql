# TODO

_跨 session 追蹤的待辦與跨模組事項。進行中 →  待處理（依優先序）→ 完成（按日期分組）。_

---

## 進行中

_(目前無)_

## 待處理

### 工程護欄（架構測試導入時發現）

- [ ] **剩餘 77 個傳遞依賴漏洞（已知狀態）** — `2026-08-14` 已把能直接控制的修完（overrides 機制修復 + js-yaml / vite / nodemailer 升級，85 → 77）。剩下的皆深埋在 `prisma` / `@nestjs/terminus` 等上游相依樹中（含 2 個 critical：`shell-quote`、`websocket-driver`），**刻意不加 override 強制提版**——相容風險大於收益，模板穩定性優先。追蹤方式：定期 `pnpm audit`，待上游更新後再跑一次升級；若某個漏洞出現實際可利用的攻擊面，再單獨評估 override。

- [ ] **首次 CI pipeline 需人工觀察** `add-ci-quality-gate` — CI 設定的正確性**無法在本機完全驗證**（YAML 結構、各 job 的 script 內容、e2e 的環境變數供應方式皆已本機驗證，但 runner 行為、cache 命中、service container 啟動時序只能在實際 pipeline 上確認）。首次推送後請檢查：(1) `quality-check` 與 `e2e-test` 是否在 MR 觸發；(2) `e2e-test` 的 MySQL 等待迴圈是否足夠（目前 30 次 × 2 秒）；(3) pipeline 總時長是否可接受，過慢可考慮把 `e2e-test` 限縮為只在 MR 跑。

- [ ] **`.env.example` 補 `ALLOW_PROD_SEED`** — `envSchema` 已補宣告（2026-08-14），但 `.env.example` 尚未加上該項；此檔在 AI 的權限設定中被拒絕存取，需由開發者手動加一行 `ALLOW_PROD_SEED=`（註明僅正式環境用）。
- [ ] **e2e 出現過一次無法重現的失敗（待觀察）** — `2026-08-14` 在 `pnpm test` 緊接 `pnpm test:e2e` 的組合中出現 `1 failed / 137 passed`，之後單獨連跑 3 次與組合連跑 2 次皆 138 全綠，**未能重現、也未取得失敗測試名稱**（當時輸出被 grep 過濾）。所有 spec 共用同一測試庫且 `--runInBand`，懷疑是連續執行下的資源競爭。下次若再出現，先用 `pnpm --filter @app/api test:e2e 2>&1 | tee` 保留完整輸出再查。



_(目前無)_

### 功能

- [ ] **帳號鎖定管理 CRUD（add-account-lock-management）** — `add-security-ip-list-management` 的 Non-Goals 預留。後端 `GET/POST /api/security/locks`、`DELETE /api/security/locks/:id`（list 已鎖帳號 + 分頁 + 搜尋 / 手動鎖定 / 手動解鎖）；前端 `/security/account-locks` 列表頁，sidebar「安全」group 加第三條。沿用 SUPERADMIN role gate。

### 技術債（外部相依卡住，延後）

- [ ] **path alias（`@app/*`）導入** — KGIE 用 `@api`/`@shared`/`@admin` + tsc-alias；目標專案有 187 處 4 層以上相對 import，alias 可提升可讀性 / 重構安全。**延後原因（2026-07-15）**：`nest build` 走 tsc builder，不自動改寫 alias，三種機制皆有硬傷——tsc-alias 讓 dev（`nest start --watch` + `tsc-alias -w` 兩 watch 賽跑）偶發「找不到 @app/x」；SWC 換編譯器踩 Hard Rule 的 cascade（decorator metadata / 與 ts-jest 並存）。純可讀性改善不值得動搖模板的 build baseline 穩定性。**條件**：改用 SWC/webpack builder、或有大重構痛點時再一起上。

- [ ] **api `moduleResolution: node`（node10）遷移 `nodenext`** — TS 7.0 會移除 node10。**現狀處置（2026-07-14）**：api 已從 TS 5.9 對齊到 **TS 6.0.2**（與 web / 編輯器同版，消除混版）；`tsconfig.json` 加 `ignoreDeprecations: "6.0"` 消音（TS 官方機制，須 TS≥6 才吃）+ `rootDir: "."`（TS 6 起 `TS5011` 要求明示，否則 ts-jest 全掛）。真解 `nodenext` **實測 TS 5.9 與 6 皆爆 124 個 `TS1272`**（NestJS 裝飾器 metadata：`@Body()` DTO + constructor 注入 service 要求 `import type`，注入 service 不能改否則 DI 壞）——與 TS 版本無關，卡在 NestJS 上游。**條件**：等 NestJS 改善 nodenext 支援；TS 7 移除 node10 時此消音失效、屆時強制處理（可能需關 `isolatedModules` 或大改 import 為 `import type`）。

---

## 完成項目

### 2026-08-14

- [x] **fix-security-dependencies** — `pnpm audit` 85 個漏洞。修復 overrides 機制（原宣告在 `apps/api/package.json` **雙重無效**：pnpm 只讀 root、且 10+ 起改讀 `pnpm-workspace.yaml`，三條 override 長期完全沒生效）+ 升級三個直接依賴（js-yaml 4.1.1→4.3.1、vite 8.0.13→8.2.1、nodemailer 8.0.7→9.0.5 major）。**85 → 77**，驗證鏈全綠。剩餘皆深層傳遞依賴，刻意不強制提版（見待處理）。

- [x] **`Member.spec.ts` 的重複 `describe('Email')` 已清理** — 三個 Email 測試中有兩個與 `Email.spec.ts` 重複（建立成功 / equals），直接刪除；第三個的三種邊界格式（`@example.com` / `user@` / `user@@example.com`）為 `Email.spec.ts` 所無，以 `it.each` 搬過去保留覆蓋。測試數不變（234），Member.spec.ts 現在只剩 `describe('Member')`。
- [x] **fix-gen-module-compliance** — 修復本輪護欄造成的回歸：`gen:module` 產出的模組原本 typecheck 失敗（字面值 code 不是 `ResponseCode`）+ 3 條架構規則紅 + 9 個 lint 錯誤。產生器改為引用 `ResponseCodes`、自動注入錯誤碼與訊息（冪等）、產出 swagger yaml 骨架並自動重跑 bundle / generate。**產出物零手改即通過 typecheck / lint / 20 條架構守則**（admin 與 front 兩側皆實測）。順帶修掉 `project.md` 模組範本中過時的「GlobalExceptionFilter 新增例外對應」。
- [x] **enforce-quality-thresholds** — 讓四個覆蓋率門檻真的會失敗：web 新增 `test:cov`（原本連 script 都沒有）、api 的 `test:cov` 補上架構測試（否則 CI 換用後會靜默漏掉 20 條規則）、root 串接 `pnpm -r test:cov`、CI `quality-check` 改用它。另補前端分層邊界（eslint 兩條 + vitest 架構測試一條，因「routes 互不相依」靜態 glob 表達不了）。**稽核修正**：原判斷「前端護欄遠落後」不成立——實測前端覆蓋率 94%、分層 0 違規，檔案數比例會誤導（shadcn 元件與整合層不在分母內）。
- [x] **add-ci-quality-gate** — CI 新增 `quality` stage：`quality-check`（typecheck + lint + 234 單元 + 20 架構守則）與 `e2e-test`（`mysql:9` service container 跑 138 支 e2e），**兩者於 MR 即觸發**（原本 MR 階段只跑 `pnpm install`），`prepare-production` 加 `needs: quality-check`。e2e 連線走 job variables 而非偽造 `.env`（已驗證 dotenv 不覆寫既有 `process.env`）。**注意：CI 正確性無法本機完全驗證**，首次 pipeline 需人工觀察（見待處理）。
- [x] **清單稽核：兩條「安全強化」待辦其實早已完成** — 稽核時比對原始碼發現，`審查#7` 全域 JwtAuthGuard（預設拒絕）已實作於 `app.module.ts:215` 的 `APP_GUARD` + `public.decorator.ts` 白名單（health / auth 4 支 / front ping 共 5 處 `@Public()`）；`審查#10` refresh token 重用連坐撤銷已實作於 `RefreshTokenService.ts:66` 的重用偵測 → `revokeAllSessions()`，`schema.prisma:82` 有 `tokenVersion` 欄位且簽發 / 驗證均帶入比對。**兩者實作於先前 session 但未回頭更新本檔**，導致清單失真近一個月。教訓見 [lessons.md]。
- [x] **add-swagger-sync-guardrail** — API 契約三段轉換（controller → 來源 yaml → bundle → api-client）的同步護欄。路由層級由 `swagger-sync.spec.ts` 守（毫秒，跟著 `pnpm test`），內容層級由 `swagger:check` 守（數秒，產物寫入 tmpdir 不污染工作目錄）。互補性經實證：改 yaml 的 summary（路由不變）→ `swagger:check` 紅、架構測試綠。`js-yaml` 提升為直接 devDependency —— regex 解析 OpenAPI 會被多行 `description:` 區塊誤導。架構規則 15 → 20。
- [x] **`ALLOW_PROD_SEED` 補進 `envSchema`** — 移除架構測試對應的 env 豁免。（`.env.example` 待手動補，見待處理）
- [x] **add-engineering-guardrails** — 把 CLAUDE.md 的 Hard Rules 變成會失敗的檢查。借鏡 `cga-laravel-backend` 的 `tests/Architecture/` 與 `tests/Feature/Api/Traits/`。產出：`test/architecture/` 6 條規則（各自帶「掃描數 > 0」自我檢查 + 豁免過期檢查）、eslint `no-restricted-imports` 分層邊界、`test/helpers/assertions.ts`（e2e 共用斷言 + `describeUnauthorized` 產生器）。導入過程抓出四個真問題：domain 層 4 處 `throw new Error` 讓無效輸入回 500、`ALLOW_PROD_SEED` 未進 envSchema、e2e 有 29 個錯誤碼從未被斷言、eslint 邊界規則因 flat config「後蓋前」而有一半失效。e2e 121 → 138。
- [x] **refactor-response-message-catalog** — 錯誤訊息集中到 `response-messages.ts`（24 條），完整性由 `satisfies Record<ResponseCode, …>` 型別保證（新增 code 不補訊息 → typecheck 失敗）；`DomainException` 建構子重載讓靜態訊息自動查表、動態訊息型別強制傳入。domain 驗證失敗由 500 改為 400，並新增 `of()` / `trusted()` 雙路徑（`reconstitute` 走 trusted，避免 DB 資料損毀誤報成客戶端錯誤）。23 個 exception 訊息逐字未變（機器比對確認）。單元測試 222 → 234，架構規則 13 → 15。

### 2026-07-14

- [x] **前後台 API 分層（admin / front）** — 借鏡 KGIE，把單一 API 面重構成兩套：後台 `/api/admin/*`、前台 `/api/front/*`。分 5 block：
  - **B1 搬 admin**：auth/member/role/security/profile 的 in 側 5 層（controller/facade/service/port-in/module）搬進 `admin/`；out 側 + domain 共用不動；5 controller 加 `admin/` 前綴；88+ rename、全 import 重接（段插入 + 深度 +1）+ e2e URL；114 e2e 綠。
  - **B2 swagger/api-client 對齊**：swagger serve `/api/admin/docs`、server 改 `/api/admin`、移除中性 `/health`；重生 api-client（path key 不變、僅少 health）；apps/web baseUrl `/api`→`/api/admin`（呼叫端零改）。
  - **B4 front 骨架**：`front/` in 側 5 層對齊 admin/；示範 `GET /api/front/ping`（@Public）+ front e2e；前台 swagger `docs/swagger/front/*` + `serveFiles` serve `/api/front/docs`；`swagger:bundle` 打兩份。
  - **B5 gen:module 升級 + 文件**：加 `--admin`/`--front`（預設 admin，執行期轉換插 `<side>/` + 深度 +1 + `@Controller` 前綴 + `Front` module 前綴）；project.md/CLAUDE.md/lessons 補前後台慣例。詳見 lessons「前後台分層」。
  - 未做（延後）：apps/web 沒有真前台頁（前台目前只有骨架端點）；「純 KGIE 版」（拔後台 swagger + 建 packages/shared-schemas）評估後不做，monorepo 保留後台 swagger 較划算。
- [x] **e2e 全面改走真 test DB（取代 mock Prisma）** — 6 支 e2e spec（health / serve-static / auth / role / member / security）全轉真庫，**114 tests 全綠** + typecheck 0 + lint pass：
  - 基建（前批 commit `d16cc8e` / `50027d2`）：`helpers/e2e-env.ts`（載真 `.env` 帳密 + 守門測試庫名須含 `test`）、`setup-env.e2e.ts`（覆寫 `DB_DATABASE=*_test` + 補測試 secrets）、`global-setup.ts`（`CREATE DATABASE IF NOT EXISTS` + `pnpm exec prisma migrate deploy`）、`helpers/db.ts`（`resetDb` 依 FK 序清表 / `ensurePermissions` / `seedMember` / `seedRole`）、`test-app.ts` 注入真 `PrismaService`（Redis 仍 mock）。
  - 本批：role / member / security 從「mock 斷言」改「真 DB seed + 查庫斷言」；`seedMember` / `seedRole` 加 `roleCode`（security 走 `@Roles(SUPERADMIN)`、flag 預設開，admin 需 `roleCode:'SUPERADMIN'`，值由 JwtAuthGuard 每次查 DB 補進 `request.member`）；`jest.e2e.config.js` 移除 security 的 `testPathIgnorePatterns`。
  - KGIE 坑的實際處置：限流 429 因 Redis 仍 mock（`throttleIncrement→1`）而無影響、無需 `.overrideGuard` 全域 guard、script 用 `pnpm exec` 非 `npx`。詳見 lessons.md「測試 / 真 DB e2e」。
- [x] **借鏡 kgie-nest-backend 的工程設置（第一批 DX + ESLint 升級）** — typecheck / lint / test（api 211 + web 27）全綠：
  - `.vscode/extensions.json`：推薦擴充（prettier / eslint / prisma / tailwind）。
  - **ESLint 抽共用基底 `packages/eslint-config`**：api / web 皆 extends；基底只放 `ignores` + `js.recommended` + 家規（`houseRules` named export），tseslint 預設由各 workspace 自帶「一組」（避免 Cannot redefine plugin）。
  - **api 從 legacy `.eslintrc.js` 升級 flat config + type-checked（`recommendedTypeChecked`）**：對 `persistence` / `seeds` / `spec` 分區關 `no-unsafe-*`，核心層維持嚴格；加 `prelint: db:generate` 修生成依賴（未生成 client → 假陽性）。
  - type-checked 抓到並修掉 **9 個真發現**：`main.ts` bootstrap 未 catch 的 floating-promise（旗艦發現）、多處多餘 `as`、redis 錯誤未 narrow（`err.message` on any）、PasswordPolicy 冗餘型別（`RoleCode | string`）。
  - **Prettier 全 repo 統一根一份**：根 `.prettierrc`（`semi:true` + `singleQuote` + `trailingComma:all`）+ 根 `.prettierignore`（排除 `**/*.md`、生成檔、`prisma/migrations`、build/lockfile）+ 根 `format`/`format:check`。前端從 Vite 無分號 reformat 加回分號對齊（~107 檔），後端 0 churn；`.vscode` 補 `[typescriptreact]`/`[javascriptreact]` formatOnSave。詳見 lessons.md「ESLint / 工具鏈」。
- [x] **後端六角模組產生器 `gen:module`（⑤，僅後端）** — `apps/api/scripts/gen-module.ts`（單檔內嵌 24 模板 map）；`pnpm --filter @app/api gen:module <name> [--force]` 產最小 CRUD 六角骨架（port in/out、5 service+spec、facade、controller+Zod DTO、Prisma repo、NotFound exception、module）+ 自動接線 `app.module` imports 與 `GlobalExceptionFilter`（NotFound→404，冪等）。實測 widget：23 檔 typecheck 乾淨、8 specs 全過、prettier/eslint 乾淨；`PrismaXRepository` 需先在 schema.prisma 建 `<Name>Record` model + db:generate 才 typecheck（設計邊界）。前端 CRUD 頁未做（CP 值低）。詳見 lessons.md「模組產生器 / gen:module」。
- [x] **`init-project.sh` 衍生專案初始化腳本** — `scripts/init-project.sh --name <kebab> [--yes]`：改寫根 package.json name/version/description（不動 `@app/*` scope）、重置 `tasks/todo.md`（**保留 `lessons.md`** 可重用基建知識）、重置 git 歷史（互動確認或 `--yes`，破壞性）、`pnpm install`。不碰 `.env` / `openspec`。已 `bash -n` + 對複本驗證 JSON 改寫邏輯。
- [x] **`date.ts` 走 `APP_TIMEZONE` + 日邊界 / 時間 helper** — 移除硬編 `Asia/Taipei`；`formatDate` / `formatDateWithDay` 改走 `.tz(APP_TIMEZONE)`（`getEnv()` 延後到呼叫時、避開 dotenv 時序）；新增 `formatDateTime`（後台時間戳 `YYYY-MM-DD HH:mm`）+ `appDayStartUtc` / `appDayEndUtc` / `rangeToUtc` 日邊界 helper + spec（含「UTC 晚間 → 台北隔日」跨日證明）。api 測試 211→216、typecheck / lint / format 全綠；原 helper 無生產呼叫端故零波及。

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
