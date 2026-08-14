## ADDED Requirements

### Requirement: exception 不得內嵌文案字面值

架構檢查 SHALL 確保 `src/domain/exception/**` 不出現中文字串字面值。訊息一律引用 `response-messages.ts`，避免文案在訊息表建立後又被寫回 constructor。

#### Scenario: 把文案寫回 exception

- **WHEN** 某 domain exception 的 constructor 直接寫入中文訊息字面值
- **THEN** 架構測試失敗，訊息指出應改為引用訊息表

#### Scenario: 引用訊息表

- **WHEN** exception 只指定 code 與 kind，或傳入訊息表函式的回傳值
- **THEN** 檢查通過
