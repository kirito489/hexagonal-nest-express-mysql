## MODIFIED Requirements

### Requirement: 登入

`POST /api/admin/auth/login` SHALL 以 Email 與密碼換發 Access Token 與 Refresh Token。
標記 `@Public()`，成功回 `200`（非 201——沒有建立資源）。
MUST 記錄來源 `ip` 與 `user-agent` 供稽核與 IP 封鎖機制使用。

啟用 reCAPTCHA 功能開關時，body MUST 帶 `recaptchaToken` 並通過驗證。

登入失敗 MUST NOT 區分「帳號不存在」與「密碼錯誤」——兩者一律回相同的 `401` 與相同訊息，
否則回應本身就成為帳號列舉的管道。連續失敗達閾值時帳號 MUST 被鎖定。

**帳號比對與失敗計數 MUST 使用正規化後的 Email**（去頭尾空白 + 轉小寫）。
計數的儲存鍵與資料庫查詢若對大小寫的處理不一致，攻擊者可交替變換大小寫，
讓每一種寫法各自累積一份永遠達不到閾值的計數，而每次嘗試都命中同一個帳號——
**閾值形同不存在**。正規化 MUST 涵蓋記錄失敗、重置計數、查詢狀態、鎖定與解鎖的**所有**路徑。

**鎖定 MUST 有時效**（`APPLICATION_ACCOUNT_LOCK_DURATION_MIN`，預設 15 分鐘），逾時自動解除。
沒有時效的版本是一個**沒有復原路徑的死結**：鎖定檢查排在密碼驗證之前，
被鎖的帳號連「密碼打對」都到不了清除計數那條路；而手動解鎖需要一個已登入且具 SUPERADMIN 的管理員
——把已知的管理員 Email 全鎖一輪就沒有人能登入解鎖，
而觸發鎖定完全不需要認證、也不需要猜對密碼。

時效 MUST 由 `lockedAt` 與設定值即時算出，MUST NOT 另存到期時間欄位——
後者會讓調整設定不影響既有紀錄，形成「設定顯示 15 分鐘、實際 60 分鐘」的不一致。

**到期時 MUST 一併清除失敗計數。** 計數的儲存有自己的存活時間（30 分鐘）且比鎖定時效長，
不清的話使用者在到期後第一次打錯就會因為「計數還在閾值上」立刻重新被鎖，
**實際鎖定時間變成計數的存活時間而非設定的時效**，而設定的那個數字看起來完全正常。

因此鎖定狀態的查詢 MUST 回三態（未鎖定 / 鎖定中 / 已到期）而非布林——
布林分不出「從未鎖定」與「鎖過但已到期」，而只有後者需要清除計數。
查詢方法本身 MUST NOT 有副作用，清除由呼叫端負責。

時效**不解決**「持續攻擊者可以每 N 分鐘重鎖一次」，那是 per-IP 限制
（`APPLICATION_IP_BLOCK_THRESHOLD`）的職責。它解決的是「永久且無復原路徑」。

**Request**（body，`email` / `password` 必填）：

```json
{
  "email": "user@example.com",
  "password": "mypassword123",
  "recaptchaToken": "03AGdBq26..."
}
```

**Success Response** `200 OK`：

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "accessTokenExpiresIn": 900,
    "refreshTokenExpiresIn": 86400,
    "member": {
      "id": "3f6c1b2a-8d4e-4a9f-b1c7-2e5d9a0f7b31",
      "email": "user@example.com",
      "member": "王小明",
      "roleName": "管理員"
    }
  },
  "timestamp": "2026-08-16T06:00:00.000Z"
}
```

**Failure Responses**：

- `400`：`email` 格式不合法或 `password` 缺漏；reCAPTCHA 開啟時缺 `recaptchaToken`
- `401`、`code: "UNAUTHORIZED"`：帳號不存在**或**密碼錯誤（兩者訊息一致）
- `403`、`code: "ACCOUNT_DISABLED"`：帳號 `status` 為 `false`
- `403`、`code: "PASSWORD_CHANGE_REQUIRED"`：帳號被標記為必須先重設密碼
- `423`、`code: "ACCOUNT_LOCKED"`：帳號因連續登入失敗而鎖定，且尚未逾時

#### Scenario: 登入成功

- **WHEN** 送出正確的 Email 與密碼且帳號啟用中
- **THEN** 回 `200`，`data` 含兩枚 Token、各自的有效秒數與 `member` 摘要

#### Scenario: 密碼錯誤與帳號不存在不可區分

- **WHEN** 分別以「不存在的 Email」與「存在但密碼錯誤」送出
- **THEN** 兩者 MUST 回相同的 `401` 與相同 `message`，回應內容不得讓呼叫端判斷帳號是否存在

#### Scenario: 帳號停用

- **WHEN** 帳號 `status` 為 `false` 且密碼正確
- **THEN** 回 `403`、`code: "ACCOUNT_DISABLED"`

#### Scenario: 帳號鎖定

- **WHEN** 帳號因連續登入失敗被鎖定且尚未逾時
- **THEN** 回 `423`、`code: "ACCOUNT_LOCKED"`，即使密碼正確

#### Scenario: 鎖定逾時後以正確密碼登入

- **WHEN** 帳號的 `lockedAt` 距今已超過設定的時效，且送出正確密碼
- **THEN** 回 `200` 正常登入，MUST NOT 回 `423`——時效是這個機制唯一不依賴他人的復原路徑

#### Scenario: 鎖定逾時後第一次再打錯密碼

- **WHEN** 帳號的鎖定已逾時，使用者送出**錯誤**密碼
- **THEN** 回 `401` 而非 `423`——逾時當下失敗計數已被清除，這次失敗是重新起算的第一次

#### Scenario: 以大小寫變化規避失敗計數

- **WHEN** 交替以 `foo@example.com` 與 `Foo@example.com` 送出錯誤密碼，總次數達到閾值
- **THEN** 帳號 MUST 被鎖定——兩種寫法計入同一份計數

#### Scenario: 需先重設密碼

- **WHEN** 帳號被標記為必須重設密碼
- **THEN** 回 `403`、`code: "PASSWORD_CHANGE_REQUIRED"`
