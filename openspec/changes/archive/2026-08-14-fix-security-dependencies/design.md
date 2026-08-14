## Context

`pnpm audit` 的 85 個漏洞全為傳遞依賴，能直接處理的只有三個直接依賴 + overrides 機制本身的修復。

`apps/api/package.json` 的 `overrides` 是無效宣告——pnpm 只讀 root 的 `pnpm.overrides`（npm 相容的 root `overrides` 亦可，但 pnpm 官方推薦前者）。這類「宣告了但被靜默忽略」的設定沒有任何工具會警告，只能靠實際比對安裝版本才會發現。

## Goals / Non-Goals

**Goals:**

- overrides 真的生效，且有驗證方法
- 能直接控制的依賴升到安全版本
- 升級後功能不退化（以完整驗證鏈證明）

**Non-Goals:**

- 不追求「零漏洞」——多數傳遞依賴需等上游更新
- 不為 critical/high 的傳遞依賴強制加 override（相容風險 > 收益，另案評估）
- 不升級無安全問題的過時套件

## Decisions

### 決策 1：用 `pnpm.overrides` 而非 root `overrides`

兩者 pnpm 都吃，但 `pnpm.overrides` 是官方欄位、語意明確，且不會與 npm/yarn 的行為混淆。既有的三條一併搬過去。

### 決策 2：`nodemailer` 一併做 major 升級

先確認影響面再決定，而非因為是 major 就迴避：全專案只有 `NodemailerEmailAdapter.ts` 引用，且只用 `createTransport` + `sendMail`。六角架構把外部套件限制在 adapter 內，換版本的爆炸半徑只有一個檔案。

若 typecheck 或該檔的 spec 出現不相容，退回 8.x 並改以 override 處理。

### 決策 3：不追加傳遞依賴的 override

`shell-quote`（critical）等套件深埋在 `prisma` / `@nestjs/terminus` 的相依樹中。強制提版可能與上游期望的 API 不符，而這類問題往往在執行期才浮現——模板的穩定性優先於漏洞數字。待上游更新或有實際攻擊面時再處理。

## Risks / Trade-offs

- **[major 升級不相容]** → 影響面已確認為單一 adapter；驗證鏈涵蓋 typecheck、該檔 spec、完整 e2e。失敗即退回。
- **[修完仍有大量 moderate 漏洞]** → 屬已知狀態，記入 `tasks/todo.md` 追蹤，不假裝已解決。
- **[override 未來再次失效]** → spec 明訂驗證方式（`pnpm why` 比對實際版本），不可只憑宣告認定生效。
