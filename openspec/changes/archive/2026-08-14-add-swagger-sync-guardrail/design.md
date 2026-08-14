## Context

API 契約經過三段轉換才到前端，只有最後一段（`schema.ts` → 前端）受 TypeScript 保護。前三段全靠人工記得跑指令。

探索期實測顯示現況是同步的（controller 35 條 / swagger 33 條，差異僅兩支 health 端點），因此本設計是**預防性**的，不需要處理既有的不一致。

一個關鍵的探索教訓：用正規表示式解析 OpenAPI yaml **會失敗**。首次比對得到「35 條全部不同步」的荒謬結果，原因是多行 `description: |` 區塊裡的文字被當成 path / method 節點。這直接決定了決策 2。

## Goals / Non-Goals

**Goals:**

- 三段轉換任一段不同步就有東西會紅
- 路由層級的檢查必須夠快（跟著 `pnpm test` 每次跑）
- 內容層級的檢查不得污染工作目錄

**Non-Goals:**

- 不自動修復（不在測試裡跑 bundle / generate 然後寫回檔案）
- 不驗證 swagger 描述文字的品質（tags、summary 是否完整）
- 不處理 front 側的 api-client（目前只有 admin 生成型別）

## Decisions

### 決策 1：路由層級用架構測試，內容層級用獨立指令

| 檢查層級 | 載體 | 成本 | 抓得到 |
| --- | --- | --- | --- |
| 路由集合 | 架構測試（純靜態） | 毫秒 | 新增/刪除 endpoint 未同步 |
| schema 內容 | `swagger:check` 指令 | 數秒（跑外部工具） | 欄位增刪、型別變更 |

路由層級涵蓋最常見的失誤，且夠快到可以每次跑。內容層級需要實際執行 `swagger-cli` 與 `openapi-typescript`，放進每次都跑的測試會拖慢回饋循環，因此獨立成指令，列入 Pre-Change Checklist。

*替代方案：* 全部塞進架構測試並執行外部工具。否決 —— 架構測試目前全部跑完 0.2 秒，加入數秒的外部指令會破壞「隨時可跑」的特性。

### 決策 2：用 `js-yaml` 解析，不用正規表示式

`js-yaml` 已存在於 lockfile（`swagger-cli` 的傳遞依賴），提升為 `apps/api` 的直接 devDependency。

*替代方案與否決理由：*

- **regex 解析**：探索期已實證會被多行 `description: |` 區塊誤導，產出 100% 假陽性。即使加上「縮排恰為 2 / 4」的限制仍不可靠，因為 block scalar 的內容縮排由第一行決定。否決。
- **改用 JSON 格式的 bundle**：`swagger-cli` 支援輸出 JSON，可用 `JSON.parse` 免依賴。但會改變既有產物格式、影響 `/api/admin/docs` 的載入方式，代價大於新增一個小型 devDependency。否決。

依賴 lockfile 中已存在的套件，安裝成本為零；顯式宣告則避免「傳遞依賴消失就壞掉」的隱性風險。

### 決策 3：路由正規化規則

兩邊的路由表示法不同，比對前必須正規化：

| 來源 | 表示法 | 正規化 |
| --- | --- | --- |
| NestJS controller | `@Controller('admin/members')` + `@Get(':id')` | 組成 `/api/admin/members/{id}` |
| OpenAPI | `servers[0].url` 為 `http://host/api/admin`，`paths` 為 `/members/{id}` | 取 servers 的 pathname 併上 paths |
| `schema.ts` | `paths` interface 的 key，同 OpenAPI 的相對 path | 同上 |

`:param` → `{param}`、去除重複斜線與結尾斜線。**參數名稱本身不參與比對**是刻意的：`{id}` 與 `{memberId}` 在路由結構上等價，強制同名只會製造無意義的失敗。

*註：* 實作時參數名仍保留在訊息中以利定位，只是比對時正規化為位置符號。

### 決策 4：`swagger:check` 產出到暫存目錄

用 `fs.mkdtempSync(path.join(os.tmpdir(), ...))` 建立暫存目錄，把 bundle 與 `openapi-typescript` 的輸出寫進去再與現有產物逐字比對，結束後清除。

這確保「檢查」不會變成「偷偷修改」—— 一個會改動工作目錄的檢查指令，在 CI 或 pre-commit 情境下會造成難以察覺的副作用。

## Risks / Trade-offs

- **[路由集合相同但內容不同步仍會漏]** → 由 `swagger:check` 涵蓋，並列入 Pre-Change Checklist；架構測試的失敗訊息會提示「內容層級請另跑 swagger:check」。
- **[豁免清單被濫用]** → 沿用既有的過期檢查（豁免的端點若消失就失敗），且每筆須附理由；health 端點的豁免理由是「監控用途，不屬對外 API 契約」。
- **[js-yaml 版本與 swagger-cli 脫鉤]** → 顯式宣告版本後，兩者各自升級不會互相影響；解析的是標準 OpenAPI 3.0 yaml，格式穩定。
- **[`swagger:check` 在無網路 / 未安裝環境失敗]** → 兩個工具都是既有 devDependency，不需額外安裝；失敗訊息需區分「產物過期」與「工具執行失敗」。

## Migration Plan

單一塊即可完成（皆為新增檔案與設定）：

1. 加 `js-yaml` devDependency、寫架構測試、建立豁免清單
2. 反向驗證三條規則（各插一次不同步探針）
3. 寫 `swagger:check` 腳本並驗證不污染工作目錄
4. 文件更新 + 完整驗證鏈

回滾：全為新增，`git revert` 即可。

## Open Questions

- front 側未來若也要生成 api-client 型別，第三段檢查需擴充為兩組（目前 `generate` 只處理 admin）。
- 是否該把 `swagger:check` 加進 husky pre-commit？目前傾向不加（數秒成本 × 每次 commit），先列入 Pre-Change Checklist 觀察。
