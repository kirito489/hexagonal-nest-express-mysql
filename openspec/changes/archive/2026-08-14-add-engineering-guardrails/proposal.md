# 工程護欄自動化（add-engineering-guardrails）

## Why

`CLAUDE.md` 的 8 條 Hard Rules（controller 不得碰 Prisma、不得 `throw new Error`、前後台不互穿、env 必進 `envSchema`…）目前**只存在於文字**，靠人工 review 與 AI 自律遵守。本專案是「開案模板」，長出去的每個專案都會複製這些規則 —— 沒有機器檢查，規則的半衰期等於團隊記憶的半衰期。

導入前的一次靜態掃描已證實現況就有違規：

- `throw new Error` 在非測試檔有 8 處，其中 4 處在 domain 層（`MemberId.of` / `Email.of` / `Member` 名稱驗證 ×2）。這些是**使用者輸入導致的驗證失敗**，卻會被 `GlobalExceptionFilter` 當成非預期錯誤回 **500**，而不是 400。
- `ALLOW_PROD_SEED` 沒有進 `envSchema` —— 而它控制的是「能不能在正式環境跑 seed」，靜默為 `undefined` 的後果不小。

同時 e2e 已累積 1807 行，401 / 403 斷言散落手寫（`member.e2e-spec.ts` 一支就 24 處），新增 endpoint 時「有沒有補未授權測試」同樣沒有機制保證。

## What Changes

- **新增架構守則測試** `apps/api/test/architecture/*.spec.ts`：靜態掃描原始碼驗證分層與慣例，不連資料庫、不起 HTTP，跟著 `pnpm test` 跑（**不**進 e2e，因為 e2e 需要真實 MySQL 且 `--runInBand`）。涵蓋：
  - controller 不得 import `PrismaService` 或任何 `*Repository`
  - `src/**` 不得出現 `throw new Error(`（測試檔除外）
  - `domain/exception/**` 使用的 code 必須存在於 `ResponseCodes`
  - `ResponseCodes` 每個 key 都必須有人引用（抓死碼）
  - `modules/front/**` 與 `modules/admin/**` 不得互相 import
  - 每個 `process.env.X` 都必須宣告在 `validate-env.ts` 的 `envSchema`
- **新增 eslint import 邊界規則**（`no-restricted-imports` zones）：分層違規在 lint 期就紅，與架構測試互補 —— **import 邊界交給 eslint（快、IDE 即時），語意規則交給測試（eslint 表達不了）**。
- **新增 e2e 斷言 helper** `apps/api/test/helpers/assertions.ts`：`expectApiError(res, status, code)` 與 `describeUnauthorized(app, method, path)` 產生器，並改寫既有 e2e 套用。
- **顯式白名單記錄現況違規**（本 change 不修 production code）：
  - domain 層 4 處 `throw new Error` → 白名單註明「待 `refactor-response-message-catalog` 修正後移除」
  - `adapter/out` 的 SMTP / S3 / Firebase「未初始化」3 處與 `current-member.decorator.ts` 1 處 → **永久豁免**，理由是這些屬程式設定錯誤（不該發生），回 500 語意正確
  - `ALLOW_PROD_SEED` → 白名單 + 記入 `tasks/todo.md`

## Capabilities

### New Capabilities

- `platform-engineering-guardrails`: 把架構與慣例規則變成可執行檢查 —— 分層邊界、例外處理慣例、錯誤碼註冊完整性、env 宣告完整性、未授權測試覆蓋。定義每條規則的檢查方式、豁免機制與失敗訊息要求。

### Modified Capabilities

（無：本 change 不改變任何既有功能的行為契約）

## Impact

**新增檔案**

- `apps/api/test/architecture/*.spec.ts` — 架構守則測試
- `apps/api/test/helpers/assertions.ts` — e2e 共用斷言與未授權測試產生器

**修改檔案**

- `apps/api/eslint.config.mjs` — 加 `no-restricted-imports` zones
- `apps/api/test/*.e2e-spec.ts` — 改用共用斷言（行為不變，只收斂重複）
- `tasks/todo.md` — 記錄 `ALLOW_PROD_SEED` 與 domain 違規的後續處理

**不受影響**

- `apps/api/src/**` 一律不動（production code 零變更）
- API 行為、DB schema、Swagger 契約皆不變

**風險**

- 架構測試以正規表示式掃描原始碼，過嚴會誤報、過鬆會漏抓。緩解：每條規則都必須有「掃到的總數 > 0」的自我檢查（避免 regex 失效後靜默全綠），此為 `cga-laravel-backend/tests/Architecture/AdminRedirectRoutesTest.php` 已驗證的作法。
- 白名單若無到期機制會變成永久藉口。緩解：白名單分「暫時」與「永久」兩類，暫時項目必須註明對應 change 名稱。
