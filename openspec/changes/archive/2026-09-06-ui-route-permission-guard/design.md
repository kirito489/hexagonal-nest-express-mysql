## Context

前端已經有三道權限相關的機制，但它們**各自為政**：

| 位置 | 做什麼 | 缺什麼 |
| --- | --- | --- |
| `_nav-items.ts` + layout | sidebar 依權限隱藏 | 隱藏不是保護，網址照樣打得進去 |
| `RequireAuth` | 擋未登入 | 不看權限 |
| `RequireRole` | 擋非 SUPERADMIN（只用在 security） | 只有 role 沒有 permission；且靜默導頁 |

三者都用**裸字串**的權限碼，沒有任何東西確認那些字串是真的。

本模板目前的路由：`/`、`/members`、`/roles`、三條 `/security/*`。
**每一條都在 `NAV_ITEMS` 裡，沒有明細路由**——這讓守則的涵蓋率暫時是 100%，
但那是現況而非保證（見 D4）。

## Goals / Non-Goals

**Goals:**

- 手動輸入網址與 sidebar 看到的結果一致。
- 權限碼打錯要在 `pnpm test` 就紅，而不是等有人回報「選單不見了」。
- 「沒有權限」在整個 codebase 只有一種表現。

**Non-Goals:**

- **不動後端。** 真正的授權在 `PermissionsGuard`，它本來就擋得住，
  前端這層是 UX 不是安全（`use-has-permission.ts` 的註解已經寫了這件事）。
- 不改任何權限碼的值、不改 sidebar 的分組。
- **不做「有 EDIT 就自動有 VIEW」之類的推導**。權限的隱含關係是後端的事
  （`CreateRoleService` 已有對應規則），前端再實作一份就是第二份規則。

## Decisions

### D1：權限碼型別化，但**不跨 workspace 匯入**

`apps/web` 不能 import `apps/api` 的常數——不同 workspace，而且 api 是 NestJS 的
CommonJS 基線、web 是 Vite ESM。`packages/api-client` 是從 swagger 產生的，
權限碼不在裡面。

所以是**在 web 維護一份常數，用守則保證它與後端目錄一致**。
這是「兩份真相 + 守則」而不是「一份真相」——不理想，但跨 workspace
的型別共享要動建置設定，代價高於這次要解的問題。
**誠實標記**：守則保證的是「碼存在於後端目錄」，不保證兩邊語意相同。

比照 `role-codes.ts` 的既有形狀（`as const` 物件 + 推導型別），不發明新寫法。
`requiredPermission` 的型別從 `string` 收緊為 `PermissionCode`
——**這一步才是真正消滅打錯的那個**，守則只是第二道。

只收 `apps/web` 實際用得到的碼（ACCOUNT / ROLE 的 VIEW 與 EDIT），
不整份複製後端目錄：`BACKEND:ATTACHMENT:EDIT` 前端沒有對應頁面，
放進來只會讓人以為有。

### D2：`RequirePermission` 比照 `RequireRole`，不做成 HOC 或 route config

既有的 `RequireRole` 是包在 `element` 外面的元件。沿用同一個形狀，
因為它已經在 `App.tsx` 用著——兩種寫法並存會讓人要先判斷該用哪個。

### D3：「沒權限」統一顯示訊息，`RequireRole` 一起改

⚠️ **這是行為變更，而且有代價**：靜默導頁不洩漏「這個頁面存在」，
顯示訊息會。

**仍然選顯示訊息**，因為：

- sidebar 已經藏起來了，會手動輸入該網址的人**已經知道它存在**——
  這個「洩漏」的實際資訊量接近零。
- 靜默導頁的失敗模式是**使用者以為自己點錯了**，然後再試一次、再被彈走。
  沒有任何東西告訴他要去要權限。
- 兩種行為並存比任何一種單獨存在都糟：下一個人要先查才知道該用哪個。

訊息採「沒有存取權限」——陳述狀態，不指責操作，並標示缺少的權限碼
（這是內部後台，使用者拿得到碼才說得出自己要什麼；權限碼在角色管理頁本來就看得到）。

### D4：守則只檢查它檢查得到的，且要說清楚檢查不到什麼

守則比對的是「`NAV_ITEMS` 宣告了權限的 path」與「`App.tsx` 掛了
`RequirePermission` 的 path」。

**目前沒有明細路由**，所以涵蓋率是 100%。但一旦有人加了 `/members/:id`
這種不在 `NAV_ITEMS` 的路由，**它漏掛守衛這條規則抓不到**。

這個限制要寫進需求，否則下一個人會以為守則涵蓋全部路由。
不為此改成「掃 App.tsx 的每條路由都要有守衛」：`/` 與 `/login` 本來就不該有，
規則放寬到能容納它們之後就抓不到真正的漏掛了。

### D5：不把「沒權限」做成 `/403` 路由

導向 `/403` 之類的路徑會讓瀏覽器歷史多一筆，返回鍵會回到那個沒權限的網址、
再被踢一次。就地渲染訊息沒有這個問題。

### D6：守則放 api 側，不放前端

前端既有的 `architecture.test.ts` 用 `import.meta.glob('/src/...')` 讀原始碼，
**刻意不用 node 的 fs**（`tsconfig.app.json` 的 types 只有 `vite/client`）。
那個限制讓它讀不到 `apps/api` 的權限目錄。

所以同步守則放 `apps/api/test/architecture/`：那裡本來就用 fs，
`readFileSync` 跨 workspace 讀 `apps/web` 的檔案沒有障礙。

用正規式讀字面值而不是 import：跨 workspace 的 import 在 api 的 jest 設定下
解不到 `apps/web` 的路徑別名。**代價是常數必須維持字面物件的寫法**，
這一點要寫進 `permission-codes.ts` 的檔頭警告。

## Risks / Trade-offs

- **[`RequireRole` 的行為變了]**（靜默導頁 → 顯示訊息）→ 影響範圍是非 SUPERADMIN
  手動輸入 `/security/*`，屬邊緣路徑，但仍是行為變更，已寫進 proposal 的 Impact。
- **[兩份權限碼]**（web 常數 vs 後端目錄）→ 守則擋住「碼不存在」，
  擋不住「兩邊對同一個碼的理解不同」。這是 D1 的已知代價。
- **[明細路由不在守則涵蓋範圍]**（D4）→ 目前沒有明細路由，但未來有了要靠人記得掛。
  限制寫進需求。
- **[守則依賴字面物件的寫法]**（D6）→ 有人把 `PERMISSION_CODE` 改成用函式產生，
  正規式會解不出值。「掃描範圍有效」那條會先紅，不會靜默空轉。

## Migration Plan

無 migration、無 API 契約變更。純前端行為調整加兩條守則。
