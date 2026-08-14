## Context

23 個 domain exception 各自把訊息硬寫在 constructor。盤點後分佈為：

- **靜態訊息 17 個**：`'帳號已停用'`、`'找不到附件'`、`'預設角色不可刪除'` …
- **需要參數 6 個**：`DuplicateRoleName`（角色名）、`RoleHasMembers`（帳號數）、`InvalidPermissionCode`（code 清單）、`InvalidPermissionCombination`（domain 名）、`MemberNotFound`（可選 id）、`InvalidUpload`（訊息完全由呼叫端決定）

這個 6 : 17 的分佈是本設計的核心約束 —— 一個只支援字串的訊息表無法涵蓋，而讓所有子類都自行查表又會讓 17 個靜態案例變囉嗦。

另有 `add-engineering-guardrails` 標記的 4 處 domain `throw new Error`，目前掛在 `TEMPORARY` 豁免、指名由本 change 清除。

## Goals / Non-Goals

**Goals:**

- 全部對外錯誤文案集中在單一檔案，可一眼審視
- 錯誤碼與訊息的對應完整性由**型別**保證，不是靠測試或人工
- 修正 domain 驗證失敗回 500 的錯誤行為
- 既有 23 個 exception 的 code / status / 文案逐字不變

**Non-Goals:**

- **不引入 i18n 套件**（`nestjs-i18n` 等）。本 change 只做「訊息與程式碼分離」，讓未來換表可行；目前僅有繁體中文一種語系，引入套件是為不存在的需求付出複雜度
- 不調整既有文案的用詞或語氣（那是獨立的文案審查工作）
- 不改變 `kind → HTTP status` 的映射規則

## Decisions

### 決策 1：訊息表用 `satisfies Record<ResponseCode, ...>` 而非架構測試保完整性

```typescript
export const ResponseMessages = {
  ACCOUNT_DISABLED: '帳號已停用',
  DUPLICATE_ROLE_NAME: (name: string) => `角色名稱已存在：${name}`,
  // …
} as const satisfies Record<ResponseCode, string | ((...args: never[]) => string)>;
```

`Record<ResponseCode, ...>` 要求**每個** code 都有 key —— 新增錯誤碼卻忘了補訊息，`pnpm typecheck` 直接失敗。

*替代方案：* 寫一條架構測試比對兩邊的 key 集合。否決 —— 型別能表達的事不該退回用測試檢查：型別的回饋在編輯器裡即時出現，測試要等到跑才知道。這也呼應 `add-engineering-guardrails` 的既有判準：架構測試只做型別擋不住的部分。

用 `satisfies` 而非型別註記，是為了保留每個 key 的字面值型別（動態訊息的參數型別才不會被抹成 `never[]`）。

### 決策 2：`DomainException` 用建構子重載，讓型別強制「動態訊息必須傳入」

```typescript
// 訊息不需參數：只給 code 與 kind，基底自表中取
constructor(code: StaticResponseCode, kind: DomainExceptionKind);
// 訊息需要參數：呼叫端算好後傳入
constructor(code: ResponseCode, kind: DomainExceptionKind, message: string);
```

`StaticResponseCode` 由訊息表推導（值為 `string` 的 key），不需手寫維護：

```typescript
type StaticResponseCode = {
  [K in ResponseCode]: (typeof ResponseMessages)[K] extends string ? K : never;
}[ResponseCode];
```

效果：17 個靜態子類的 `super()` 從三個參數縮成兩個（比現況更短）；6 個動態子類若忘記傳訊息，**型別不給過**，不會拿到「函式被當成字串」這種執行期怪象。

*替代方案與否決理由：*

- **基底一律查表，動態訊息由基底做 `typeof entry === 'function'` 分支**：基底無法知道該傳什麼參數，只能回退成通用字串或丟出「不該發生」的 fallback。用型別擋掉的事，不該留一個執行期 fallback。否決。
- **所有子類都顯式傳訊息**（`super(code, kind, ResponseMessages.X)`）：型別最單純，但 17 個靜態案例每個都要多寫一次引用，且無法防止「code 用 A、訊息取 B」的錯配。否決。

### 決策 3：`InvalidUpload` 維持由呼叫端提供訊息

`InvalidUploadException(reason)` 的訊息完全來自呼叫端（副檔名不符、超過大小上限等各種原因）。訊息表中將其定義為 `(reason: string) => reason` 的恆等函式，讓它在型別上歸類為動態訊息、走「必須傳入」那條路。

這保留了現有彈性，同時讓「訊息表涵蓋所有 code」的不變式成立。後續若要收斂上傳失敗的原因為固定集合，應另開 change 拆成多個 code，不在本次範圍。

### 決策 4：新增的三個 domain exception 一律 kind `INVALID`

`InvalidMemberIdException`、`InvalidEmailException`、`InvalidMemberNameException` 的 kind 皆為 `INVALID`（→ 400）。這三者都是「客戶端送了不合法的值」，與既有 `DefaultRoleNotEditable`（`INVALID`）同類。

值得注意：多數情況下 Zod DTO 驗證會先擋下這些輸入，因此**不預期有 e2e 能觀察到行為變化**。修正的意義在於 domain 層自身的正確性 —— value object 是被服務層、mapper、seed 等多處呼叫的，不是只有 HTTP 入口。

### 決策 5：新架構規則以「中文字元」為偵測樣式

`no-inline-message.spec.ts` 掃 `src/domain/exception/**`，比對 `/['"`][^'"`]*[一-鿿]/` —— 出現含中文字元的字串字面值即違規。

誤判風險低（exception 檔只有 code、kind 與 import），且 TSDoc 註解不受影響（比對只針對引號內的字串）。訊息表本身不在掃描範圍。

## Risks / Trade-offs

- **[逐字搬移時改動文案]** → 搬移後 e2e 必須維持 138 tests 全綠（其中 29 個錯誤碼斷言會抓到 code 錯配）；文案本身另以 `git diff` 逐行核對訊息字串沒有變化。
- **[建構子重載讓子類寫法變複雜]** → 驗收標準是 17 個靜態子類的 `super()` 呼叫**變短**；若實作後發現反而更囉嗦，退回決策 2 的第二個替代方案（全部顯式傳訊息）。
- **[domain 驗證改拋 exception 影響既有呼叫端]** → `MemberId.of` / `Email.of` 的呼叫端若有 `try/catch` 針對 `Error` 做特殊處理會受影響；實作前以全文搜尋確認呼叫端的捕捉方式。
- **[中文字元偵測誤判]** → 若未來 exception 檔需要合法的中文字串（目前沒有此需求），該規則會擋下來；屆時以豁免清單處理，並在豁免理由中說明。

## Migration Plan

分三塊，每塊各自能通過驗證鏈：

1. **訊息表 + 基底重載 + 23 檔搬移**：純搬移，行為零變化，以 e2e 138 全綠為驗收。
2. **domain 驗證修正**：3 個新 exception + 3 個 code + 訊息，改寫 4 處 `throw new Error`，移除 `allowlist.ts` 的 3 筆 `TEMPORARY`（豁免過期檢查會確認確實清乾淨）。
3. **新架構規則 + 文件**：`no-inline-message.spec.ts` + 反向驗證 + `project.md` 更新。

回滾：三塊皆為程式碼層變更，不涉及資料庫或 API 契約，`git revert` 即可。

## Open Questions

- `InvalidUpload` 的原因是否該收斂成固定錯誤碼集合（目前是自由字串，前端無法針對不同原因做分支）？不在本次範圍，待前端有實際需求再議。
- 訊息表未來若成長到數百條，是否該按模組拆檔（`response-messages/member.ts` 等）？目前 33 條，單檔可讀，暫不拆。
