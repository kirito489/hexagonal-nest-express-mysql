> 每一塊（`##` 標題）須能獨立通過驗證鏈：`pnpm typecheck && pnpm lint && pnpm test`。
> 塊 1 動到角色建立 / 更新的驗證路徑，需加 `pnpm --filter @app/api test:e2e`。
> 不動 swagger yaml、不動 module 接線，因此**不需要** `swagger:bundle` 與 `pnpm build`。
> 全部完成後給**一個** commit 指令，由使用者手動執行。
>
> **塊的依賴**：
> - **塊 0 是安全網，不可跳過**——它把「附件權限存不進去」這個缺陷釘成一條會紅的測試，
>   否則修完之後無從證明修對了什麼。
> - 塊 1（後端）與塊 2（前端）互相獨立，順序可換。**但兩者都修完才有用**：
>   只修後端的話，前端仍會合成幻影碼 `BACKEND:ATTACHMENT:VIEW`，後端會以
>   `INVALID_PERMISSION_CODE` 退件；只修前端的話，後端仍會以
>   `INVALID_PERMISSION_COMBINATION` 退件。**兩個各自獨立的擋路者，症狀卻幾乎一樣**。
> - 塊 3（e2e）需要塊 1、2 都完成。

## 0. 把缺陷釘成測試

- [x] 0.1 新增 `permission-validator.spec.ts`，其中一條斷言「只給 `BACKEND:ATTACHMENT:EDIT` 應通過」——**此刻它必須是紅的**。貼出紅燈輸出，那是缺陷存在的證據
- [x] 0.2 新增 `role-form-schema.test.ts`，其中一條斷言「normalize 不得產生目錄中沒有的碼」——**此刻也必須是紅的**
- [x] 0.3 確認兩條紅的原因**各自不同**（後端是 `INVALID_PERMISSION_COMBINATION`、前端是合成了不存在的碼）。若兩條紅的訊息相同，代表其中一條沒測到自己該測的東西

## 1. 後端：依權限目錄判斷

- [x] 1.1 `validatePermissions` 先從送入的碼推導出所有 EDIT 模組，`findByCodes` **一次查完**「使用者送的碼 + 衍生的 VIEW 碼」
- [x] 1.2 `INVALID_PERMISSION_CODE` 的判定**只針對使用者實際送出的碼**——衍生的 VIEW 碼查不到是正常情況，不得計入
- [x] 1.3 蘊含檢查改為：目錄裡沒有該模組的 VIEW 就 `continue`（不套用規則）；有才要求它同時被選
- [x] 1.4 TSDoc 寫明為何不用字串推導、以及「附件刻意只有 EDIT」這個具體案例
- [x] 1.5 補齊 `permission-validator.spec.ts`：有 VIEW 的模組行為完全不變（缺 VIEW 仍拋例外）、只有 EDIT 的模組通過、目錄全選通過、碼不存在仍拋 `InvalidPermissionCodeException`、空陣列直接通過
- [x] 1.6 ⚠️ **真的對不上，而且是 mock 在說謊**：`CreateRoleService.spec.ts` 的
      「EDIT 缺同模組 VIEW → 拋例外」那條，mock 只回 `BACKEND:ROLE:EDIT`。
      新邏輯據此判定「ROLE 是刻意只有 EDIT 的模組」而跳過蘊含規則，測試以
      **沒有拋例外**的形式變紅。修法不是遷就新邏輯，而是讓 mock 反映真實目錄
      （ROLE 兩者都有）——原本的 mock 描述了一個不存在的世界，只是先前的實作剛好不在乎
- [x] 1.7 **反向驗證**：(a) 把 `continue` 改成不跳過 → 只有 EDIT 那條紅；(b) 把 `missing` 的判定改成對所有查詢的碼 → 「只有 EDIT 的模組」那條以 `INVALID_PERMISSION_CODE` 紅（證明 1.2 有效）。逐一還原並確認 `git status` 乾淨

## 2. 前端：只補目錄裡真的有的碼

- [x] 2.1 `normalizePermissionCodes` 加選填參數 `availableCodes?: ReadonlySet<string>`
- [x] 2.2 `availableCodes` 為 `undefined` 時**直接回傳排序去重後的原清單**，不補任何碼
- [x] 2.3 有 `availableCodes` 時只補集合中存在的 VIEW 碼
- [x] 2.4 TSDoc 寫明「合成不存在的碼會讓整個角色存不起來」這個後果
- [x] 2.5 `RolesPage` 從既有的 `usePermissionOptionsQuery` 取出可用碼集合（`useMemo`），傳入兩處呼叫端（建立與更新）
- [x] 2.6 補 `role-form-schema.test.ts`：有 VIEW 時會補、只有 EDIT 時不補、未傳 `availableCodes` 時不補、排序與去重仍成立
- [x] 2.7 **反向驗證**：把「只補存在的碼」改回無條件補 → 2.6 對應那條紅；還原後全綠

## 3. E2E

- [x] 3.1 在 `role.e2e-spec.ts` 補一條：建立角色時帶 `BACKEND:ATTACHMENT:EDIT`（不帶任何 VIEW）→ `201`
      —— ⚠️ 第一次跑拿到 **400 但不是預期的錯誤碼**：測試庫的 `permissions` 表只有
      `beforeEach` seed 進去的那幾個碼，附件的碼根本不存在，於是擋下它的是
      `INVALID_PERMISSION_CODE` 而非蘊含規則。**單元測試綠、e2e 紅，差別在單元測試的
      mock 是照真實目錄過濾，而真 DB 只有被 seed 的那幾筆。** 修法是先呼叫
      `ensurePermissions` 讓那些碼存在——是測試的問題不是程式的問題
- [x] 3.2 補一條：帶權限目錄**全部**的碼 → `201`。這條是最有價值的回歸測試——只要目錄本身合法，全選就必須是合法組合，而它會在下一個「只有 EDIT 的模組」加入時自動守住
- [x] 3.3 確認既有的「EDIT 未搭配 VIEW → 400」那條**仍然綠**（有 VIEW 的模組行為不變）
- [x] 3.4 **反向驗證**：把後端的 `continue` 拿掉 → 3.1 與 3.2 紅、3.3 仍綠；還原

## 4. 收尾

- [x] 4.1 完整驗證鏈實際輸出：

      ```
      typecheck   api / web / api-client 皆 Done
      lint        api / web 皆 Done
      test:cov    api  單元 53 suites / 344 tests；守則 19 suites / 69 tests
                       All files 87.31 | 64.81 | 78.85 | 86.94（門檻 70/60/70/70）
                  web  9 files / 37 tests；94 | 96.15 | 87.5 | 92.85（門檻 75/75/60/75）
      test:e2e    11 suites / 162 tests（本 change 前 160）
      ```

      ⚠️ 完整 e2e **第一次跑出現 1 條紅**，但那是 `todo.md` 記錄的既有間歇性失敗
      （第三次發生），與本 change 無關：紅的是 `Role E2E › GET /api/admin/roles › 無 token → 401`
      拿到 **404**——路由沒被匹配，與權限驗證完全無關。連跑 3 次皆全綠。
      這次有保留完整輸出，`todo.md` 那條已更新為「症狀是 404 而非授權失敗」這個新線索
- [x] 4.2 更新 `tasks/todo.md`：勾掉 C2b，並記下「PageHeader 共用元件」與「帳號鎖定頁版面」兩支待搬的衍生專案 commit
- [x] 4.3 新踩到的坑寫進 `tasks/lessons.md`——重點是「規則與樣本一起長大時沒有樣本能證偽它」這個形狀
