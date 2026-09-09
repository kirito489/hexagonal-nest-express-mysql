# smoke test：前台認證

> 前置：`.env` 補上 `FRONT_ACCESS_SECRET` / `FRONT_REFRESH_SECRET`（各 ≥32 字元），
> 跑過 `db:migrate` 與 `db:seed`，然後 `pnpm dev`。
> 前台文件在 <http://localhost:3000/api/front/docs>。

## 1. 登入

```bash
FRONT=$(curl -s -X POST localhost:3000/api/front/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@test.com","password":"User1234!"}')
echo "$FRONT" | jq
FRONT_AT=$(echo "$FRONT" | jq -r .data.accessToken)
FRONT_RT=$(echo "$FRONT" | jq -r .data.refreshToken)
```

預期：`200`，`data.user.emailVerified` 為 `true`（seed 的第一個帳號已驗證）。

未驗證的帳號一樣登得進來（本階段 `emailVerifiedAt` 只存不判斷）：

```bash
curl -s -X POST localhost:3000/api/front/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"unverified@test.com","password":"User1234!"}' | jq '.data.user'
```

## 2. 帳號列舉的防護

```bash
for body in '{"email":"user@test.com","password":"wrong"}' \
            '{"email":"ghost@test.com","password":"User1234!"}'; do
  curl -s -X POST localhost:3000/api/front/auth/login \
    -H 'Content-Type: application/json' -d "$body" | jq -c '{status:.success, message}'
done
```

預期：**兩行輸出完全相同**。不同就代表這支端點可以拿來列舉帳號。

## 3. 個人資料

```bash
curl -s localhost:3000/api/front/me -H "Authorization: Bearer $FRONT_AT" | jq
```

## 4. ⭐ 跨側隔離（本 change 的核心）

```bash
ADMIN_AT=$(curl -s -X POST localhost:3000/api/admin/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@test.com","password":"Admin1234!"}' | jq -r .data.accessToken)

# 後台 token 打前台 → 401
curl -s -o /dev/null -w 'admin→front: %{http_code}\n' \
  localhost:3000/api/front/me -H "Authorization: Bearer $ADMIN_AT"

# 前台 token 打後台 → 401
curl -s -o /dev/null -w 'front→admin: %{http_code}\n' \
  localhost:3000/api/admin/roles -H "Authorization: Bearer $FRONT_AT"
```

預期：**兩者都是 401**。兩側用各自的 secret，所以這裡是**簽章驗不過**，
而不是「驗過了但 side 不對」——那正是各自 secret 的用意：
忘記比對 side 時它仍然 fail-closed。

## 5. Refresh 與登出

```bash
curl -s -X POST localhost:3000/api/front/auth/refresh \
  -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"$FRONT_RT\"}" | jq '.data.accessToken'

curl -s -o /dev/null -w 'logout: %{http_code}\n' \
  -X POST localhost:3000/api/front/auth/logout -H "Authorization: Bearer $FRONT_AT"

# 登出後原本的 token 與 refresh token 都應失效
curl -s -o /dev/null -w 'me after logout: %{http_code}\n' \
  localhost:3000/api/front/me -H "Authorization: Bearer $FRONT_AT"
curl -s -o /dev/null -w 'refresh after logout: %{http_code}\n' \
  -X POST localhost:3000/api/front/auth/refresh \
  -H 'Content-Type: application/json' -d "{\"refreshToken\":\"$FRONT_RT\"}"
```

預期：`logout: 204`，之後兩個都是 `401`（`tokenVersion` 已遞增）。
