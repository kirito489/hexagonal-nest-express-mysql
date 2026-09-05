> 每一塊（`##` 標題）須能獨立通過驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`。
> 動到 controller / 路由，**必須加 `pnpm --filter @app/api test:e2e`**。
> 全部完成後給**一個** commit 指令，由使用者手動執行。
>
> **塊的依賴**：
> - 塊 1（抽出到期規則）先做，塊 2 的列表查詢與登入路徑都用它。
> - 塊 1 是**對登入路徑的重構**：既有測試必須全綠且**不修改斷言**。
>   要改斷言就代表行為變了，那不是重構。
> - 塊 5（前端）依賴塊 4 產出的 api-client 型別。
>
> ⚠️ **驗證段必須含一次實機確認**（6.3）。本 change 的核心風險
> （`APPLICATION_ACCOUNT_LOCK_ENABLED` 預設 false）**測試全綠也看不出來**：
> 測試驗的是「列表正確反映 `locked_at`」，那是對的；錯的是「`locked_at` 從哪來」。

## 1. 抽出到期規則（登入路徑的重構）

- [x] 1.1 在 `AccountLockPort` 同層抽出純函式（計算 `lockedAt` → 到期時間 / 分界時間戳），TSDoc 寫明「這是唯一一份規則」
- [x] 1.2 `PrismaAccountLockAdapter.checkLock` 改用它，**行為不變**
- [x] 1.3 既有的 `PrismaAccountLockAdapter` 與 `LoginService` 測試全綠，**斷言一字未改**
- [x] 1.4 **反向驗證**：把純函式的時效改成兩倍 → 既有「鎖定到期」相關測試必須變紅。還原

## 2. Port 與列表查詢（TDD）

- [x] 2.1 `AccountLockPort` 新增 `listLocked(query)`：回傳 `{ list, total }`，逐列帶 `status` 與 `unlocksAt`
- [x] 2.2 查詢條件：`lockedAt != null` + `deletedAt: null`；`locked` / `expired` 以塊 1 的分界時間戳轉成 SQL 範圍條件，**不逐列呼叫 `checkLock`**（N+1）
- [x] 2.3 email 模糊搜尋（contains，不分大小寫）；排序 `lockedAt` 遞減
- [x] 2.4 `PrismaAccountLockAdapter` 實作 + 單元測試（mock Prisma）
- [x] 2.5 **測到邊界**：`lockedAt` 剛好等於分界點時，列表的判定與 `checkLock` 的判定必須一致——這是 D3 說的漂移點

## 3. Service / DTO / Controller

- [x] 3.1 `ListAccountLocksQuery`：zod schema，`status` 用 `z.enum(['locked','expired','all'])` 預設 `locked`；`search` trim 後為空視為未提供
- [x] 3.2 Service 取 `APPLICATION_ACCOUNT_LOCK_ENABLED` 放進回應的 `lockEnabled`
- [x] 3.3 `SecurityController` 新增 `@Get('locks')`，沿用既有的 class 層 `@Roles(SUPERADMIN)`，**不加權限碼**
- [x] 3.4 `SecurityUseCases` / `SecurityServices` 補對應方法，走 Facade → UseCase → Port
- [x] 3.5 Service 單元測試（mock port）：三種 status、空結果、`lockEnabled` 兩種值

## 4. Swagger 與 api-client

- [x] 4.1 `docs/swagger/admin/security/` 新增 `locks.yaml`（inline data，不用 `$ref: SuccessResponse`）
- [x] 4.2 `openapi.yaml` 註冊 path
- [x] 4.3 `pnpm --filter @app/api swagger:bundle` + `pnpm --filter @app/api-client generate`
- [x] 4.4 `pnpm --filter @app/api swagger:check` 確認無漂移

## 5. 前端

- [x] 5.1 `routes/security/account-locks/`：`page.tsx` + `hooks/use-account-locks-query.ts` + `hooks/use-account-locks-url-state.ts` + `components/AccountLocksTable.tsx` + `components/AccountLocksSearchBar.tsx`
- [x] 5.2 **頁首用 `@/components/PageHeader`**，不手寫 `<header>`（design D7——衍生專案那頁三處抄歪且測試全綠）
- [x] 5.3 副標依 `lockEnabled` 切換措辭；停用時另顯示提示區
- [x] 5.4 已到期的列：解鎖 **仍可按**，並標示該帳號已能登入（design D5——藍本在此與模板相反，衍生專案的服務擋 `!== LOCKED`，模板只擋 `NONE`；照抄會做出一顆擋住有效操作的 disabled 按鈕）
- [x] 5.5 解鎖呼叫既有的 `POST unlock-account`（以 email），成功後 invalidate 列表
- [x] 5.6 Sidebar「安全」群組加「帳號鎖定」，排在 IP 黑名單之後
- [x] 5.7 `AccountLocksTable` 單元測試：鎖定中與已到期**都**可按解鎖、已到期標示該帳號已能登入、`lockEnabled=false` 的空狀態文案

## 6. 驗證與收尾

- [x] 6.1 e2e：三種 status、400、403、軟刪除帳號不出現、`lockEnabled` 兩種值
- [x] 6.2 `pnpm typecheck && pnpm lint && pnpm test:cov`、`pnpm --filter @app/api test:e2e`、`pnpm build`，貼出實際輸出
- [x] 6.3a **兩種 flag 狀態都以 e2e 覆蓋**（衍生專案是實機驗收才發現這件事，這裡把它變成機器檢查）：`security.e2e-spec.ts`（flag 關閉）斷言 `lockEnabled: false`；`security-hardening.e2e-spec.ts`（flag 開啟）斷言 `lockEnabled: true`，並跑完整的「連續失敗達門檻 → 列表 status=locked 且登入回 423 → 推過時效 → 列表 status=expired 且登入回 200」
- [x] 6.3b **反向驗證 D3**：讓列表用自己那一份時效（`durationMin * 2`）→「剛好超過時效」與「預設過濾」兩條變紅，症狀正是「列表說鎖著、但那個人登得進去」。還原後全綠
- [ ] 6.3c ⏸ **前端畫面待使用者實機確認**（需 `pnpm dev`，依 Hard Rule 不自行啟動）：`/security/account-locks` 在 flag 關閉時的停用提示與空狀態文案、狀態過濾的網址同步、解鎖確認對話框對已到期列的補充說明
- [x] 6.4 `smoke-test.md`：新端點的 curl（三種 status、非 SUPERADMIN 的 403）
- [x] 6.5 更新 `tasks/todo.md`：勾掉 C6a，**註明 D1 / D2 縮小了範圍**（不做 `DELETE /locks/:id` 與 `POST /locks`），避免看起來像做漏
- [x] 6.6 新踩到的坑寫進 `tasks/lessons.md`
