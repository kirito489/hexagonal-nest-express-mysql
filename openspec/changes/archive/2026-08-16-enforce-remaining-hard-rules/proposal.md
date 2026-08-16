# 補守剩餘的 Hard Rules（enforce-remaining-hard-rules）

## Why

`improve-agent-tooling` 為 12 條 Hard Rules 標註強制方式後，浮現一個清單：**只有 5 條有機器守，7 條純靠自律**。

盤點那 7 條，可分三類：

| 類型 | 條目 | 能否機器守 |
| --- | --- | --- |
| 程式碼約束 | 不得手寫 DTO、不得 mock 資料庫、不得設 `"type": "module"` | **可以** |
| 語意判斷 | Exception 訊息不得洩漏敏感資訊、`of()` / `trusted()` 用錯路徑 | 難（需判斷呼叫情境） |
| 行為約束 | 不得自行啟動 dev server、不得修改 `.env` | 不適用（不是程式碼） |

第三類本來就不該期待用測試守——它們留在 CLAUDE.md 是對的。本 change 只處理**第一類的三條**。

現況實測**皆無違規**（19 個 Request/Query 全用 `z.infer`、e2e 無 mock、`"type": "module"` 只出現在明文例外的 `apps/web`），因此導入零豁免。

順帶清一個殘留：`test-app.ts` 的 `TestAppOverrides.prisma` 標著 `@deprecated ... 待 4 支 CRUD spec 轉完移除此欄位`，而 e2e 早已全數轉為真 DB、**0 處在用**——條件滿足卻沒人回頭刪。它同時是「允許 mock 資料庫」的殘留入口，留著會讓新規則形同虛設。

## What Changes

- **`dto-from-zod.spec.ts`**：`adapter/in/web/**/*{Request,Query}.ts` 必須以 `z.infer` 推導型別，且不得出現手寫的 `class` / `interface` 型別宣告。
- **`e2e-real-database.spec.ts`**：e2e 不得覆寫 `PrismaService`；`test-app.ts` 不得再提供 mock 資料庫的入口。
- **`commonjs-baseline.spec.ts`**：root 與 `apps/api` 的 `package.json` 不得有 `"type": "module"`（`apps/web` 為明文例外，Vite ESM by design）。
- **移除 `TestAppOverrides.prisma`** 這個 deprecated 欄位。

## Capabilities

### Modified Capabilities

- `engineering-guardrails`: 三條原本靠自律的 Hard Rule 改為機器強制。

## Impact

**新增**：三支架構測試（各含「掃描數 > 0」自我檢查）

**修改**：`apps/api/test/test-app.ts`（移除 deprecated 欄位）、`CLAUDE.md`（三條的標註由 `自律` 改為 `測試`）

**風險**

- DTO 規則以「檔名 + 內容樣式」判斷，若未來有正當理由手寫型別（例如 multer 的 `Express.Multer.File` 已在 controller 自定最小型別），需以豁免處理。實測現況 0 違規，先不預留豁免以免鬆綁過早。
