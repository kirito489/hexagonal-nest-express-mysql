## Context

`/api/members` 與 `/api/roles` 兩支 list endpoint 既有實作：

- 都用 Prisma 的 `findMany` + `count` 在 `$transaction` 內取分頁資料
- where 條件含 `deletedAt: null`（軟刪除過濾）+ 可選的名稱模糊搜尋
- 回應每筆都含 `status: boolean`，但 query 不接受 status 過濾

前端兩支列表頁的搜尋列已有 name / email debounce 300ms 寫入 URL；URL state hook 已有完整 setSearch / setPage / setLimit + edit / view 多 query 同步機制。本次擴充延續既有 pattern，不新增其他形態的元件或抽象。

## Goals / Non-Goals

**Goals：**

- 後端兩支 list 都接受 `?status=true|false` query；不帶為「不過濾」。
- 前端兩支列表搜尋列加「狀態」下拉，與既有 name / email 並排。
- URL state 同步：`?status=true|false`，全部時不寫該參數；切 status 自動 reset page=1。
- 共用一個 `StatusFilterSelect`，未來其他列表頁（如未來的 permissions / logs）也能直接複用。

**Non-Goals：**

- 不做「多選 status」（boolean 只有 true / false 兩值，多選等於「全部」）。
- 不導入 query builder 抽象層；後端只是多一個 zod schema 欄位 + Prisma where 條件。
- 不改變既有 `deletedAt: null` 軟刪除過濾語意；status 僅是「啟用 / 停用」業務狀態。
- 不對 status 欄位做 server-side 排序；現有列表沿用 `createdAt desc`。

## Decisions

### D1：後端 query 型別 — `z.coerce.boolean().optional()`

- **選擇**：`status: z.coerce.boolean().optional()`，與既有 `page` / `limit` 的 `z.coerce.number()` pattern 一致。
- **替代方案**：`z.enum(['true', 'false']).optional()`；自寫 transform。
- **理由**：zod 內建 coerce 對 query string 已夠用；`coerce.boolean()` 把 `'true' / 'false' / '1' / '0' / 空字串` 等都會處理（注意 zod boolean coerce 把任何非空字串都視為 true，但搭配 `.optional()` 與 OpenAPI 限制 enum: `[true, false]`，前端只會送這兩個值，足夠）。
- **Risk**：若使用者手動帶 `?status=foo`，zod 會解析為 `true`。**Mitigation**：Swagger 明確 enum；前端只送 true/false，攻擊面接受（不過濾敏感資料）。

### D2：where 條件套法

- 與既有 name 搜尋同 pattern：`...(params.status !== undefined ? { status: params.status } : {})`。
- 必要：不能寫 `{ status: params.status }` 後再判斷 `undefined`，那會讓 Prisma 認為要找 `status = null` 反而拿不到資料。

### D3：URL state — `'true' | 'false' | undefined`

- **選擇**：URL state 內部用字串 `'true' | 'false'`（與 URLSearchParams 自然對應），undefined 表示「全部」。
- **替代方案**：用 boolean | null；但 URL params 解析需要轉型，多一層摩擦。
- **轉換點**：
  - URL → state：`searchParams.get('status') === 'true' ? 'true' : searchParams.get('status') === 'false' ? 'false' : undefined`
  - state → API：`status === 'true' ? true : status === 'false' ? false : undefined`
- **理由**：URL 是字串、API 是 boolean，前端 hook 內做兩次轉換最直觀；中間層 state 用字串對使用者也最像 URL 行為。

### D4：StatusFilterSelect 元件設計

- **位置**：`apps/web/src/components/StatusFilterSelect.tsx`（全域 reusable，非綁定 members / roles）。
- **API**：
  ```ts
  type Value = 'all' | 'true' | 'false'
  type StatusFilterSelectProps = {
    value: Value           // 元件內部用 'all' 代表「全部」，呼叫端 undefined ↔ 'all' 轉換
    onChange: (v: Value) => void
  }
  ```
- **替代方案**：直接吃 `undefined`，但 shadcn Select 的 value 不能是 undefined（會被當不受控）。用 sentinel `'all'` 比較乾淨。
- **shadcn 元件**：沿用既有 `Select` / `SelectContent` / `SelectItem`（已加在 ui/）。
- **不重設**：onChange 由父層處理「reset page=1」。

### D5：與既有 setSearch 的整合

- **選擇**：URL state hook 新增 `setStatus(status: 'true' | 'false' | undefined)`，內部 `update({ status, page: DEFAULT_PAGE })`。
- **不擴張既有 setSearch 簽章**：避免呼叫端要傳第三個 / 第四個參數。setSearch 仍只管 name / email；setStatus 獨立。

### D6：StatusFilterSelect 與 SearchBar 的耦合

- **選擇**：SearchBar 拆 props 接 `initialStatus` + `onStatusChange`，與 `initialName` / `onSearch` 並列。
- **替代方案**：把整個 URL state 物件傳進 SearchBar — 違反現有「dumb component」分工。
- **理由**：SearchBar 不需知道 URL，只是 controlled UI；父層 page 拿 URL state 後傳 props 進來。

### D7：後端 e2e mock 對齊

- `mockPrisma.role.findMany` / `member.findMany` 預設 mock 不變（不需依 status 切分）。
- 新增測試只多 assertion：檢查 `findMany.mock.calls[0][0].where` 含 / 不含 `status` key。

## Risks / Trade-offs

- **[Risk] `z.coerce.boolean()` 行為**：傳 `?status=foo` 會被視為 true（非空字串）。**Mitigation**：Swagger 明確 enum；前端只送合法值。若有疑慮，未來換 `z.enum(['true', 'false']).transform(...)` 嚴格化，相容性無痛。
- **[Risk] mock spec 對 listMembers / listRoles 簽章敏感**：若 LoadMemberPort / RoleRepositoryPort 的 `ListXxxParams` 簽章加 `status`，所有 mock 此 port 的 spec 都會 TypeScript 報錯。**Mitigation**：簽章 status 是 `optional`，TypeScript 對缺欄位的 mock 不會報錯；只有「明確傳給 mock 的物件」會校驗，影響面小。
- **[Trade-off] 內部 state 字串 vs boolean**：字串多兩次轉換，但避免「null vs undefined」歧義；可接受。
- **[Trade-off] StatusFilterSelect 放 `components/` 而非 `routes/members/components/`**：第一個使用點只有兩個，但本來就會跨模組，直接上提省得未來搬家。

## Migration Plan

純功能擴充，無資料 migration。分階段：

1. **後端 query / port / service / repo / Swagger** —— 一次到位（4 個檔）。
2. **重打 api-client + 修 mock spec**（若有）。
3. **後端 e2e 新測試**。
4. **前端共用元件 StatusFilterSelect**。
5. **前端 URL state + query hook 加 status**。
6. **前端 SearchBar 整合**。
7. **驗證 + 手動測試**。

回退策略：純加欄位 / 加參數，舊呼叫端不傳 status 行為等同未過濾，向後相容；如要回退僅 revert commit。

## Open Questions

- **`z.coerce.boolean()` 嚴格化？**：第一版先用 coerce + Swagger enum 限制；若日後發現有人手寫 client 觸發 ambiguous 行為，再改 `z.enum` 嚴格化。
- **「停用 + 啟用同時顯示」是否要 visual hint？**：第一版不做（與「不帶 status」一致）；若未來加上「篩選有套用」的提示徽章可一起重做。
