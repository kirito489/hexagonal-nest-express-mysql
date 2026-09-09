# smoke test：前台註冊 / 驗證 / 密碼重設

> 前置：`.env` 補齊 `APP_FRONT_URL` 等四個變數、跑過 `db:migrate`，並設定 SMTP
> （沒設也能跑，只是收不到信——寄信是 fire-and-forget，不影響 API 回應）。
> `pnpm dev` 後前台文件在 <http://localhost:3000/api/front/docs>。

## 1. ⭐ 帳號列舉的防護（本 change 的核心）

```bash
# 全新信箱
curl -s -X POST localhost:3000/api/front/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"brand-new@test.com","password":"FrontPass123!","displayName":"新人"}' \
  | jq -c '{status:.success, data}'

# 已存在的信箱（seed 建的 user@test.com）
curl -s -X POST localhost:3000/api/front/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@test.com","password":"FrontPass123!","displayName":"別人"}' \
  | jq -c '{status:.success, data}'
```

預期：**兩行輸出完全相同**（狀態碼也都是 201）。
不同就代表這支端點可以拿來問「誰在這個服務有帳號」。

差別只在**看不見的地方**：第二次沒有建立帳號，而且寄的是「你的信箱已有帳號」
的通知信給既有擁有者。

## 2. 信箱驗證

註冊後從信件取得連結（或從 DB 撈 token 的明文——撈不到，DB 只存 sha256，
所以請直接用信裡的連結）。

```bash
curl -s -o /dev/null -w '%{http_code} → %{redirect_url}\n' \
  "localhost:3000/api/front/auth/verify-email?token=<信裡的 token>"
```

預期：`302 → http://<APP_FRONT_URL>/verify-email?status=success`。

再點一次同一個連結：

```bash
curl -s -o /dev/null -w '%{http_code} → %{redirect_url}\n' \
  "localhost:3000/api/front/auth/verify-email?token=<同一個 token>"
```

預期：`302 → ...?status=invalid`（token 是一次性的）。
**失敗也是 302 而不是 4xx**——使用者點的是信裡的連結，錯誤頁對他沒有意義。

## 3. 重發驗證信

```bash
for email in unverified@test.com user@test.com ghost@test.com; do
  printf '%-24s ' "$email"
  curl -s -o /dev/null -w '%{http_code}\n' \
    -X POST localhost:3000/api/front/auth/resend-verification \
    -H 'Content-Type: application/json' -d "{\"email\":\"$email\"}"
done
```

預期：**三個都是 204**。只有第一個會真的寄信
（第二個已驗證、第三個不存在），而回應看不出差別。

## 4. 忘記 / 重設密碼

```bash
curl -s -o /dev/null -w 'forgot: %{http_code}\n' \
  -X POST localhost:3000/api/front/auth/forgot-password \
  -H 'Content-Type: application/json' -d '{"email":"user@test.com"}'

curl -s -o /dev/null -w 'reset: %{http_code}\n' \
  -X POST localhost:3000/api/front/auth/reset-password \
  -H 'Content-Type: application/json' \
  -d '{"token":"<重設信裡的 token>","newPassword":"BrandNew123!"}'
```

預期：兩者皆 `204`。重設後**該帳號所有既發的 JWT 立即失效**
（`tokenVersion` 遞增）——舊的 access token 打 `/api/front/me` 應回 401。

## 5. ⭐ token 的 purpose 隔離

拿**驗證信**的 token 去打重設密碼：

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST localhost:3000/api/front/auth/reset-password \
  -H 'Content-Type: application/json' \
  -d '{"token":"<驗證信的 token>","newPassword":"Hacked123!"}'
```

預期：`400`。少了這道比對，「信箱收得到信」就能升級成「改得了密碼」，
而驗證信在註冊當下就寄出，取得難度遠低於重設信。

## 6. 節流

```bash
for i in 1 2 3 4 5; do
  curl -s -o /dev/null -w "$i: %{http_code}\n" \
    -X POST localhost:3000/api/front/auth/forgot-password \
    -H 'Content-Type: application/json' -d '{"email":"user@test.com"}'
done
```

預期：前幾次 `204`，之後 `429`。

**兩層節流各擋一種形狀**：IP 節流擋「同一個 IP 對很多信箱各發一封」，
信箱節流擋「對同一個信箱轟炸」——後者換 IP 就繞過 IP 節流，
而受害者是那個信箱的擁有者。要驗信箱節流，換不同來源 IP 打同一個 email。
