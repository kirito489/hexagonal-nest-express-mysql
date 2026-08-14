# 錯誤訊息集中管理（refactor-response-message-catalog）

## Why

錯誤訊息目前硬寫在 23 個 domain exception 的 constructor 裡，造成三個問題：

1. **文案無法一次審視**：「帳號已停用」「找不到附件」「預設角色不可刪除」散在 23 個檔案，沒有任何地方能一眼看完全部對外錯誤文案，語氣與用詞是否一致無從檢查。
2. **無法 i18n**：訊息與程式碼綁死，未來要支援多語系必須逐檔改寫。
3. **`Email.ts` 的訊息是英文** `'Invalid email format'`，違反專案「文案一律繁體中文」的規範，而這件事沒有任何機制會發現。

同時 `add-engineering-guardrails` 導入的架構測試已標記出一組真違規：domain 層 4 處 `throw new Error`（`MemberId.of`、`Email.of`、`Member` 名稱驗證 ×2）。這些是**使用者輸入導致的驗證失敗**，卻會被 `GlobalExceptionFilter` 當成非預期錯誤回 **500 而非 400**。它們目前掛在架構測試的 `TEMPORARY` 豁免清單，指名由本 change 清除。

## What Changes

- **新增 `apps/api/src/shared/constants/response-messages.ts`**：以 `ResponseCode` 為 key 的訊息表，靜態訊息為字串、需要參數的訊息為函式（如 `(name: string) => \`角色名稱已存在：${name}\``）。
- **型別強制完整性**：訊息表以 `Record<ResponseCode, ...>` 約束，任何 `ResponseCodes` 新增 key 卻沒補訊息，**typecheck 階段**即失敗 —— 不需要額外寫架構測試。
- **`DomainException` 基底以建構子重載查表**：靜態訊息的子類只傳 `(code, kind)`，訊息由基底自表中取；需要參數的 code 在型別上**強制**必須傳入算好的訊息。
- **23 個 exception 改為引用訊息表**，文案本身逐字不變（避免影響前端顯示與既有 e2e 斷言）。
- **修正 domain 層 4 處 `throw new Error`**：新增 `InvalidMemberIdException` / `InvalidEmailException` / `InvalidMemberNameException`（kind 皆為 `INVALID` → 400），並新增對應的 `ResponseCodes` 與訊息；`Email.ts` 的英文訊息改為繁體中文。
- **移除架構測試中對應的 `TEMPORARY` 豁免**（`allowlist.ts` 的 3 筆），豁免的過期檢查會確保這件事不被遺漏。
- **新增一條架構規則**：`domain/exception/**` 不得出現中文字串字面值 —— 防止未來有人繞過訊息表把文案寫回 constructor。

## Capabilities

### New Capabilities

- `api-error-response`: 對外錯誤回應的組成規則 —— 錯誤碼與訊息的單一真相、訊息表的完整性保證、動態訊息的參數化方式，以及 domain 驗證失敗必須對應到正確 HTTP status。

### Modified Capabilities

- `engineering-guardrails`: 新增「exception 不得內嵌文案字面值」規則；`TEMPORARY` 豁免清單移除 domain 層 3 筆（涵蓋 4 處）`throw new Error`。

## Impact

**新增檔案**

- `apps/api/src/shared/constants/response-messages.ts`
- `apps/api/src/domain/exception/InvalidMemberIdException.ts`、`InvalidEmailException.ts`、`InvalidMemberNameException.ts`
- `apps/api/test/architecture/no-inline-message.spec.ts`

**修改檔案**

- `apps/api/src/domain/exception/DomainException.ts`（建構子重載 + 查表）
- `apps/api/src/domain/exception/*.ts`（23 檔改引用訊息表）
- `apps/api/src/shared/constants/response-codes.ts`（+3 個 code）
- `apps/api/src/domain/value-object/MemberId.ts`、`Email.ts`、`domain/model/Member.ts`（改拋 domain exception）
- `apps/api/src/adapter/in/web/filter/GlobalExceptionFilter.ts`（500 的固定訊息改自訊息表取）
- `apps/api/test/architecture/allowlist.ts`（移除 3 筆 `TEMPORARY`）

**行為變更（BREAKING，但屬修正）**

- 無效的 member id / email 格式、空白名稱，HTTP status 由 **500 → 400**，回應 code 由 `INTERNAL_SERVER_ERROR` 改為對應的業務碼。這是修正而非退化：原行為讓客戶端無法區分「輸入錯誤」與「伺服器故障」。
- 其餘 23 個 exception 的 code、status、訊息**逐字不變**。

**不受影響**

- DB schema、API 路由、Swagger 契約、前端 api-client 型別

**風險**

- 訊息逐字搬移若不慎改動，會讓既有 e2e 斷言或前端顯示出錯。緩解：搬移後 `pnpm --filter @app/api test:e2e` 必須維持 138 tests 全綠（該套件已斷言 29 個錯誤碼）。
- 建構子重載若設計不當會讓子類的呼叫變得囉嗦。緩解：以「靜態訊息只傳兩個參數」為驗收標準，17 個靜態子類的 `super()` 呼叫必須比現在更短。
