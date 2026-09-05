## Context

回補守則與一般的「加測試」不同：**一條新守則若立刻是紅的，代表它抓到了真的東西**，而那個修復必須跟守則同進同出——否則要嘛守則進不去，要嘛得先放一條紅的在那裡。本 change 的四條守則裡有兩條立刻紅：

- `guardrail-inventory` → 四處寫死的數字全部過期（11/32、19/68 vs 實際 22/69）
- `role-permission-cache` → `UpdateRoleService` 從不清成員快取

另外兩條（`env-example-sync`、`public-surface`）預期直接綠：前者的違規在 C2 收尾時已手動修完，後者的四個 `app.use()` 掛載都有正當理由、只是從未被申報。

現況的關鍵細節：

- `MemberContextCachePort` 只有 `getByMemberId` / `setByMemberId` / `isAvailable`，**沒有清除**。清除走的是另一支 `ClearMemberContextPort.clearMemberContext(memberId)`，單筆。
- 兩支 port 由同一個 adapter（`RedisMemberContextCacheAdapter`）與 `RedisTokenBlacklistAdapter` 分別實作，`clearMemberContext` 在兩處都有。
- `LoadMemberPort` 沒有「依角色查成員」的方法。
- `main.ts` 有四個 `app.use()`：`cookieParser`、本機媒體 static、`docs-json`、`docs`。後兩者在 C2 已經是條件掛載。
- `stripComments` 目前只存在於 `authorization-coverage.spec.ts` 內部。

## Goals / Non-Goals

**Goals:**

- 撤銷權限後立即生效，不受快取效期影響
- 守則數量的基準值只有一份，且由測試自己維護
- `.env.example` 的正確性由機器驗證，不靠「跑得起來」
- 繞過全域認證的掛載點必須是被申報過的

**Non-Goals:**

- **不搬 `session-revocation.spec.ts`**：它守的是「停用帳號時撤銷 WebSocket 連線」，模板沒有 WS 層。模板的等價機制是 `JwtAuthGuard` 每個請求檢查 `member.status`，已有 `authorization-coverage` 與既有測試涵蓋。
- **不搬 `permission-catalog-sync.spec.ts`**：它同步後端 `PERMISSION_CATALOG` 與前端 `lib/permission-codes.ts`，而模板前端還沒有那個檔（屬 C6b）。**沒有第二份真相就沒有同步問題**，現在加是空轉的守則。
- **不搬 `infra-endpoint` 裝飾器與 `INFRA_EXEMPT_PATHS`**：衍生專案需要它是因為 Prometheus 的 controller 掛不上裝飾器又會被 IP 存取控制擋下。模板的 Prometheus 在 feature flag 後且預設關閉，這個問題目前不存在——為不存在的問題建設施違反「不要過度設計」。
- **不改 `PERMISSION_CACHE_TTL` 的預設值**：快取本身沒有問題，問題是變更時沒有清除。

## Decisions

### D1：清快取用「依角色批次清除」，不是讓每個成員自己失效

`UpdateRoleService` 在 `updateWithPermissions` 之後，查出該角色的全部成員 ID，呼叫 `clearMany`。

不選「在 `MemberContext` 裡存 role 的版本號，讀取時比對」：那需要每個請求多一次查詢（讀 role 版本），把「寫入時付一次成本」換成「每次讀取都付」。而角色權限的變更頻率遠低於請求頻率。

不選「直接清空整個 MemberContext 命名空間」：那會讓所有已登入者在下一個請求都回頭查 DB，一次角色調整造成全站的快取雪崩。

**一律清、不判斷「這次改的是不是授權」**：`MemberContext` 帶 `roleName` / `roleCode` / `permissions` 三者，而「只在授權真的變了才清」需要比對前後的權限集合——寫錯的方向是**該清沒清**，而那是一個沒有錯誤訊息的失效。多清的代價只是一次 DB 查詢。

### D2：清除失敗不吞掉

`clearMany` 拋出時讓它往上冒，不 catch。

語意是「權限改了但沒有生效」——回成功會讓呼叫端處於一個他不知道的狀態，而管理員會以為撤銷已經完成。這與 `updateLastLoginAt` 那種 fire-and-forget 不同：後者失敗只損失一個時間戳，前者失敗是安全性問題。

### D3：`clearMany` 放進 `MemberContextCachePort`，不新增第三支 port

目前清除住在 `ClearMemberContextPort`（單筆），讀寫住在 `MemberContextCachePort`。**這個切分本身是可議的**，但本 change 不做那個重構——把 `clearMany` 加進 `MemberContextCachePort` 會讓同一個概念散在兩支 port，加進 `ClearMemberContextPort` 則讓它保持「清除」的單一職責。

**選後者**：`ClearMemberContextPort` 加 `clearMany(memberIds: string[])`。理由是呼叫端只需要「清除」這個能力，而讓 `UpdateRoleService` 依賴一支讀寫都有的 port 會擴大它的權限面。

### D4：守則的數量基準只擋變少，不要求相等

`MINIMUM_GUARDRAIL_FILES` 是下限，新增守則不必回來改它。

要求精確相等的話，每加一條守則就要動一次那個數字——那種規則會被當成雜訊繞過，最後跟寫死在文件裡的數字一樣沒用。累積一段時間後再往上調，那是一個刻意的動作，不是每次都要付的維護成本。

同一條規則的另一半是「文件不得寫死守則數量」：數字只在測試裡，文件裡不該有第二份，因為第二份一定會先過期。

### D5：`env-example-sync` 要真的把範例檔餵進 schema，不只比對鍵名

兩件事都要做：鍵集合相等、以及 parse 後（必填項補假值）能通過 `envSchema`。

只比對鍵名的話，C2 踩到的那個缺陷仍然抓不到——`SWAGGER_ENABLED` 的鍵在兩邊都有，壞的是**值的形狀**（空字串不被 `.optional()` 接受）。**這條守則的價值全在第二件事上**，第一件只是順帶。

必填項補假值這件事讓守則與 `envSchema` 的必填清單有了耦合。用「凡是範例檔留空且 schema 沒有預設值的就補假值」這個推導方式處理，而不是維護一份手寫清單——手寫清單會漂移。

### D6：`public-surface` 只守 `app.use()` 的申報，不搬整套機制

守一件事：`main.ts` 裡每個 `app.use('<path>', ...)` 的路徑都要出現在 `allowlist.ts` 的 `PUBLIC_MOUNT_EXEMPTIONS` 並附理由。

這正是 C2 踩到的形狀——Swagger 掛在 `app.use()` 上，全域 `JwtAuthGuard` 碰不到，而「有登入才看得到」這個假設從來就不成立，卻沒有任何東西提醒。申報制讓下一個掛載必須經過一次「這條路徑真的可以公開嗎」的自問。

不守「掛載必須有授權」：那不是 `app.use()` 能表達的，強求會逼人繞道。申報 + 理由是這一層唯一可機器檢查的東西。

## Risks / Trade-offs

- **[`clearMany` 讓更新角色多一次 DB 查詢與一次 Redis 批次刪除]** → 角色更新是低頻操作，且正確性優先。真的成為瓶頸時再考慮批次化，而不是現在預先最佳化。
- **[守則的下限值會隨時間失準（實際遠高於基準）]** → 這是刻意的（D4）。它只擋「大幅減少」，不擋「少一支」。要更嚴格就定期調高，那是一個有意識的動作。
- **[`env-example-sync` 依賴 `apps/api/env.example` 這個非標準檔名]** → 該檔是為了讓 AI 可讀寫而存在的工作副本，真正進版控的是 `.env.example`。守則盯著工作副本，兩份不同步時守則不會發現。**這是知情的缺口**，已寫進 `todo.md` 的手動同步流程。
- **[清快取失敗會讓角色更新整個失敗]** → D2 的刻意選擇。權限沒生效卻回報成功更糟。

## Migration Plan

無 migration、無 env 變更。

部署後行為變更只有一項：更新角色權限後，受影響成員的下一個請求立即反映新權限。原本要等最多 `PERMISSION_CACHE_TTL` 秒。
