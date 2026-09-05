## MODIFIED Requirements

### Requirement: exception 不得內嵌文案字面值

架構檢查 SHALL 涵蓋**所有會產生對外訊息的層**：`src/domain/exception/`、
`src/adapter/in/web/`、`src/application/service/`、`src/infrastructure/`。
訊息一律引用 `response-messages.ts` 的兩張表之一。

**範圍要跟著「哪裡會產生對外訊息」走，不是跟著「這次發現的違規在哪」走。**
原本只掃 `domain/exception/`，於是二十多處寫在 guard 與 service 的文案完全不在視野內
——而它們經 `GlobalExceptionFilter` 的 `message: exception.message` 原樣送給客戶端，
地位與 domain exception 的訊息相同。

`domain/model` 與 `domain/value-object` MUST NOT 納入：它們有中文 TSDoc 與少量常數，
但不產生對外訊息，掃進來只會製造豁免清單。

#### Scenario: 把文案寫回 exception

- **WHEN** 某 domain exception 的 constructor 直接寫入中文訊息字面值
- **THEN** 架構測試失敗，訊息指出應改為引用訊息表

#### Scenario: guard 內嵌對外訊息

- **WHEN** 某 guard 寫 `throw new ForbiddenException('權限不足')`
- **THEN** 架構測試失敗，訊息指出應改為引用 `HttpMessages`，並標出檔案與行號

#### Scenario: 用樣板字串內嵌

- **WHEN** 訊息以反引號寫成（含或不含插值）
- **THEN** 同樣被攔截——`'` / `"` / 反引號三種寫法一律涵蓋

#### Scenario: 引用訊息表

- **WHEN** exception 只指定 code 與 kind，或傳入訊息表的值
- **THEN** 檢查通過

## ADDED Requirements

### Requirement: 判定的精準度須與掃描範圍相稱

擴大掃描範圍時，判定 MUST 同步收斂到「該擋的東西」，
MUST NOT 沿用只在原範圍成立的寬判準。

`domain/exception/` 可以用「任何中文字串字面值」當判準，是因為**那些檔案裡只有
例外建構**——沒有 log、沒有欄位驗證。那是該目錄的性質，不是判準本身的正確性。
範圍一擴大到 guard 與 service，前提就不成立：實測寬判準得到 79 處，其中真正的違規
只有二十多處，其餘全是**內部字串**——logger 訊息、System Log 的 action 名、
auth log 的 detail、信件主旨、Zod 欄位驗證訊息、health indicator 狀態描述。

因此非 `domain/exception/` 的層 MUST 精準比對例外建構子的字面值引數
（`new \w*Exception(` 後接含中文的字串）。

**MUST NOT 用「寬判準 + 豁免清單」解決。** 五十幾條豁免等於規則已死，
而且每條豁免都是未來的漏洞。

#### Scenario: 內部字串不得被誤判

- **WHEN** guard 寫 `this.logger.warn('Token 已在黑名單中')`，或 service 寫
  `z.string().email('請輸入有效的電子郵件')`
- **THEN** 檢查通過——那些不是對外例外訊息

#### Scenario: 掃描範圍失效

- **WHEN** 範圍設定被改回只剩 `domain/exception/`
- **THEN** 「掃描範圍有效」該條失敗，而不是靜默地退回原本的盲區

### Requirement: 守則自身須有合成輸入的測試

判定用的正規式 MUST 有一組合成輸入的測試，同時涵蓋**應命中**與**不應命中**兩側。

判定寫錯是靜默的：**偽陰性的守則比沒有守則更危險**，因為它讓人以為某件事已經被擋住。
本規則導入時的第一版盤點腳本只吃單引號，於是三處樣板字串沒被抓到——
**用來畫範圍的工具本身有盲區時，得到的清單會看起來很完整。**

#### Scenario: 判定退化

- **WHEN** 有人簡化正規式，使其不再涵蓋反引號或雙引號
- **THEN** 合成輸入的測試失敗，而不必等到真的有人寫出漏網的程式碼
