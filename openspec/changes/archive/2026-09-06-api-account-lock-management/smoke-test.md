# smoke test：帳號鎖定列表

> 前置：`pnpm dev` 啟動、以 SUPERADMIN 登入取得 token。
>
> ```bash
> TOKEN=$(curl -s -X POST localhost:3000/api/admin/auth/login \
>   -H 'Content-Type: application/json' \
>   -d '{"email":"admin@test.com","password":"<你的密碼>"}' | jq -r .data.accessToken)
> ```

## 1. 預設查詢（只回鎖定中）

```bash
curl -s localhost:3000/api/admin/security/locks \
  -H "Authorization: Bearer $TOKEN" | jq
```

預期：`200`，`data.list` 只含 `status: "locked"` 的列，`data.meta` 有分頁資訊，
**`data.lockEnabled` 一定要在**。

## 2. 三種 status

```bash
for s in locked expired all; do
  echo "--- status=$s ---"
  curl -s "localhost:3000/api/admin/security/locks?status=$s" \
    -H "Authorization: Bearer $TOKEN" | jq '.data.list | map({email, status})'
done
```

預期：`expired` 只回已超過時效的、`all` 兩者都回。
每一列都帶 `unlocksAt`（不必自己拿 `lockedAt` 加設定值心算）。

## 3. email 模糊搜尋與分頁

```bash
curl -s "localhost:3000/api/admin/security/locks?status=all&search=admin&page=1&limit=5" \
  -H "Authorization: Bearer $TOKEN" | jq '.data.meta'
```

## 4. status 值不合法 → 400

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  "localhost:3000/api/admin/security/locks?status=unknown" \
  -H "Authorization: Bearer $TOKEN"
```

預期：`400`。

## 5. 非 SUPERADMIN → 403

用一個一般管理者的 token（即使持有全部 `BACKEND:*` 權限碼）：

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  localhost:3000/api/admin/security/locks \
  -H "Authorization: Bearer $PLAIN_TOKEN"
```

預期：`403`。security 模組是粗粒度 role gate，權限碼不管用。

## 6. ⚠️ 功能開關（測試看不出來的那件事）

`APPLICATION_ACCOUNT_LOCK_ENABLED` **預設 `false`**，關閉時登入路徑不會寫入
`locked_at`，這份清單會永遠是空的。

```bash
curl -s localhost:3000/api/admin/security/locks \
  -H "Authorization: Bearer $TOKEN" | jq '.data.lockEnabled'
```

- `false` → 前端必須顯示停用提示，空狀態說的是「**不會**產生鎖定紀錄」
- `true` → 空狀態才可以說「目前沒有帳號被鎖定」

**兩者在畫面上長得一模一樣，但意義相反。**

## 7. 端到端：鎖定 → 列表 → 到期 → 解鎖

需要 `APPLICATION_ACCOUNT_LOCK_ENABLED=true`（改 `.env` 後重啟）。

```bash
# 連續打錯到門檻（預設 3 次）
for i in 1 2 3; do
  curl -s -o /dev/null -X POST localhost:3000/api/admin/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"email":"target@test.com","password":"wrong"}'
done

# 該帳號應出現在列表，status=locked
curl -s localhost:3000/api/admin/security/locks \
  -H "Authorization: Bearer $TOKEN" | jq '.data.list[] | select(.email=="target@test.com")'

# 此時用正確密碼登入應被擋（423 / ACCOUNT_LOCKED）
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:3000/api/admin/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"target@test.com","password":"<正確密碼>"}'

# 解鎖（沿用既有端點，不是 DELETE /locks/:id）
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:3000/api/admin/security/unlock-account \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"email":"target@test.com"}'
```

預期最後回 `204`，且該帳號隨即可以登入、並從預設清單中消失。

**已到期的列同樣可以解鎖**（清掉殘留的 `locked_at` 與失敗計數）——
本專案的解鎖服務只拒絕「從未鎖定」的帳號，而那種帳號不會出現在這份清單上。
