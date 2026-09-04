## MODIFIED Requirements

### Requirement: 帳號解鎖

`POST /api/admin/security/unlock-account` SHALL 解除因登入失敗次數超過閾值而被鎖定的帳號。
成功 MUST 同時將 `lockedAt` 設為 `null` 且 `failedLoginCount` 歸零——
只清其一會讓帳號在下一次失敗就立刻重新被鎖。

本端點是**時效之外的補充手段，不是唯一的解除途徑**。鎖定本身會在
`APPLICATION_ACCOUNT_LOCK_DURATION_MIN` 之後自動解除（見 `api-auth` 的「登入」需求）。
這個定位差異是必要的：本端點需要一個已登入且具 SUPERADMIN 的管理員，
而觸發鎖定不需要認證——若它是唯一途徑，把已知的管理員 Email 全鎖一輪即可讓無人能登入解鎖。

`email` MUST 以正規化後的值（去頭尾空白 + 轉小寫）比對與清除，與登入路徑一致。
兩邊不一致的話，會出現「解鎖回報成功但那個人仍然被鎖」——因為清掉的是另一份計數。

成功 MUST 回 `204 No Content`，**沒有回應主體**。

**Request**（body，`email` 必填）：

```json
{ "email": "user@example.com" }
```

**Success Response** `204 No Content`：無 body。

**Failure Responses**：

- `400`：`email` 缺漏或格式不合法
- `404`、`code: "EMAIL_NOT_FOUND"`：查無該 Email 的帳號
- `409`、`code: "ACCOUNT_NOT_LOCKED"`：帳號存在但 `lockedAt` 為 `null`
- 其餘見「SUPERADMIN role gate」。

#### Scenario: 解鎖成功

- **WHEN** SUPERADMIN 對被鎖帳號送 `{ "email": "locked@example.com" }`
- **THEN** 回 `204`，該帳號 `lockedAt` 為 `null` 且 `failedLoginCount` 為 `0`

#### Scenario: 解鎖已逾時但尚未清除的帳號

- **WHEN** 該帳號的 `lockedAt` 不為 `null` 但已超過時效
- **THEN** 回 `204` 並完成清除，MUST NOT 回 `409`——`lockedAt` 仍有值，且清掉殘留的計數正是管理員的意圖

#### Scenario: 大小寫不同的 Email

- **WHEN** 帳號以 `foo@example.com` 被鎖，管理員送 `{ "email": "Foo@example.com" }`
- **THEN** 回 `204` 並確實解除該帳號的鎖定與計數

#### Scenario: 帳號不存在

- **WHEN** 該 Email 沒有對應帳號
- **THEN** 回 `404`、`code: "EMAIL_NOT_FOUND"`

#### Scenario: 帳號未鎖

- **WHEN** 該帳號存在但 `lockedAt` 為 `null`
- **THEN** 回 `409`、`code: "ACCOUNT_NOT_LOCKED"`
