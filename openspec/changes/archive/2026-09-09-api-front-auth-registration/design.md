## Context

上一支（`api-front-auth-account`）留下的現況：

- `users` 表有 `emailVerifiedAt`，但**沒有任何程式會寫入它**。
- 前台只有 login / refresh / logout / me，帳號只能由 seed 產生。

後台的密碼重設流程已經解決過本支會遇到的多數問題，而且解法是對的：

| 既有做法 | 為什麼對 |
| --- | --- |
| 查無帳號時**靜默回傳**，不回報 | 否則端點變成帳號列舉工具 |
| 寄信**不 await**（fire-and-forget） | SMTP 連不上會走滿 timeout，讓「帳號存在」比「不存在」慢兩個數量級——那比狀態碼更明顯的列舉訊號 |
| token 用 `randomBytes(32)`，DB **只存 sha256** | DB 外洩也無法反推出可用的 token |
| claim 用 extended `where` 一次 UPDATE（token + 未使用 + 未過期） | 原子操作，沒有 check-then-act 的競態 |

**本支要沿用這四點，而不是重新想一遍。**

## Goals / Non-Goals

**Goals:**

- 前台使用者能自己註冊，且 `emailVerifiedAt` 真的會被寫入。
- 忘記密碼有復原路徑。
- 註冊與寄信端點擋得住兩種濫用形狀（打很多信箱 / 打同一個信箱）。

**Non-Goals:**

- reCAPTCHA、社群登入、改密碼、後台管理前台使用者、前端畫面。
- **未驗證信箱的功能門檻**：沒有東西可擋（同上一支的理由）。
- **不動 admin 的密碼重設行為**——只抽共用函式，行為逐字不變。

## Decisions

### D1：`user_tokens` 單表帶 `purpose`，不是兩張表

驗證信與密碼重設的 token 在機制上完全相同（一次性、有效期、只存雜湊、原子 claim），
差別只有「用途」與「效期」。開兩張表會把同一段邏輯寫兩次。

`purpose` 用 **MySQL 的 enum**（`VERIFY_EMAIL` / `RESET_PASSWORD`）而非自由字串：
打錯字的後果是「token 永遠 claim 不到」，而那看起來像 token 失效，
不像程式錯誤——**排查方向會被帶偏**。

**claim 時 MUST 一併比對 `purpose`**。少了它，拿驗證信的 token 就能重設密碼
——那是一個「信箱收得到信」升級成「改得了密碼」的提權，
而且兩者的取得難度差很多（驗證信在註冊當下就寄出，不需要知道密碼）。

### D2：不複用 `password_reset_tokens`，但**抽出共用的 token 機制**

不複用那張表：它的 `memberId` 指向 `members`，而前台是 `users`。
加一個 nullable 的 `userId` 會讓每支查詢都要記得帶「這是哪一側」——
與上一支分表的理由相同。

**但 token 的產生與雜湊要共用。** 目前 `randomBytes(32)` + sha256 只存在於
`PrismaPasswordResetTokenRepository` 裡，前台再寫一份就是**把一段安全關鍵的
程式碼複製兩份**——其中一份修了 bug（例如換更長的隨機源）另一份不會跟上，
而且不會有任何東西提醒你。

抽到 `shared/utils/one-time-token.ts`，兩邊的 repository 都用它。
**只抽純函式，不抽 Prisma 查詢**：兩者操作不同的 model，硬要共用會生出一個
帶 model 名稱參數的抽象，比重複更糟。

⚠️ 這會動到 admin 的 repository。**行為必須逐字不變**，既有測試全綠且不改斷言。

### D3：驗證成功後 **302 導回前台**，不是回 JSON

`GET /verify-email?token=` 是**使用者在信件裡點的連結**，開啟的是瀏覽器。
回 JSON 會讓使用者看到一坨 `{"success":true}`。

導向 `${APP_FRONT_URL}${APP_FRONT_VERIFY_REDIRECT_PATH}?status=...`，
由前台顯示結果。`status` 帶 `success` / `invalid` / `expired` 三種，
讓前台能給出不同的下一步（重寄 vs 去登入）。

**失敗也導回、不回 4xx**：使用者點的是信裡的連結，一個瀏覽器錯誤頁對他沒有意義。

`APP_FRONT_URL` 在 production 必填——沒有它連結會指向 `undefined/...`，
而那個錯誤要等到第一個使用者點信才會被發現。

### D4：兩層節流，缺一不可

| 攻擊形狀 | 擋它的是 |
| --- | --- |
| 同一個 IP 對很多信箱各發一封 | **IP 節流**（`@Throttle`，沿用 admin forgot-password 的 3 次 / 分鐘） |
| 對同一個信箱轟炸（換 IP 或走代理池） | **信箱節流**（Redis `increment(key, ttl)`） |

只做 IP 節流的話，攻擊者換 IP 就能對同一個信箱一直寄信——**受害者是那個信箱的
擁有者，而他沒有註冊過**。只做信箱節流則擋不住「大量不同信箱」的騷擾。

信箱節流的 key 用**正規化後的 email**（沿用 `normalizeEmail`）：
不正規化的話，交替大小寫就能讓每種寫法各自累積一份計數——
與 `platform-security-hardening` 修過的帳號鎖定繞過是同一個形狀。

**Redis 不可用時 fail-open**（只剩 IP 節流）。這與登入節流的 fail-closed 不同，
理由是後果不對稱：登入節流失效等於暴力破解防護消失；
寄信節流失效只是可能多寄幾封信，而擋掉全部註冊會讓服務直接不可用。

### D5：註冊時 email 已存在 → **回 201，不說「已註冊」**

直覺是回 409「此信箱已註冊」。**那是帳號列舉**：任何人都能拿一份信箱清單
問出誰在這個服務有帳號。

改為：回應與註冊成功**完全相同**，但**不建立帳號**，改寄一封
「你的信箱已有帳號」的信給既有擁有者。真正的擁有者收得到通知，
而攻擊者從回應看不出差別。

代價是「重複註冊」的使用者收不到明確的錯誤，要靠信件。可接受——
這條路徑的正確出口本來就是「去登入」或「忘記密碼」，而信裡會寫。

### D6：重設密碼成功後**撤銷該帳號所有既發 token**

改密碼要遞增 `users.tokenVersion`。少了它，攻擊者用偷來的 token 改掉密碼之後，
**受害者原本的 session 仍然有效**是好事，但反過來——受害者改了密碼卻沒把
攻擊者的 session 踢掉，那才是問題。

同時作廢該使用者其他未使用的 `RESET_PASSWORD` token。

### D7：驗證信與重設信的效期分開設定

`EMAIL_VERIFICATION_EXPIRES_IN`（預設 24 小時）與
`FRONT_PASSWORD_RESET_EXPIRES_IN`（預設 30 分鐘）。

不共用一個值：驗證信是「歡迎流程」的一部分，使用者可能隔天才點；
重設密碼是敏感操作，窗口越短越好。共用會逼你在兩個目的之間取一個都不適合的值。

## Risks / Trade-offs

- **[動到 admin 的 token repository]**（D2）→ 只抽純函式，行為逐字不變；
  既有測試必須全綠且**不修改斷言**，並反向驗證（把共用函式改壞 → admin 測試要紅）。
- **[重複註冊回 201 會讓人以為成功]**（D5）→ 這是刻意的取捨，代價寫在 spec 裡。
  寄給既有擁有者的信會說明下一步。
- **[信箱節流 fail-open]**（D4）→ Redis 掛掉時只剩 IP 節流。後果是可能多寄幾封信，
  而 fail-closed 會讓註冊完全不可用。這個不對稱是刻意的，寫進 spec。
- **[`APP_FRONT_URL` 未設時連結會壞]** → production 必填 + `validate-env` 擋；
  dev 未設時退回相對路徑，讓開發不被卡住。
- **[新增 4 個環境變數]** → `.env.example` 在 AI 工具權限之外，要由使用者補；
  `env-example-sync.spec.ts` 會在補上之前紅，訊息會列出缺哪幾個。

## Migration Plan

1. `prisma migrate` 建 `user_tokens` 表。
2. 四個新變數進 `.env.example` 與部署環境（`APP_FRONT_URL` production 必填）。
3. 無資料轉換、無既有契約變更。
