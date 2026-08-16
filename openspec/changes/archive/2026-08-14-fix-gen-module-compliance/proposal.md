# 修復 gen:module 產出物合規（fix-gen-module-compliance）

## Why

`gen:module` 是模板的核心工作流——「一鍵產生一個符合六角架構的 CRUD 模組」。但本輪新增護欄後，**產生器的模板沒有同步更新**，導致產出的模組立刻讓專案變紅。

實測（`pnpm --filter @app/api gen:module probeitem`）：

| 問題 | 來源 |
| --- | --- |
| `super('PROBEITEM_NOT_FOUND', …)` → `TS2345: not assignable to 'ResponseCode'`，**typecheck 直接失敗** | `refactor-response-message-catalog` 的建構子重載 |
| exception 用字面值 code → 架構測試 `response-codes` 紅 | 同上 |
| exception 內嵌中文文案 → 架構測試 `no-inline-message` 紅 | 同上 |
| controller 有路由但無 swagger → 架構測試 `swagger-sync` 紅 | `add-swagger-sync-guardrail` |
| 9 個 prettier 格式錯誤 | 既有缺陷（模板格式未對齊 prettier） |

這正是 `tasks/lessons.md` 剛記下的那個型態的另一面：**加了規則卻沒檢查誰會受影響**。護欄本身沒錯，錯在產生器沒跟上——而產生器恰恰是模板使用者接觸最頻繁的入口。

## What Changes

- **exception 模板改為引用 `ResponseCodes`**，靜態訊息只傳 `(code, kind)` 兩參數。
- **產生器自動注入錯誤碼與訊息**：仿照既有的 `patchAppModule`，把 `<NAME>_NOT_FOUND` 寫入 `response-codes.ts`，對應訊息寫入 `response-messages.ts`（型別的完整性保證要求兩者同時存在）。
- **產生器一併產出 swagger yaml 骨架**：5 支 endpoint 各一個檔（沿用專案的「成功回應 inline 寫」慣例），註冊進 `docs/swagger/<side>/openapi.yaml` 的 `paths`，並自動執行 `swagger:bundle`；admin 側再執行 api-client `generate`（front 側目前不生成型別）。
- **模板格式對齊 prettier**，使產出物直接通過 `pnpm lint`。
- 產生後的專案狀態：**typecheck、lint、20 條架構規則全綠**，開發者只需補 Prisma model 與實際欄位。

## Capabilities

### Modified Capabilities

- `platform-engineering-guardrails`: 新增「產生器產出物必須通過所有既有護欄」的要求。

## Impact

**修改檔案**

- `apps/api/scripts/gen-module.ts`（模板 + 三個注入函式 + 產後指令）
- `openspec/project.md`（`gen:module` 章節說明新增的自動注入行為）

**不受影響**

- 既有模組、API 行為、任何 production code

**風險**

- 產生器改動 `response-codes.ts` / `response-messages.ts` / `openapi.yaml` 三個共用檔，注入失敗會留下半成品。緩解：所有注入比照 `patchAppModule` 設計為**冪等**（已存在則略過），且找不到錨點時警告降級而非中斷。
- 自動執行 `swagger:bundle` 與 `generate` 會增加產生器耗時數秒。可接受——替代方案是產生後專案處於紅燈狀態。
