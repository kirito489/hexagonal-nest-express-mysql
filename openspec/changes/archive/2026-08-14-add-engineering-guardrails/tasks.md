> 每一塊（`##` 標題）須能獨立通過驗證鏈：
> `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter @app/api test:e2e && pnpm build`
> 綠燈後給 commit 指令，由使用者手動執行，再進下一塊。
>
> 〔檔頭補寫於 2026-08-16 的 openspec 慣例整理。驗證鏈取自本檔各塊當時實際記錄的結果，塊與任務內容維持原樣未改。〕

## 1. 架構測試骨架與豁免清單

- [x] 1.1 新增 `apps/api/test/jest.arch.config.js`（`rootDir: '..'`、`testRegex: 'test/architecture/.*\.spec\.ts$'`、不載 `setupFiles`、`testEnvironment: 'node'`）
- [x] 1.2 `apps/api/package.json` 新增 script `test:arch`，並把 `test` 改為 `jest && jest --config test/jest.arch.config.js`
- [x] 1.3 新增 `apps/api/test/architecture/helpers.ts`：`collectSourceFiles` / `findViolations` / `violationReport`，供各規則共用
- [x] 1.4 新增 `apps/api/test/architecture/allowlist.ts`：`PERMANENT`（4 筆基礎設施豁免，每筆附理由）與 `TEMPORARY`（domain 層 3 筆涵蓋 4 處 + `ALLOW_PROD_SEED`，每筆附負責清除的 change 名稱）
- [x] 1.5 新增 `apps/api/test/architecture/no-native-error.spec.ts`：`src/**` 不得 `throw new Error(`（排除 `*.spec.ts`），套用豁免清單
- [x] 1.6 在 1.5 加入「掃描檔案數 > 0」自我檢查，並加入「豁免項目在原始碼中仍存在」的過期檢查
- [x] 1.7 **反向驗證**：探針 A（新增一處原生 Error）讓規則 2 變紅、探針 B（讓一筆豁免失效）讓規則 3 變紅，訊息含 `檔案:行號` 與修正指引；還原後全綠、無殘留
- [x] 1.8 驗證鏈：typecheck ✓ / lint ✓ / test ✓（222 單元 + 3 架構，架構測試 0.14 秒）

## 2. 其餘架構規則

- [x] 2.1 新增 `layering.spec.ts`：`src/adapter/in/**/*Controller.ts` 不得 import `PrismaService` / `PrismaClient` / `adapter/out/persistence` / `*Repository`（實際命名慣例為 PascalCase `XxxController.ts`，非 `xxx.controller.ts`）
- [x] 2.2 新增 `side-isolation.spec.ts`：以「路徑是否含 `/admin/` 或 `/front/`」判定所屬側，兩側不得互相 import（涵蓋 `adapter/in/web/`、`application/service/`、`modules/`，不限於 `modules/`）
- [x] 2.3 新增 `response-codes.spec.ts`：domain exception 不得傳字面值 code（「用到不存在的 code」TypeScript 已免費擋掉，故改查型別擋不住的繞過寫法）
- [x] 2.4 於 2.3 加入死碼檢查：`ResponseCodes` 每個 key 至少被 `src/` 或 `test/` 引用一次
- [x] 2.5 新增 `env-schema.spec.ts`：`src/`、`scripts/`、`seeds/` 的每個 `process.env.X` 必須宣告於 `validate-env.ts` 的 `envSchema`，未宣告者須在豁免清單；另含 env 豁免的過期檢查
- [x] 2.6 每支新規則都加上「掃描數 > 0」自我檢查與繁中修正指引的失敗訊息
- [x] 2.7 **反向驗證**：五條規則各插探針（controller import Prisma、admin 檔 import front、exception 用字面值 code、新增無人使用的 code、使用未宣告 env），確認每條都變紅；還原後 `git diff apps/api/src` 乾淨無殘留
- [x] 2.8 驗證鏈：typecheck ✓ / lint ✓ / test ✓（222 單元 + 13 架構）

## 3. eslint import 邊界

- [x] 3.1 `apps/api/eslint.config.mjs` 加入 `@typescript-eslint/no-restricted-imports`：controller 禁止 import Prisma / persistence / `*Repository`
- [x] 3.2 加入 front / admin 互相 import 的禁令；**因 flat config 同名規則「後蓋前」不合併 patterns，重疊範圍（admin/front 下的 controller）必須各自列齊完整限制**，共切成 5 個不重疊區塊
- [x] 3.3 `apps/api/package.json` 的 `lint` / `lint:fix` glob 補上 `test`（`eslint.config.mjs` 早有 `test/**/*.ts` 規則區塊，但 glob 沒涵蓋，等於從未生效）
- [x] 3.4 **反向驗證**：四種情境（admin controller 碰持久層、admin controller 引用 front、front controller 碰持久層、front 一般檔引用 admin）全數被擋；首次驗證即抓到 3.2 的覆蓋問題
- [x] 3.5 驗證鏈：typecheck 0 error / lint exit 0 / test 222 + 13 ✓

## 4. e2e 斷言 helper 與既有 e2e 改寫

- [x] 4.1 新增 `apps/api/test/helpers/assertions.ts`：`expectApiError(res, status, code: ResponseCode)`，斷言 HTTP status 與 body 的 `{ success: false, code }`
- [x] 4.2 於同檔新增 `describeUnauthorized(getApp, method, path)`（getter 取 app）；另加 `expectUnauthorized` / `expectForbidden` —— 401/403 由 NestJS HttpException 產生，code 是 class name 推導的 `UNAUTHORIZED` / `FORBIDDEN`，不在 `ResponseCodes` 中，故與業務錯誤分開
- [x] 4.3 改寫 `member.e2e-spec.ts`：6 處 `expectApiError` + 7 處 401 + 4 處 403
- [x] 4.4 改寫 `auth.e2e-spec.ts`：5 處 `expectApiError` + 4 處 401
- [x] 4.5 改寫 `role`（8+1）、`security`（6+1）、`attachment`（1+1）；400 / 429 / 未知路由 404 屬框架層非業務碼，維持只斷言 status
- [x] 4.6 為未覆蓋端點補 `describeUnauthorized`：role 5 條、security 10 條、attachment 2 條（共 +17 支測試）
- [x] 4.7 驗證：e2e 由 121 → 138 tests 全綠（8 suites），且**新增驗證了 29 個原本從未被斷言的錯誤碼** —— 多支測試標題寫著 `→ 404 ROLE_NOT_FOUND`，實際卻只檢查 status

## 5. 收尾

- [x] 5.1 `tasks/todo.md` 記錄 `ALLOW_PROD_SEED` 待處理項、豁免到期條件，以及一次無法重現的 e2e 失敗（待觀察）
- [x] 5.2 `tasks/lessons.md` 記錄三則：架構測試的兩道自我檢查、架構測試與 lint 的分工判準、eslint flat config 同名規則「後蓋前」
- [x] 5.3 `openspec/project.md` 補「架構守則測試」與「e2e 共用斷言」兩節（位置、執行方式、新增規則三步驟、豁免機制、與 eslint 分工）
- [x] 5.4 完整驗證鏈：typecheck ✓ / lint ✓ / test 222+13 ✓ / e2e 138 ✓ / build exit 0 ✓
