## Context

`gen-module.ts`（937 行）的結構：`TEMPLATES` 是「相對 `src/` 的路徑 → 模板字串」的 map，`main()` 迴圈渲染寫檔後呼叫 `patchAppModule()` 注入 `app.module.ts`，最後印出手動步驟。

既有的 `patchAppModule` 已示範了共用檔注入的作法：冪等檢查（`content.includes(moduleClass)` 就 skip）、以正規表示式找錨點、找不到錨點時 `console.warn` 降級而非中斷。本設計沿用同一套模式。

## Goals / Non-Goals

**Goals:**

- 產出物零手改即通過 typecheck / lint / 架構守則
- 共用檔注入冪等、可重複執行
- 產生後 swagger 三段轉換保持同步

**Non-Goals:**

- 不產生 Prisma model（維持現況：欄位由開發者決定）
- 不改變產生的六角分層結構
- 不為 front 側產生 api-client 型別（目前只有 admin 生成）

## Decisions

### 決策 1：錯誤碼與訊息「同時注入」，不可只注入其一

`response-messages.ts` 以 `satisfies Record<ResponseCode, …>` 約束，因此**只加 code 不加訊息會讓 typecheck 失敗**。兩個注入必須成對，且訊息使用靜態字串（讓 exception 只需 `(code, kind)` 兩參數）。

注入位置以「最後一個既有項目」為錨點，維持檔案原有分組註解不被破壞。

### 決策 2：swagger 骨架採「每個 endpoint 一檔」，沿用 inline 回應慣例

`openspec/project.md` 明訂「成功回應自己 inline 寫，不要 `$ref: SuccessResponse`」——因為 `SuccessResponse.data` 是 generic object，`openapi-typescript` 會推導成 `Record<string, unknown> | null`，型別失去意義。產生器必須遵守同一慣例，否則產出的型別對前端毫無價值。

骨架只含 `summary` 與 200/201 的 inline `{ success, data, timestamp }`，欄位以 `name` / `status` 佔位，與其餘模板一致。

### 決策 3：產生器自動執行 bundle 與 generate

產完 yaml 後執行 `swagger:bundle`；admin 側再執行 api-client 的 `generate`。理由：`swagger-sync` 架構測試檢查三段轉換全部一致，只產 yaml 而不 bundle 會讓規則二立刻紅——產生器不該把專案留在紅燈狀態。

以 `execSync` 呼叫既有 script，失敗時警告降級並提示手動指令，不讓產生器整體失敗（檔案已寫出，中斷反而更難收拾）。

### 決策 4：模板格式對齊 prettier，而非產後才 format

改模板本身（多行 import 展開、參數換行），使產出物直接合格。

*替代方案：* 產生後對新檔跑 `prettier --write`。否決——會掩蓋模板本身的格式問題，且多一次外部指令呼叫；模板是固定字串，一次改對就永久正確。

## Risks / Trade-offs

- **[注入三個共用檔，失敗留半成品]** → 全部冪等 + 找不到錨點時警告降級；重跑產生器可補齊。
- **[產生器變慢]** → bundle + generate 約數秒，換得產出物零紅燈。
- **[未來新增護欄再次遺漏產生器]** → 本 change 於 spec 明訂「新增護欄時必須確認產生器產出物仍合規」，並在驗證步驟以「產生 → 全綠 → 清除」的實測收尾。

## Migration Plan

單一塊：改模板 → 加三個注入函式 → 加 swagger 產出與產後指令 → 實測產生一個模組驗證全綠 → 清除探針 → 文件。

回滾：僅改產生器腳本，`git revert` 即可；已產生的模組不受影響。
