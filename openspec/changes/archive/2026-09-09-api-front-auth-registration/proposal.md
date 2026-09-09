## Why

`api-front-auth-account` 建好了 `users` 表與登入 / refresh / 登出 / me，
但**前台使用者只能由 seed 產生**——沒有註冊就沒有使用者，
衍生專案的前台專案連第一個畫面都做不出來。

順帶要補的是**密碼重設**。後台早就有（`ForgotPasswordService` / `ResetPasswordService`），
前台一支都沒有——**使用者忘記密碼就等於永久失去帳號**。

`emailVerifiedAt` 欄位在上一支就建好了，但至今沒有任何東西會寫入它。

## What Changes

- **新增 `user_tokens` 表**：一次性 token，帶 `purpose`（`VERIFY_EMAIL` / `RESET_PASSWORD`）。
  只存 sha256 雜湊，不存明文。需要 migration。
- **五支新端點**（`/api/front/auth/*`，全部 `@Public()`）：
  - `POST /register` — 建立未驗證的帳號並寄出驗證信
  - `GET /verify-email?token=` — 點信裡的連結，驗完 **302 導回前台**
  - `POST /resend-verification` — 重發驗證信
  - `POST /forgot-password` — 申請密碼重設
  - `POST /reset-password` — 以 token 設定新密碼
- **共用的 token 機制抽成 `shared/utils/one-time-token.ts`**：產生（`randomBytes(32)`）
  與雜湊（sha256）目前只存在於 admin 的 repository 裡，前台再寫一份等於
  **把一段安全關鍵的程式碼複製兩份**——其中一份修了 bug 另一份不會跟上。
- **防濫用**：註冊與重發吃 **IP 節流（`@Throttle`）＋ 信箱節流（Redis 計數）** 兩層。
- **新增環境變數**：`APP_FRONT_URL`、`APP_FRONT_VERIFY_REDIRECT_PATH`、
  `EMAIL_VERIFICATION_EXPIRES_IN`、`FRONT_PASSWORD_RESET_EXPIRES_IN`。

**不做**：

- **reCAPTCHA**——前台專案還沒開始，接了也沒有人驗得到。IP + 信箱雙重節流已經擋掉
  「同一個 IP 對很多信箱各發一封」與「對同一個信箱轟炸」兩種形狀。
- **未驗證信箱的功能門檻**（`EmailVerifiedGuard`）——模板前台沒有任何功能可擋，
  與上一支同樣的理由。本支只負責**讓 `emailVerifiedAt` 有東西寫入**。
- **社群登入**、**登入狀態下的改密碼**（那是 `/front/me` 的範圍，
  與「忘記密碼」的威脅模型不同）、**後台管理前台使用者**、**前端畫面**。

## Capabilities

### Modified Capabilities

- `api-front-auth`：新增註冊、信箱驗證、重發驗證信、忘記密碼、重設密碼五支端點，
  以及「一次性 token 的共同規則」這條跨端點的要求。

## Impact

| 面向 | 影響 |
| --- | --- |
| Schema / migration | **新增 `user_tokens` 表**，需要 migration。`users` 表無欄位變動 |
| 環境變數 | **4 個新的**；`APP_FRONT_URL` 在 production 為必填（沒有它驗證信的連結會指向 undefined） |
| API 契約 | 新增 5 支 front 端點；front 有自己的 doc，不影響 admin 的 api-client |
| 既有行為 | **無變更**。admin 的密碼重設流程不動，只把 token 的產生與雜湊抽成共用函式 |
| 信件 | 沿用既有的 `SendEmailPort` 與 `NodemailerEmailAdapter`，不新增 adapter |
| 前端 | 無（`apps/web` 是後台） |
