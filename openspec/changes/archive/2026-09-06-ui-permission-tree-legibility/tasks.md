> 每一塊（`##` 標題）須能獨立通過驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`。
> 全部完成後給**一個** commit 指令，由使用者手動執行。
>
> **塊的依賴**：
> - 塊 1（對照表）先做，塊 2 引用它。
> - 塊 4（守則）必須排在 1、3 之後——提前寫會是紅的，而那不是「抓到缺陷」只是順序錯了。
>
> ⚠️ **不改 `PERMISSION_CATALOG` 的 `name`**（design D5）。藍本有這一整塊，
> 起因是它自己的側邊欄改名而目錄沒跟上；**本模板兩邊本來就一致**，
> 照抄只會改到 DB 顯示字串、需要重跑 seed，而解決的是不存在的問題。
>
> ⚠️ **不動任何守衛**。這支只讓既有的安全模型變得可見。

## 1. 中文對照表

- [x] 1.1 新增 `routes/roles/lib/permission-labels.ts`：`PLATFORM_LABELS`、`MODULE_LABELS` 與兩支查詢函式
- [x] 1.2 對照用語與側邊欄一致（`BACKEND`→後台、`ACCOUNT`→帳號管理、`ROLE`→角色管理、`ATTACHMENT`→附件）
- [x] 1.3 查不到時**退回原始碼片段而非空字串**——標題空白看起來像壞掉，英文至少讀得出是哪一組
- [x] 1.4 檔頭警告**必須維持字面物件的寫法**（守則以正規式讀值，同 C6b 建立的模式）
- [x] 1.5 `ATTACHMENT` 的脈絡寫在註解裡（前端還沒有附件頁），**不寫成 UI 文字**——那會隨功能上線而過期卻沒有東西提醒你改
- [x] 1.6 單元測試：有對照 / 無對照兩種

## 2. 權限樹的呈現

- [x] 2.1 `PermissionsField` 的群組標題改用 `platformLabel` / `moduleLabel`
- [x] 2.2 checkbox 文字改為動作名（檢視 / 編輯），不再顯示 `name` ——群組標題中文化後那是重複（design D2）
- [x] 2.3 `aria-label` 同步改用中文 module 名
- [x] 2.4 **不新增 `ACTION_LABELS`**：`ModuleGroup` 已按 action 分好，為兩個固定值建表只是多一個會漂移的地方

## 3. 不可指派區塊

- [x] 3.1 新增 `routes/roles/lib/unassignable-permissions.ts`：module 名、badge、說明、原因、項目清單
- [x] 3.2 項目為 IP 白名單 / IP 黑名單 / **帳號鎖定**（C6a 新增的第三個 SUPERADMIN-only 頁面，藍本沒有）
- [x] 3.3 措辭**不提「已授予 / 未授予」**——描述的是指派機制而非某個角色的狀態
- [x] 3.4 `PermissionsField` 渲染該區塊：**無 checkbox**（不是 disabled 的 checkbox，design D3）
- [x] 3.5 說明必須講**為什麼**——只寫「無權限」的話使用者會去要那個要不到的權限
- [x] 3.6 單元測試：區塊有渲染、**沒有任何 checkbox**、原因文字有出現

## 4. 守則（必須排在 1、3 之後）

- [x] 4.1 兩條都加進 C6b 的 `permission-codes-sync.spec.ts`（同一個關切：前端寫死的後端知識必須跟得上後端）
- [x] 4.2 「每個 platform 與 module 都要有中文對照」——**雙向**：缺對照要紅，多餘的死條目也要紅
- [x] 4.3 「安全管理仍由 SUPERADMIN role gate 保護」——判定前**必須先去除註解**（`// @Roles(...)` 會餵飽不去註解的正規式）
- [x] 4.4 「掃描範圍有效」涵蓋新增的兩份常數
- [x] 4.5 **反向驗證**：(a) 移除 `MODULE_LABELS.ACCOUNT` → 4.2 紅並指出來自哪個碼；(b) 加一個目錄沒有的對照 → 4.2 紅；(c) 把 `SecurityController` 的 `@Roles` 註解掉 → 4.3 紅。逐一還原
- [x] 4.6 `openspec/project/testing.md` 更新該支守則那一列

## 5. spec 矛盾的修正

- [x] 5.1 確認實作與新規則一致（`RolesTable` 已是 `{canEdit && …}` 隱藏 + `DisabledHint` 表資料狀態）
- [x] 5.2 若既有測試斷言「dropdown 整個不顯示」，那條測試也是錯的，一併改

## 6. 驗證與收尾

- [x] 6.1 `pnpm typecheck && pnpm lint && pnpm test:cov`、`pnpm build`，貼出實際輸出
- [x] 6.2 e2e 跑一次確認沒波及（本 change 不動後端，但 `PERMISSION_CATALOG` 有被守則讀取）
- [ ] 6.3 ⏸ 前端畫面待使用者實機確認（需 `pnpm dev`）：權限樹的中文標題、不可指派區塊
- [x] 6.4 更新 `tasks/todo.md`：勾掉 C6c，**寫下給 C6d 的提醒**——若改側邊欄用語，`MODULE_LABELS` 與 `PERMISSION_CATALOG.name` 都要一起改，否則會複製出藍本那個漂移
- [x] 6.5 新踩到的坑寫進 `tasks/lessons.md`
