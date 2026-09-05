## MODIFIED Requirements

### Requirement: 錯誤訊息單一真相

所有對外錯誤訊息 MUST 定義於單一檔案 `shared/constants/response-messages.ts`，
**不論它由哪一種 exception 產生**。任何會產生對外訊息的程式碼 MUST NOT 內嵌文案字面值。

該檔案 MUST 提供**兩張表**，因為兩類 exception 的錯誤碼來源不同：

| 表 | 對應 | 鍵 | 完整性保證 |
| --- | --- | --- | --- |
| `ResponseMessages` | `DomainException` 子類（業務錯誤） | `ResponseCode` | `satisfies Record<…>`，型別擋 |
| `HttpMessages` | 框架 `HttpException`（`UnauthorizedException` 等） | 語意名 | 無 |

`HttpMessages` 沒有型別層的完整性保證是**事實而非疏漏**：框架層的錯誤碼由 class 名推導，
同一個 `UNAUTHORIZED` 對應多種不同的失敗原因，不存在「每個碼一條訊息」的對應關係。
它的價值只在集中，不在完整性。

兩張表 MUST 放在同一個檔案。分成兩個檔案就要開兩個檔案才看得完，
而「一眼審視全部對外用詞」正是本需求的目的。

**框架層的訊息同樣是對外用詞**：`GlobalExceptionFilter` 對 `HttpException` 的處理是
`message: exception.message`，訊息原樣送給客戶端。

#### Scenario: 新增 domain exception

- **WHEN** 開發者新增一個 domain exception
- **THEN** 其訊息必須先在 `ResponseMessages` 定義，exception 本身只指定 code 與語意 kind

#### Scenario: guard 或 service 拋出框架例外

- **WHEN** 在 guard / service / controller / infrastructure 拋出 `UnauthorizedException` 等框架例外
- **THEN** 訊息 MUST 取自 `HttpMessages`，MUST NOT 在 throw 處寫字面值

#### Scenario: 審視全部對外文案

- **WHEN** 需要檢查錯誤文案的語氣與用詞是否一致
- **THEN** 只需閱讀 `response-messages.ts` 一個檔案，即涵蓋所有對外錯誤訊息

### Requirement: 動態訊息參數化

需要執行期資料的訊息（如角色名稱、使用中的帳號數）MUST 在訊息表中定義為函式，由呼叫端傳入參數。型別 MUST 強制此類 code 於建立 exception 時提供算好的訊息，不得依賴基底自動查表。

當 exception 的建構子收的是**呼叫端算好的字串**（如 `InvalidUploadException(reason)`），
那些 reason 的**措辭 MUST 同樣定義在 `response-messages.ts` 內**，
呼叫端 MUST 傳表裡的值而非字面值。

實際發生過：`INVALID_UPLOAD: (reason) => reason` 是恆等函式，於是五個呼叫端各自寫
自己的文案，而表裡什麼都沒記錄——**規則看起來被遵守，實際上沒有**。
處置是新增 `UploadRejectReasons` 承載那五種措辭，
而非禁止恆等函式本身：呼叫端一旦被守則守住，恆等函式就只是型別上的管道，
措辭已經在檔案裡了。

**要擋的是「措辭住在呼叫端」，不是參數化本身。** 真正需要帶入變數的訊息
（`找不到帳號: ${id}`）是合理的：措辭在表裡，只有資料來自呼叫端。

#### Scenario: 建立需要參數的 exception

- **WHEN** 建立 `DuplicateRoleNameException(name)`
- **THEN** 其訊息由訊息表的函式產生，文案本身仍集中在訊息表中

#### Scenario: 靜態訊息的 exception

- **WHEN** 建立訊息不需參數的 exception
- **THEN** 只需提供 code 與 kind，訊息由基底自訊息表取得

#### Scenario: 呼叫端算好訊息的 exception

- **WHEN** 建立 `InvalidUploadException(reason)`
- **THEN** `reason` 取自 `UploadRejectReasons`；在 throw 處寫中文字面值會被守則攔下
