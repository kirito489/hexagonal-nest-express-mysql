## Context

`GlobalExceptionFilter` 對 `HttpException` 的處理是 `message: exception.message`——**訊息原樣送給客戶端**。所以 guard 與 service 裡那些 `throw new UnauthorizedException('…')` 的字串就是對外用詞，與 domain exception 的訊息地位相同，只是沒有被集中。

既有結構的兩個硬限制：

- `ResponseMessages` 是 `satisfies Record<ResponseCode, …>`——**完整性由型別保證**（少一條就 `TS1360`）。往裡面加 `UNAUTHORIZED` 這種非 `ResponseCode` 的鍵會直接破壞那個保證。
- `ResponseCodes` 刻意不含框架層的碼。`platform-api-error-response` 記載：「錯誤碼有兩個來源且不可混淆——`DomainException` 子類自帶 `ResponseCodes` 常數（業務錯誤），NestJS `HttpException` 則由 class name 推導（框架層）」。

另外，盤點時發現 `INVALID_UPLOAD: (reason: string) => reason` 是**恆等函式**。它讓 `InvalidUploadException` 表面上合規（訊息「取自」訊息表），實際上五個呼叫端各自寫自己的文案，而表裡什麼都沒有。

## Goals / Non-Goals

**Goals:**

- 全部對外訊息在一個檔案裡看得完
- 守則的掃描範圍涵蓋所有會產生對外訊息的層
- 堵住「參數化訊息」這個把集中管理架空的逃生門
- 對外行為完全不變（文字逐字保留）

**Non-Goals:**

- **不把框架層 throw 改成 domain exception**。那要為每種失敗新增 `ResponseCodes`（`SESSION_IDLE_EXPIRED`、`IP_BLOCKED`…），語意上更精確，但那是**對外契約變更**（現在回 `UNAUTHORIZED` / `FORBIDDEN`），且推翻 spec 已記載的兩來源設計。範圍與風險都不成比例。
- **不動 `GlobalExceptionFilter`**：`message: exception.message` 的行為是對的，問題在訊息從哪來。
- **不導入 i18n**。集中是 i18n 的前置條件，但本身不是 i18n。
- **不改任何文案的措辭**。搬家就是搬家，改字會讓「e2e 仍綠」失去驗證意義。

## Decisions

### D1：第二張表 `HttpMessages`，與 `ResponseMessages` 同檔

不選「加進 `ResponseMessages`」：那張表的完整性由 `satisfies Record<ResponseCode, …>` 保證，混入非 `ResponseCode` 的鍵會讓那個保證失效——**而那個保證正是它最有價值的地方**（少一條訊息當場編譯失敗）。

不選「開一個新檔案」：Hard Rule 的目的是「集中後才能一眼審視全部對外用詞」。分兩個檔案就要開兩個檔案才看得完，而那正是它想避免的。

同檔兩張表，各自的完整性機制不同：

| 表 | 鍵 | 完整性保證 |
| --- | --- | --- |
| `ResponseMessages` | `ResponseCode` | `satisfies Record<…>`，型別擋 |
| `HttpMessages` | 語意名（自由） | 無——它沒有對應的碼可以對照 |

`HttpMessages` 沒有型別層的完整性保證是**事實而非疏漏**：框架層的錯誤碼由 class 名推導，同一個 `UNAUTHORIZED` 對應六種不同的失敗原因，不存在「每個碼一條訊息」的對應關係。它的價值只在集中，不在完整性。

### D2：`INVALID_UPLOAD` 的恆等函式收斂為列舉

現況 `(reason: string) => reason` 讓呼叫端傳什麼就是什麼。改為五個具名常數：

- 三種帶變數的（資料夾、MIME、大小上限）→ 表裡放模板函式，變數仍可帶入但**措辭在表裡**
- 兩種靜態的 → 純字串

這樣 `InvalidUploadException` 的建構子仍收 `reason: string`（介面不變），但呼叫端傳的是表裡的值而非字面值。

不選「把 reason 改成聯集型別」：那會讓 exception 綁死目前這五種，未來新增一種要同時改型別與表。用「呼叫端傳表裡的值」保留彈性，由守則盯著別再寫字面值。

### D3：不加「訊息表不得出現恆等函式」的檢查 —— 實作後推翻原設計

原本要加一條「訊息表出現 `(x) => x` 就紅」。寫完跑起來才想清楚**它擋錯了東西**。

恆等函式之所以是問題，**只因為呼叫端可以傳字面值**。呼叫端一旦被守住（見 D4），
`INVALID_UPLOAD: (reason) => reason` 就只是一個型別上的管道——措辭已經在同一個檔案的
`UploadRejectReasons` 裡了，「一眼看完全部對外用詞」的目的完全達成。

也就是說這條規則今天就有一個偽陽性，而為了滿足它得把 `INVALID_UPLOAD` 扭成別的形狀
（加前綴會改動對外文字，改聯集型別是 3.4 已否決的）。**為了規則去扭曲程式碼，
方向就反了。**

真正該保證的性質是「措辭在訊息表檔案裡，不在呼叫端」，那由 D4 的呼叫端掃描直接擋。
規格改記這個性質。

### D4：守則的判定要精準到「例外建構子的引數」—— 實作後修正

原本打算沿用 `domain/exception/` 的寬判準（任何「引號 + 中文」），掃描範圍擴到
`src/adapter/in/web/`、`src/application/service/`、`src/infrastructure/`。

**實測結果 79 處，其中真正的違規只有二十多處。** 多出來的五十幾處全是**內部字串**，
不是對外訊息：

| 誤抓的類型 | 例子 |
| --- | --- |
| logger 訊息 | `this.logger.warn('Token 已在黑名單中')` |
| System Log 的 action 名 | `{ action: '異常紀錄' }` |
| auth log 的 detail 欄位 | `handleLoginFailure(…, '密碼錯誤')` |
| 信件主旨 | `subject: '密碼重設通知'` |
| Zod 欄位驗證訊息 | `z.string().email('請輸入有效的電子郵件')` |
| health indicator 狀態 | `indicator.down({ message: 'Redis 未回應' })` |

寬判準在 `domain/exception/` 能用，是因為**那些檔案裡只有例外建構**——沒有 log、
沒有驗證。那是那個目錄的性質，不是判準本身的正確性。範圍一擴大，前提就沒了。

所以兩個範圍用兩個判準：`domain/exception/` 維持寬判準，其餘三層精準比對
`new \w*Exception\(` 後面的字面值引數（涵蓋 `'` / `"` / 反引號三種）。

不選「寬判準 + 豁免清單」：五十幾條豁免等於規則已死，而且每條豁免都是未來的漏洞。

不選「只掃 guard」：那就是照著已知的違規畫範圍，下一個寫在 service 的照樣漏掉——
**規則的範圍要跟著「哪裡會產生對外訊息」走，不是跟著「這次發現的違規在哪」走**。

`domain/model` 與 `domain/value-object` 不納入：它們有中文 TSDoc 與少量常數，
但不產生對外訊息。

## Risks / Trade-offs

- **[24 處搬家可能搬錯字]** → 對外行為不變是本 change 的驗收標準；e2e 有數條斷言訊息內容，搬錯會變紅（實際結果：165 條全綠）。另外用腳本把 diff 移除的中文片段逐條比對訊息表。
- **[`HttpMessages` 沒有完整性保證，可能長出沒人用的死鍵]** → 與 `ResponseCodes` 的死碼檢查同型的問題。本 change 不加那條檢查（`response-codes.spec.ts` 已有對應機制可供未來比照），先觀察它會不會真的發生。
- **[擴大掃描範圍會掃出本 change 沒處理的東西]** → **實際發生了，而且比預期嚴重**：寬判準掃出 79 處。原本寫在這裡的「盤點時已用精確的正規式掃過全 `src/`，24 處是完整清單」**是錯的**——那支腳本只找 `throw new XxxException('中文')`，而寬判準找的是所有中文字串，兩者量的是不同的東西。處置見 D4：改用精準判準，讓掃描量到的東西與規則想擋的東西一致。
  - 這裡真正的教訓不是「數錯了」，而是**用寬判準畫範圍時，「掃到的」與「該擋的」是兩個集合**；沒對齊就會走向豁免清單，而豁免清單一長，規則就名存實亡。
- **[未來新增訊息時多一次「該進哪張表」的判斷]** → 判準單純：拋 `DomainException` 進 `ResponseMessages`，拋框架 `HttpException` 進 `HttpMessages`。寫進 `backend-utilities.md`。
## Migration Plan

無 migration、無 API 契約變更。所有訊息文字逐字保留，狀態碼與錯誤碼完全不動。
