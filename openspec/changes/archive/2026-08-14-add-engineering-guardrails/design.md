## Context

本專案是開案模板，`CLAUDE.md` 的 Hard Rules 會隨模板複製到每個新專案，但目前完全沒有機器檢查。導入前的掃描已證實現況違規（domain 層 4 處 `throw new Error` 會讓輸入驗證失敗回 500；`ALLOW_PROD_SEED` 未進 `envSchema`）。

既有基礎設施的三個限制決定了本設計：

1. `apps/api` 的 jest 設定 `rootDir: "src"`、`testRegex: ".*\\.spec\\.ts$"` —— **`pnpm test` 掃不到 `test/` 目錄**。
2. e2e 另有獨立 config（`test/jest.e2e.config.js`，`maxWorkers: 1` + `globalSetup` 需要真實 MySQL），架構檢查不該綁進去。
3. `pnpm lint` 的 glob 是 `{src,scripts,seeds}/**/*.ts` —— **`test/` 目前不在 lint 範圍**，新寫的測試碼不會被家規檢查。

## Goals / Non-Goals

**Goals:**

- Hard Rules 中「可機器判定」的部分，違規時有東西會紅
- 架構檢查零外部相依（不連 DB / Redis / HTTP），可在任何環境跑
- 白名單有到期壓力，不會變成永久藉口
- e2e 的錯誤斷言與未授權測試從「每次手寫」變成「一行宣告」

**Non-Goals:**

- 不修 production code（domain 層 4 處 `throw new Error` 交由 `refactor-response-message-catalog` 處理）
- 不引入 AST 分析工具或架構檢查框架
- 不追求 100% 規則覆蓋 —— 只做誤判率低、價值明確的規則
- 不改既有 e2e 的測試意圖，只收斂重複斷言

## Decisions

### 決策 1：架構測試用獨立 jest config，以 script 串接進 `pnpm test`

新增 `apps/api/test/jest.arch.config.js`（`rootDir: '..'`、`testRegex: 'test/architecture/.*\\.spec\\.ts$'`、**不載 `setupFiles`**，因為不需要 env），並把 api 的 test script 改為：

```
"test": "jest && jest --config test/jest.arch.config.js"
```

*替代方案與否決理由：*

- **把架構測試放進 `src/`**：能被現有 config 撿到，但測試碼混入 production 目錄，且會進入 `collectCoverageFrom` 的統計基準。否決。
- **改主 config 的 `rootDir` 為 `.`**：一次跑完最乾淨，但 `coverageThreshold`（statements 70 / branches 60）的分母會因掃描範圍改變而位移，可能需要重調門檻 —— 動搖既有品質基準的風險大於「少一個 config 檔」的收益。否決。
- **`jest --projects`**：可行，但 jest 設定內嵌在 `package.json`，加 `projects` 後 coverage 相關欄位的歸屬會變得難讀。否決。

串接的附帶好處：架構測試失敗時不會與單元測試的輸出混在一起，且可單獨跑 `pnpm --filter @app/api test:arch` 快速驗證。

### 決策 2：語意規則用 `fs` + 正規表示式，import 邊界用 eslint

兩者分工的判準是「eslint 表達得了嗎」：

| 規則 | 載體 | 理由 |
| --- | --- | --- |
| controller 不得 import Prisma / Repository | eslint `no-restricted-imports` | 單檔 import 判定，lint 期 + IDE 即時回饋 |
| front / admin 不互相 import | eslint `no-restricted-imports` zones | 同上 |
| 不得 `throw new Error` | 架構測試 | 需搭配豁免清單與過期檢查，eslint 的 disable 註解無法表達「到期」 |
| exception code 必須註冊於 `ResponseCodes` | 架構測試 | 跨檔語意比對，eslint 做不到 |
| `ResponseCodes` 不得有死碼 | 架構測試 | 需全專案交叉引用統計 |
| `process.env.X` 必須進 `envSchema` | 架構測試 | 跨檔語意比對 |

*替代方案與否決理由：*

- **ts-morph / TypeScript Compiler API**：AST 判定精準（不會被字串或註解誤導），但需新增相依、冷啟數秒，且本專案的規則數量少到不值得這個代價。否決 —— 但若未來規則超過 10 條或誤判頻繁，這是既定的升級路徑。
- **dependency-cruiser**：擅長 import 圖分析，但要再學一套設定 DSL，且與已在用的 eslint 功能重疊。否決。
- **eslint-plugin-boundaries**：功能對味，但為兩三條規則新增外掛不划算，`no-restricted-imports` 原生就夠。否決。

regex 誤判（字串內容、註解中出現關鍵字）以豁免清單吸收；漏抓則由「掃描數 > 0」的自我檢查兜底。

### 決策 3：豁免清單集中管理，且過期即失敗

`apps/api/test/architecture/allowlist.ts` 匯出兩類豁免：

- `PERMANENT` —— 每筆必附理由。目前 4 筆：`adapter/out` 的 SMTP / S3 / Firebase 未初始化，以及 `current-member.decorator.ts` 的 MemberContext 未設定。這些是程式設定錯誤（不該發生），回 500 語意正確。
- `TEMPORARY` —— 每筆必附負責清除的 change 名稱。目前 5 筆：domain 層 4 處 `throw new Error`（`refactor-response-message-catalog`）與 `ALLOW_PROD_SEED`（`tasks/todo.md` 追蹤）。

**關鍵機制**：測試會驗證「豁免項目在原始碼中確實仍存在」。違規修掉但豁免忘了刪 → 測試失敗要求清理。沒有這條，白名單會單向膨脹成一份無人維護的例外清冊。

### 決策 4：`describeUnauthorized` 收 app getter 而非 app 實例

既有 e2e 一律在 `beforeAll` 內建立 app（`({ app } = await createE2EApp(...))`），而 `describe` 區塊在 jest 的收集階段就會執行 —— 此時 `app` 仍是 `undefined`。因此介面設計為：

```typescript
describeUnauthorized(() => app, 'get', '/api/admin/members');
```

傳 getter 而非實例，取值延後到 `it` 執行期。若直接收實例，會在每支測試檔踩到「app 尚未建立」的空指標，這是這類 helper 最容易踩的坑。

`expectApiError(res, status, code)` 對齊 `GlobalExceptionFilter` 的實際回應形狀 `{ success: false, message, code }`：同時斷言 HTTP status 與 body 的 `code`，且 `code` 參數型別為 `ResponseCode`（union type），錯誤碼改名時測試會在 **typecheck 階段**就紅，而不是等執行期才發現字面值不同步。

### 決策 5：把 `test/` 納入 `pnpm lint` 範圍

`eslint.config.mjs` 已經有針對 `test/**/*.ts` 的規則區塊（放寬 `no-unsafe-*`），但 lint script 的 glob 沒有涵蓋 `test/` —— 設定寫了卻從未生效。本 change 新增的測試碼量不小，順手把 glob 補成 `{src,scripts,seeds,test}/**/*.ts`。

## Risks / Trade-offs

- **[regex 誤判造成假紅]** → 每條規則的比對樣式保持保守（只匹配行首縮排後的 `throw new Error(`、只掃 `import` 開頭的行），誤判以豁免清單吸收；若某規則誤判率高到需要頻繁豁免，該規則應改用 AST 或直接移除。
- **[掃描樣式失效造成假綠]** → 每條規則強制斷言「掃到的檔案 / 比對數 > 0」，目錄改名時測試會紅並提示樣式可能失效。此作法沿用 `cga-laravel-backend` 已在 350+ 路由上驗證過的模式。
- **[白名單腐化]** → 過期豁免檢查（決策 3），且 `TEMPORARY` 必須綁定負責清除的 change 名稱。
- **[test script 跑兩次 jest 增加耗時]** → 架構測試不載 `setupFiles`、不連任何外部服務，冷啟成本約 1–2 秒；換得的是既有 coverage 基準完全不受影響。
- **[改寫既有 e2e 時誤改測試意圖]** → 改寫僅限「斷言寫法」，不得調整測試資料、請求路徑或既有的 `expect` 語意；每支改完後必須跑過 `pnpm --filter @app/api test:e2e` 確認結果與改寫前一致。

## Migration Plan

分四塊，每塊各自能通過驗證鏈：

1. **架構測試骨架 + 豁免清單**：jest config、`allowlist.ts`、第一條規則（`throw new Error`），確認現況綠。
2. **其餘架構規則**：分層邊界、錯誤碼註冊完整性、前後台隔離、env 宣告完整性。
3. **eslint import 邊界 + lint glob**：確認 `pnpm lint` 綠。
4. **e2e 斷言 helper + 既有 e2e 改寫**：需要本機 MySQL 跑 `test:e2e` 驗證。

回滾：四塊皆為新增檔案或設定調整，`git revert` 即可，不涉及資料庫或 API 契約。

## Open Questions

- 架構規則未來若成長到 10 條以上、或誤判頻繁，是否升級為 ts-morph AST 判定？（本 change 不決定，留待實際痛點出現）
- `ResponseCodes` 死碼檢查是否該把 `apps/web` 與 `packages/api-client` 的引用也納入統計？目前僅掃 `apps/api`，前端若獨立引用某錯誤碼可能造成誤判 —— 待第一次誤判發生再擴大範圍。
