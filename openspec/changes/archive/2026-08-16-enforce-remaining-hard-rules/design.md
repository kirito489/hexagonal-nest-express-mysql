## Context

12 條 Hard Rules 中 7 條靠自律。本 change 處理其中「屬於程式碼約束」的三條——另外四條分別是語意判斷（訊息是否洩漏敏感資訊、`of()`/`trusted()` 是否用對路徑）與行為約束（不自行起 dev server、不改 `.env`），前者靜態掃描判不出，後者根本不是程式碼。

## Goals / Non-Goals

**Goals:** 把三條可機器判定的規則從「自律」升級為「違反即紅」；同時移除會讓規則失效的殘留入口。

**Non-Goals:** 不處理語意判斷型與行為約束型的規則——強行用掃描實作只會製造誤判，反而侵蝕對護欄的信任。

## Decisions

### 決策 1：DTO 規則同時檢查「有 z.infer」與「無手寫宣告」

只檢查「有 `z.infer`」不夠——一個檔案可以同時有 Zod schema 與手寫的 `interface`，實際用的是後者。因此兩者都查：必須出現 `z.infer`，且不得出現 `export class` / `export interface`（型別宣告）。

`export const xxxSchema` 與 `export type Xxx = z.infer<…>` 是預期寫法，不受影響。

### 決策 2：e2e 規則連「入口」一起守

只禁 `overrideProvider(PrismaService)` 不夠：`test-app.ts` 若保留 `prisma?` 這種 override 欄位，等於官方認可的繞道。規則同時檢查 helper 不得提供該欄位，並在本 change 直接移除它（現況 0 處在用）。

### 決策 3：`apps/web` 的 ESM 例外寫進規則而非豁免清單

`apps/web` 是 Vite 專案、ESM by design，這不是「暫時容忍的違規」而是**設計的一部分**。因此規則的掃描範圍直接限定 root 與 `apps/api`，不走豁免清單——豁免清單是給「該修但還沒修」的東西用的。

## Risks / Trade-offs

- **[DTO 規則誤判正當的手寫型別]** → 現況 0 違規；未來若有正當需求（如第三方型別解不到而需自定），再加豁免並註明理由。不預留豁免以免鬆綁過早。
- **[移除 deprecated 欄位破壞既有測試]** → 實測 0 處在用，且完整 e2e 會驗證。
