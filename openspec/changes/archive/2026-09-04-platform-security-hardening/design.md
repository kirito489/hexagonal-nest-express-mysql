## Context

四個缺陷各自獨立，但都屬同一種形狀：**機制存在、看起來有保護、在某個沒被想到的情況下失效**，而且失效時沒有任何錯誤訊息。

現況的關鍵事實：

- `AccountLockPort.isLocked()` 回布林，`lockAccount()` 只寫 `lockedAt = now()`，沒有任何地方讀它算時效。解鎖只有 `unlockAccount()`，由 `POST /api/admin/security/unlock-account` 呼叫，該端點掛 `@Roles(SUPERADMIN)`。
- 失敗計數在 Redis（`buildFailedLoginKey`，TTL 1800 秒），鎖定狀態在 DB（`lockedAt`）。兩者的生命週期本來就不一致，只是在「鎖了就永遠鎖著」的前提下不會顯露。
- Redis 鍵用原樣 email，DB 定序是 `utf8mb4_unicode_ci`。`Email.of()` 只驗證格式，**不做正規化**。
- `main.ts` 用單一 `app.use(helmet({ contentSecurityPolicy: false }))`；`createE2EApp` 完全不掛原生中介層，所以任何 header 斷言在 e2e 都是空的。
- 兩份 swagger 的掛載路徑（`/api/admin`、`/api/front`）與 bundle 路徑寫死在 `main.ts` 的兩次 `mountSwagger` 呼叫裡。

## Goals / Non-Goals

**Goals:**

- 帳號鎖定有復原路徑，且該路徑不依賴「還有人登得進來」
- 鎖定的實際時長等於設定的時長，不被 Redis 計數的 TTL 悄悄取代
- 失敗計數不能靠變換 email 大小寫繞過
- 單一埠部署模式下 SPA 的 HTML 有 CSP
- production 預設不暴露 OpenAPI spec，且「關閉」是真的兩條路徑都關
- refresh token 的效期與它的儲存位置相稱

**Non-Goals:**

- **不做 refresh token 改 `httpOnly` cookie**：會動到前端換發流程，屬獨立 change。做完之後效期才適合重新評估。
- **不做帳號鎖定的管理列表頁**：`api-account-lock-management`（C6a）。本 change 只做時效，列表要等時效落地才有意義——沒有時效的話那支端點是唯一解鎖途徑，而它自己需要能登入的管理員。
- **不搬 `normalizeEmail` 的其餘使用點**：衍生專案把它用在前台註冊 / 重寄驗證信 / 忘記密碼，那些端點模板還沒有（C6e）。本 change 只套用在鎖定路徑。
- **不改 IP 封鎖**：`APPLICATION_IP_BLOCK_THRESHOLD` 那條路徑本身沒問題，且它正是「持續攻擊者每 N 分鐘重鎖一次」的對策（見 D1）。

## Decisions

### D1：鎖定改為有時效，而不是改用「解鎖不需登入」

選擇加 `APPLICATION_ACCOUNT_LOCK_DURATION_MIN`（預設 15 分鐘），逾時自動解除。

不選「解鎖端點改為不需認證 + 寄解鎖信」：那是一個新的攻擊面（寄信轟炸），而且模板目前沒有前台使用者的信件流程，為了解一個死結引入整套信件驗證不成比例。

不選「鎖定檢查移到密碼驗證之後」：那樣「密碼打對就能清計數」確實給了一條復原路徑，但也讓鎖定形同虛設——攻擊者不需要密碼，被鎖的受害者卻要靠密碼才能解，而鎖定機制本來就是為了擋「不知道密碼的人」。

**時效不解決「持續攻擊者可以每 15 分鐘重鎖一次」**，那是 per-IP 限制的職責（`APPLICATION_IP_BLOCK_THRESHOLD`）。它解決的是「永久且無復原路徑」——兩者是不同的問題，不要期待一個機制同時處理。

時效**不加欄位**，由 `lockedAt` + 設定值即時算出。加 `lockedUntil` 欄位的話，改設定值不會影響既有的鎖定紀錄，於是「設定寫 15 分鐘、實際 60 分鐘」這種不一致會存在直到那批紀錄自然消失。

### D2：`checkLock()` 回三態而非布林

`AccountLockStatus = 'NONE' | 'LOCKED' | 'EXPIRED'`。

布林分不出「從未鎖定」與「鎖過但已到期」，而這兩者呼叫端該做的事不同：前者什麼都不用做，後者**必須清除失敗計數**。

理由是兩個存放位置的生命週期不一致：鎖定狀態在 DB（靠時效判定），失敗計數在 Redis（TTL 1800 秒 = 30 分鐘，比預設時效 15 分鐘長）。到期後不清計數的話，使用者第一次打錯就會因為「計數還在閾值上」立刻重新被鎖——**實際鎖定時間變成計數的 TTL 而非設定的時效，而設定的那個數字看起來完全正常**。

不選「在 `checkLock()` 裡直接清掉計數」：查詢方法偷偷做寫入是下一個人不會預期的事。三態讓呼叫端**必須**面對 `EXPIRED`（TypeScript 的窮盡檢查會逼他處理），而不是靠記得。

不選「把 Redis 的 TTL 調成等於時效」：那是把兩個獨立設定綁成巧合一致——改任一邊就會悄悄壞掉，正是 `lessons.md` 裡「能動有兩種：設計出來的，與兩個獨立決定湊巧一致的」那條。

### D3：`normalizeEmail` 套在鎖定路徑，不套在 `Email` value object

新增 `shared/utils/normalize-email.ts`，在 `PrismaAccountLockAdapter` 的五支方法入口套用。

不選「改 `Email.of()` 讓 value object 自己正規化」：那會改變所有既有資料的比對語意（包含顯示用途——使用者輸入 `Foo@X.com` 註冊，登入後看到 `foo@x.com`），影響面遠大於本 change，且沒有測試在保護那個行為。屬獨立的重構。

不選「只改 Redis 鍵、不動 DB 查詢」：DB 那側因為 `utf8mb4_unicode_ci` 本來就是不分大小寫的，改了鍵就一致了——但這個一致性是**依賴 DB 定序**的，換成 `_bin` 定序或換資料庫就會反過來壞。兩邊都正規化才是不依賴外部設定的做法。

正規化**只做 trim + toLowerCase**，不做 Gmail 的 dot / plus 規則——那是 Gmail 的規則不是信箱的規則，套在其他網域上是錯的。

### D4：CSP 用「路徑分支」而非「路徑前綴疊加」

`applySecurityHeaders(app)` 內部用一個 middleware 依 `req.path` 選擇兩份 helmet 之一。

不選 `app.use('/api/admin/docs', helmet({ contentSecurityPolicy: false }))` 再接全域 helmet：後者只是「前綴符合才跑」，**不會讓後面的全域 helmet 跳過**，文件路徑仍會被加回 CSP。這是最容易寫錯的一種，而且錯的症狀是「文件打不開」，會被當成 Swagger 壞掉去查。

豁免範圍由 `SWAGGER_SIDES` 這張表決定，**掛在哪、豁免哪由同一份資料驅動**。分成兩處寫的話，漏掉其中一條同樣是「那份文件打不開」。

判斷用「完全相等或以 `<base>/` 開頭」而非 `startsWith(base)`：後者會把 `/docs-json` 一起吃進來，而那是 JSON 不是 UI，不需要放寬。

**不依 `NODE_ENV` 切換 CSP**：開發與正式跑不同的 CSP，等於把違規延到正式環境才發現。

抽成函式的另一個理由是 e2e——`createE2EApp` 不套 `main.ts` 的原生中介層，不共用同一支的話，header 斷言驗的是一個沒有安全標頭的 app（見 `lessons.md` 該條）。

### D5：`SWAGGER_ENABLED` 未設定時依 `NODE_ENV` 推導

`z.enum(['true','false']).optional()`，判定拆成純函式 `resolveSwaggerEnabled(nodeEnv, explicit)`。

不選「固定預設 `true`」：忘記設定的 production 會裸奔一份完整的後台地圖。
不選「固定預設 `false`」：開發者第一次跑起來就找不到文件。

**預設值唯一該有的性質是「什麼都不設就是對的」，而這裡的「對」在兩種環境下不同**，所以推導比固定值合適。明確設定永遠優先。

判定之所以拆成純函式而非寫在 `isSwaggerEnabled()` 內部：測試要 mock `getEnv` 時，模組內部的呼叫仍指向真正的實作（partial mock 蓋不到自己人），純函式沒有這個問題。

關閉時 `/docs` 與 `/docs-json` **兩者都不掛載**。只關 UI 是最容易犯的錯——`docs-json` 才是有價值的那份，而它沒有介面所以不顯眼。關掉不影響開發流程：`swagger:check` 與 api-client codegen 走的是本機檔案而非 HTTP 端點。

### D6：refresh token 效期縮到 1 天，且理由綁在儲存位置上

判準是「被偷走之後攻擊者能用多久」，而那取決於它存在哪裡。目前 `tokenStorage` 把 access 與 refresh 兩枚都放 `localStorage`，任何 XSS 都能一次帶走。

**效期與儲存位置是綁在一起的一組決定**——存 `localStorage` 就不能配長效期。這一條要寫進 spec，否則下次有人「覺得使用者一直要重新登入很煩」時，會在不知道這個約束的情況下把它調回去。

改成 `httpOnly` cookie 之後才適合重新評估效期，那屬 Non-Goals。

## Risks / Trade-offs

- **[改 `isLocked` → `checkLock` 是破壞性的介面變更]** → 呼叫端只有 `LoginService` 一處，且 TypeScript 會在編譯期抓到全部。三態是 union type，漏處理 `EXPIRED` 會在 switch 的窮盡檢查上失敗。
- **[`REFRESH_TOKEN_EXPIRES_IN` 預設縮短會影響既有部署]** → 只影響沒有在 `.env` 明確設定的部署，症狀是使用者需要更常重新登入（不是錯誤）。寫進 proposal 的 Impact 供部署者判斷是否要改回。
- **[production 預設關閉 Swagger 可能讓人以為文件壞了]** → `.env.example` 與 `backend-runtime.md` 要寫清楚推導規則與如何明確開啟。
- **[CSP 從全域關閉改為預設套用，可能擋掉目前能用的東西]** → 這正是要找出來的東西。驗證方式是實際開啟後台 SPA 與兩份 Swagger UI，看 console 有沒有 CSP 違規；e2e 補 header 斷言（一般路徑有 CSP、docs 路徑沒有）。
- **[鎖定時效讓「持續攻擊者每 15 分鐘重鎖一次」成為可能]** → 這是知情的取捨，見 D1。那屬於 per-IP 限制的職責，不是時效要解決的問題。

## Migration Plan

無 migration。兩個新環境變數都有預設值，既有部署不改 `.env` 也能啟動。

需要使用者判斷的兩項：

1. 若原本依賴 refresh token 的 7 天效期，在 `.env` 明確設定 `REFRESH_TOKEN_EXPIRES_IN=604800` 維持舊行為——但要理解它與 `localStorage` 儲存位置的關係（D6）。
2. production 若需要保留 Swagger，明確設定 `SWAGGER_ENABLED=true`；預設是關的。

回滾：四項彼此獨立，可個別 revert。`checkLock` 那項若要回滾需連同 `LoginService` 一起，其餘三項是加法。
