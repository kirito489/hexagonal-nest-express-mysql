# engineering-guardrails Specification

## Purpose

把 `CLAUDE.md` 的 Hard Rules 從「文字約束」變成「會失敗的檢查」。本 capability 定義哪些架構與慣例
規則必須被機器守住、以什麼方式檢查、豁免如何管理，以及測試基礎設施（e2e 共用斷言、未授權測試
產生器）該提供什麼保證。

分工判準：單檔即可判定的 import 邊界交給 eslint（lint 期 + IDE 即時），跨檔語意交給架構測試；
型別能表達的完整性（如常數是否存在）不另寫檢查，交給 TypeScript。

## Requirements

### Requirement: 分層邊界檢查

系統 SHALL 以自動化檢查確保 controller 不直接相依持久層。任何 `src/adapter/in/**/*.controller.ts` 檔案 MUST NOT import `PrismaService`、`PrismaClient` 或任何以 `Repository` 結尾的型別。

#### Scenario: controller 直接注入 Prisma

- **WHEN** 某 controller 加入 `import { PrismaService } from '...'`
- **THEN** 架構測試失敗，訊息列出違規檔名與該 import 所在行號

#### Scenario: controller 只相依 facade

- **WHEN** 所有 controller 皆只 import facade 與 DTO
- **THEN** 檢查通過

### Requirement: 例外處理慣例檢查

系統 SHALL 確保 `src/**` 不使用原生 `Error` 拋出業務錯誤。檢查 MUST 排除 `*.spec.ts`（測試中以 `throw new Error` 模擬失敗為合法用法），並 MUST 支援顯式豁免清單。

#### Scenario: 新增程式碼使用原生 Error

- **WHEN** 非測試檔出現 `throw new Error(`，且該位置不在豁免清單中
- **THEN** 架構測試失敗，訊息指出應改用 `DomainException` 子類或 NestJS `HttpException`

#### Scenario: 已知的基礎設施豁免

- **WHEN** 違規位置屬於豁免清單中「基礎設施初始化失敗」類別（SMTP / S3 / Firebase 未初始化、`MemberContext` 未設定）
- **THEN** 檢查通過，因為這類錯誤代表程式設定錯誤而非業務錯誤，回應 500 語意正確

#### Scenario: 豁免清單失效

- **WHEN** 豁免清單中的某個項目在原始碼中已不存在（違規已修掉）
- **THEN** 架構測試失敗，要求移除該筆過期豁免，避免白名單無限膨脹

### Requirement: 錯誤碼註冊完整性檢查

系統 SHALL 驗證錯誤碼以 `ResponseCodes` 為單一真相。`src/domain/exception/**` MUST NOT 以字面值傳入 code；`ResponseCodes` 中每個 key MUST 至少被一處引用。

檢查範圍刻意排除「使用不存在的 code」—— 該情形由 TypeScript 免費保證（`ResponseCodes.FOO` 不存在即型別錯誤），架構測試只負責型別擋不住的部分。

#### Scenario: exception 繞過常數傳字面值

- **WHEN** 某 domain exception 寫成 `super('SOME_CODE', ...)` 而非引用 `ResponseCodes` 常數
- **THEN** 架構測試失敗，列出該 exception 檔名、行號與應改引用的常數檔路徑

#### Scenario: ResponseCodes 出現死碼

- **WHEN** `ResponseCodes` 某個 key 在 `src/`、`test/` 中都沒有任何引用
- **THEN** 架構測試失敗，列出該 key 並要求刪除或補上使用處

### Requirement: 前後台隔離檢查

系統 SHALL 確保後台與前台程式碼互不相依。所屬側 MUST 以「檔案路徑是否含 `/admin/` 或 `/front/`」判定，而非列舉固定目錄 —— 分側結構同時存在於 `adapter/in/web/`、`application/service/` 與 `modules/`，且新增分側目錄時不應需要修改規則。屬於某一側的檔案 MUST NOT import 另一側路徑下的模組。

#### Scenario: 前台檔案引用後台程式碼

- **WHEN** 路徑含 `/front/` 的檔案 import 了含 `/admin/` 的路徑
- **THEN** 架構測試失敗，訊息指出共用邏輯應下沉至 `application` / `domain` / `shared`

#### Scenario: 分側目錄新增

- **WHEN** 在既有分層下新增一組 `admin/` 與 `front/` 目錄
- **THEN** 檢查自動涵蓋新目錄，無需修改規則程式碼

### Requirement: 環境變數宣告完整性檢查

系統 SHALL 確保所有環境變數皆經過驗證。`src/`、`scripts/`、`seeds/` 中每個 `process.env.X` 的 `X` MUST 宣告於 `validate-env.ts` 的 `envSchema`，未宣告者 MUST 列於顯式豁免清單。

#### Scenario: 使用未宣告的環境變數

- **WHEN** 程式碼讀取 `process.env.NEW_FLAG` 而 `envSchema` 沒有 `NEW_FLAG`
- **THEN** 架構測試失敗，訊息指出該變數會靜默為 `undefined`，須補進 `envSchema`

### Requirement: 掃描有效性自我檢查

每條以原始碼掃描實作的規則 MUST 斷言「掃描到的檔案數或比對數大於零」。當專案結構調整導致掃描路徑或樣式失效時，檢查 MUST 失敗而非靜默通過。

#### Scenario: 掃描路徑失效

- **WHEN** 目錄改名導致某規則掃到 0 個檔案
- **THEN** 該規則失敗並提示「掃描樣式可能已失效」，而不是回報「無違規」

### Requirement: 違規訊息可定位

所有架構檢查失敗訊息 MUST 包含違規的檔案路徑，且在可判定時包含行號，並以繁體中文說明應如何修正。

#### Scenario: 檢查失敗

- **WHEN** 任一架構規則檢查失敗
- **THEN** 輸出包含每筆違規的 `檔案路徑:行號` 與修正指引，而非僅回報布林結果

### Requirement: 架構檢查執行成本

架構檢查 MUST NOT 相依資料庫、Redis 或 HTTP 伺服器，且 MUST 可在單元測試指令中執行，不得併入需要真實資料庫的 e2e 流程。

#### Scenario: 在無資料庫環境執行

- **WHEN** 在未啟動 MySQL / Redis 的環境執行架構檢查
- **THEN** 檢查正常完成並回報結果

### Requirement: import 邊界的 lint 期攔截

專案 SHALL 於 eslint 設定中以 `no-restricted-imports` 表達分層 import 限制，使違規在 lint 期即被攔截。

#### Scenario: 撰寫時即時回饋

- **WHEN** 開發者在 controller 中輸入受限的 import 路徑
- **THEN** eslint 回報錯誤，`pnpm lint` 亦以非零狀態結束

### Requirement: e2e 共用錯誤斷言

e2e 測試 SHALL 透過共用 helper 斷言錯誤回應，helper MUST 同時驗證 HTTP status 與回應中的錯誤 code，且 code MUST 引用 `ResponseCodes` 常數而非字面值。

#### Scenario: 斷言錯誤回應

- **WHEN** 測試呼叫 `expectApiError(res, 404, ResponseCodes.MEMBER_NOT_FOUND)`
- **THEN** 同時驗證 HTTP status 與回應 body 的錯誤 code，任一不符即失敗

#### Scenario: 錯誤碼改名

- **WHEN** `ResponseCodes` 某個 key 被改名
- **THEN** 引用該常數的測試在型別檢查階段即失敗，不會因字面值不同步而漏測

### Requirement: 未授權存取測試產生器

專案 SHALL 提供產生器，讓受保護端點以單行宣告即涵蓋「未帶 token 應回 401」的測試。

#### Scenario: 宣告受保護端點

- **WHEN** 測試檔呼叫 `describeUnauthorized(app, 'get', '/api/admin/members')`
- **THEN** 自動產生一支未帶 token 的請求測試，並斷言回應為 401

### Requirement: exception 不得內嵌文案字面值

架構檢查 SHALL 確保 `src/domain/exception/**` 不出現中文字串字面值。訊息一律引用 `response-messages.ts`，避免文案在訊息表建立後又被寫回 constructor。

#### Scenario: 把文案寫回 exception

- **WHEN** 某 domain exception 的 constructor 直接寫入中文訊息字面值
- **THEN** 架構測試失敗，訊息指出應改為引用訊息表

#### Scenario: 引用訊息表

- **WHEN** exception 只指定 code 與 kind，或傳入訊息表函式的回傳值
- **THEN** 檢查通過
