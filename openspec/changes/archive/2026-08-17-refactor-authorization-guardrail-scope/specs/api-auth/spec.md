## MODIFIED Requirements

### Requirement: 忘記密碼（防帳號列舉）

`POST /api/admin/auth/forgot-password` SHALL 寄送密碼重設信件。標記 `@Public()`。

**無論該 Email 是否存在，回應 MUST 完全相同**——同樣的 `204`、同樣沒有 body。
訊息文案由前端固定呈現，後端不回任何足以區分的內容。

MUST 套用嚴格節流：每來源每分鐘至多 3 次。這同時擋 SMTP 轟炸，
並壓低「存在與不存在的回應時間差」可被利用的次數。

**寄信 MUST NOT 阻塞回應**——MUST 以 fire-and-forget 執行，失敗只記錄於伺服器日誌。
狀態碼一致、回應無 body、email 不入日誌、節流都到位後，**剩下的訊號是時間差**：
`SMTP_HOST` 設定了卻連不上（憑證錯、防火牆、服務中斷）時會走滿 `connectionTimeout`
（預設 10 秒），使「帳號存在」的回應比「不存在」慢兩個數量級。這不需要統計方法就能
分辨，而節流只降低速率、不影響單次判定的可靠度。同一威脅在登入路徑上僅約 100ms
的差距就已用 dummy bcrypt 抹平；此處的差距大兩個量級。

成功 MUST 回 `204 No Content`，**沒有回應主體**。

**Request**（body，`email` 必填）：

```json
{ "email": "user@example.com" }
```

**Success Response** `204 No Content`：無 body。

**Failure Responses**：

- `400`：`email` 缺漏或格式不合法
- `429`：超過每分鐘 3 次的節流上限

#### Scenario: 存在與不存在的回應相同

- **WHEN** 分別以存在與不存在的 Email 送出
- **THEN** 兩者 MUST 回相同的 `204` 且皆無 body

#### Scenario: 節流生效

- **WHEN** 同一來源一分鐘內送出第 4 次請求
- **THEN** 回 `429`

#### Scenario: SMTP 無回應時仍立即返回

- **WHEN** 寄信因連線逾時而長時間未完成
- **THEN** endpoint MUST 已回應 `204`，不等待寄送結果

#### Scenario: 寄送失敗不改變回應

- **WHEN** 寄信拋出例外
- **THEN** 回應仍為 `204`，錯誤僅記錄於伺服器日誌，MUST NOT 出現在回應中
