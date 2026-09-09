## ADDED Requirements

### Requirement: 一次性 token 的共同規則

驗證信與密碼重設共用 `user_tokens` 表，以 `purpose` 區分用途
（`VERIFY_EMAIL` / `RESET_PASSWORD`）。

- token MUST 由 `randomBytes(32)` 產生，DB **MUST 只存 sha256 雜湊**
  ——DB 外洩也無法反推出可用的 token。
- 消耗 token MUST 是**單一原子操作**（extended `where` 的 UPDATE：
  token + 未使用 + 未過期 + purpose 相符），MUST NOT 先查詢再更新。
  check-then-act 會讓同一枚 token 在並行請求下被用兩次。
- **claim 時 MUST 一併比對 `purpose`。** 少了它，拿驗證信的 token 就能重設密碼
  ——那是「信箱收得到信」升級成「改得了密碼」的提權，而兩者的取得難度差很多
  （驗證信在註冊當下就寄出，不需要知道密碼）。
- token 的產生與雜湊 MUST 與後台共用同一份實作。那是安全關鍵的程式碼，
  複製兩份的後果是其中一份修了 bug 另一份不會跟上，而不會有任何東西提醒你。

#### Scenario: 用驗證 token 呼叫重設密碼

- **WHEN** 以 `purpose = VERIFY_EMAIL` 的 token 呼叫 `reset-password`
- **THEN** 回 `400`——purpose 不符，claim 失敗

#### Scenario: 同一枚 token 用兩次

- **WHEN** 同一枚 token 連續消耗兩次
- **THEN** 第二次失敗（`usedAt` 已寫入）

#### Scenario: 過期的 token

- **WHEN** token 已超過其效期
- **THEN** claim 失敗

### Requirement: 前台註冊

`POST /api/front/auth/register` SHALL 建立一個**未驗證**的前台帳號並寄出驗證信。

**email 已存在時 MUST 回與成功完全相同的回應，且 MUST NOT 建立帳號。**
回 `409`「此信箱已註冊」是帳號列舉——任何人都能拿一份信箱清單問出誰有帳號。
此時 MUST 改寄一封「你的信箱已有帳號」的信給既有擁有者：
真正的擁有者收得到通知，攻擊者從回應看不出差別。

寄信 MUST NOT `await`（fire-and-forget）。SMTP 連不上會走滿 timeout，
讓「帳號已存在」比「不存在」慢兩個數量級——**那是比狀態碼更明顯的列舉訊號**。

新帳號的 `emailVerifiedAt` MUST 為 `null`。密碼 MUST 通過既有的密碼政策檢查。

**Request**：

```json
{
  "email": "user@example.com",
  "password": "FrontPass123!",
  "displayName": "小明"
}
```

**Success Response** `201 Created`：

```json
{
  "success": true,
  "data": { "message": "註冊成功，請至信箱收取驗證信" },
  "timestamp": "2026-09-09T06:00:00.000Z"
}
```

**Failure Responses**：

- `400`：欄位驗證失敗（含密碼不符政策）
- `429`：超過 IP 或信箱的節流上限

#### Scenario: 新信箱註冊

- **WHEN** 以未註冊的 email 呼叫
- **THEN** 回 `201`，建立 `emailVerifiedAt` 為 `null` 的帳號，並寄出驗證信

#### Scenario: 信箱已被註冊

- **WHEN** 以已存在的 email 呼叫
- **THEN** 回 `201`（與成功**完全相同**的回應），MUST NOT 新增帳號，
  改寄「你的信箱已有帳號」的通知信給既有擁有者

#### Scenario: 密碼不符政策

- **WHEN** 密碼長度或複雜度不足
- **THEN** 回 `400`

### Requirement: 信箱驗證

`GET /api/front/auth/verify-email?token=` SHALL 消耗 token 並寫入 `emailVerifiedAt`。

**回應 MUST 是 302 導回前台**，MUST NOT 回 JSON——這個網址是使用者在信件裡點的，
開啟的是瀏覽器，回 JSON 會讓他看到一坨 `{"success":true}`。

導向 `${APP_FRONT_URL}${APP_FRONT_VERIFY_REDIRECT_PATH}?status=<status>`，
`status` 為 `success` / `invalid` / `expired`，讓前台能給出不同的下一步
（重寄 vs 去登入）。

**失敗也 MUST 導回、MUST NOT 回 4xx**：使用者點的是信裡的連結，
一個瀏覽器錯誤頁對他沒有意義。

已驗證的帳號再次點擊 MUST 導向 `status=success`——對使用者而言結果一樣，
而區分「已經驗過」需要在 token 消耗失敗後再查一次帳號狀態，
那會把「token 無效」與「早就驗過」兩件事混在同一條路徑上。

**Request**（query）：

- `token: string` — 信件連結帶的一次性 token（必填）

**Success Response** `302 Found`（無 body）：

```
Location: ${APP_FRONT_URL}${APP_FRONT_VERIFY_REDIRECT_PATH}?status=success
```

**Failure Responses**：

- `302 Found`：token 無效 / 已使用 / 已過期 —— 導向同一路徑但 `status=invalid`。
  **刻意不回 4xx**：使用者點的是信裡的連結，一個瀏覽器錯誤頁對他沒有意義。
- `400`：完全沒有帶 `token` query（連導向都無從決定）


#### Scenario: 有效的驗證連結

- **WHEN** 點擊未使用且未過期的驗證連結
- **THEN** `emailVerifiedAt` 被寫入，302 導向 `?status=success`

#### Scenario: 過期的驗證連結

- **WHEN** token 已超過 `EMAIL_VERIFICATION_EXPIRES_IN`
- **THEN** 302 導向 `?status=expired`

#### Scenario: 無效或已使用的 token

- **WHEN** token 不存在或已被使用
- **THEN** 302 導向 `?status=invalid`

### Requirement: 重發驗證信

`POST /api/front/auth/resend-verification` SHALL 對未驗證的帳號重寄驗證信。

帳號不存在、或已完成驗證時 MUST 回與成功相同的回應且不寄信——同樣是防止帳號列舉。

重寄 MUST 作廢該帳號既有未使用的 `VERIFY_EMAIL` token：
兩枚同時有效的驗證連結沒有意義，而舊的那枚會在信箱裡留更久。

MUST 同時受 IP 與信箱節流。

**Request**：

```json
{ "email": "user@example.com" }
```

**Success Response** `204 No Content`（無 body）。

**Failure Responses**：

- `400`：欄位驗證失敗
- `429`：超過節流上限

#### Scenario: 未驗證的帳號

- **WHEN** 對未驗證的帳號呼叫
- **THEN** 回 `204` 並寄出新的驗證信，舊 token 作廢

#### Scenario: 已驗證或不存在的帳號

- **WHEN** 對已驗證的帳號、或不存在的 email 呼叫
- **THEN** 回 `204`，MUST NOT 寄信——回應與「有寄」時完全相同

### Requirement: 前台忘記密碼

`POST /api/front/auth/forgot-password` SHALL 對存在的帳號寄出密碼重設信。

帳號不存在時 MUST 靜默回傳相同的回應，且 MUST NOT 在 log 記錄該 email
——log 會累積成一份「哪些信箱未註冊」的列舉資料。

寄信 MUST NOT `await`（理由同註冊）。MUST 同時受 IP 與信箱節流。

**Request**：

```json
{ "email": "user@example.com" }
```

**Success Response** `204 No Content`（無 body）。

**Failure Responses**：

- `400`：欄位驗證失敗
- `429`：超過節流上限

#### Scenario: 帳號存在

- **WHEN** 以已註冊的 email 呼叫
- **THEN** 回 `204` 並寄出重設信（連結含 token）

#### Scenario: 帳號不存在

- **WHEN** 以未註冊的 email 呼叫
- **THEN** 回 `204`，不寄信、不記錄該 email

### Requirement: 前台重設密碼

`POST /api/front/auth/reset-password` SHALL 以 token 設定新密碼。

成功後 MUST：

1. 遞增 `users.tokenVersion`——**否則受害者改了密碼，攻擊者既有的 session 仍然有效**。
2. 作廢該帳號其他未使用的 `RESET_PASSWORD` token。

新密碼 MUST 通過既有的密碼政策檢查。

**Request**：

```json
{
  "token": "9f2c...",
  "newPassword": "NewFrontPass123!"
}
```

**Success Response** `204 No Content`（無 body）。

**Failure Responses**：

- `400`：token 無效、已使用、已過期、purpose 不符，或新密碼不符政策
- `429`：超過節流上限

#### Scenario: 有效的 token

- **WHEN** 以未使用且未過期的 `RESET_PASSWORD` token 呼叫
- **THEN** 回 `204`，密碼更新，該帳號所有既發 JWT 失效

#### Scenario: 重設後舊 token 失效

- **WHEN** 重設成功後，再用同一帳號另一枚未使用的重設 token
- **THEN** 回 `400`

#### Scenario: 新密碼不符政策

- **WHEN** 新密碼長度或複雜度不足
- **THEN** 回 `400`，密碼 MUST NOT 被更新

### Requirement: 註冊與寄信端點的雙層節流

註冊、重發驗證信、忘記密碼 SHALL 同時受 **IP 節流**與**信箱節流**。

兩者擋的是不同形狀，缺一不可：

| 攻擊形狀 | 擋它的 |
| --- | --- |
| 同一個 IP 對很多信箱各發一封 | IP 節流（`@Throttle`） |
| 對同一個信箱轟炸（換 IP / 代理池） | 信箱節流（Redis 計數） |

只做 IP 節流時，攻擊者換 IP 就能對同一個信箱一直寄信，
而**受害者是那個信箱的擁有者，他甚至沒有註冊過**。

信箱節流的 key MUST 用正規化後的 email。不正規化的話，交替大小寫就能讓每種寫法
各自累積一份計數——與帳號鎖定曾經被繞過的是同一個形狀。

Redis 不可用時信箱節流 MUST **fail-open**（只剩 IP 節流）。
這與登入節流的 fail-closed 相反，理由是後果不對稱：
登入節流失效等於暴力破解防護消失；寄信節流失效只是可能多寄幾封信，
而 fail-closed 會讓註冊完全不可用。

#### Scenario: 同一信箱短時間內多次請求

- **WHEN** 對同一個 email 超過信箱節流上限
- **THEN** 回 `429`，即使來源 IP 每次都不同

#### Scenario: 大小寫變化的同一信箱

- **WHEN** 交替使用 `User@Test.com` 與 `user@test.com`
- **THEN** 兩者累積到**同一個**計數器

#### Scenario: Redis 不可用

- **WHEN** Redis 連線失敗
- **THEN** 信箱節流放行，IP 節流仍然生效
