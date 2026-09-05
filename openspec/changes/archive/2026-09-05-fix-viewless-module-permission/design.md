## Context

「EDIT 蘊含 VIEW」在兩個地方各實作了一次，兩份都用**純字串推導**（`X:Y:EDIT` → `X:Y:VIEW`），因為寫的當下所有模組都同時有 VIEW 與 EDIT，字串推導與查目錄的結果完全一致。

`BACKEND:ATTACHMENT:EDIT` 加入之後這個前提失效了，但沒有任何東西會發現——既有測試的樣本全部取自有 VIEW 的模組，而**規則與樣本是同一批人同時長出來的**，所以沒有樣本能證偽它。

現況的關鍵細節：

- 後端 `validatePermissions` 先 `findByCodes(codes)` 確認每個碼存在，再用 `codeSet` 檢查 EDIT/VIEW 配對。它**已經在查目錄**，只是沒把要求的 VIEW 碼一起查。
- 前端 `normalizePermissionCodes(codes)` 是純函式、不接觸任何清單，被 `RolesPage` 在組 request body 前呼叫，定位是 defense in depth。
- `PermissionsField`（勾選 UI）**已經是對的**：它用 `group.view`（來自 API 載入的 items）並有 `if (group.view)` 守衛。三層裡只有兩層有問題。
- `usePermissionOptionsQuery` 已存在且已被 `RoleFormDialog` 訂閱。

## Goals / Non-Goals

**Goals:**

- 只有 EDIT 的模組其權限碼可以被指派
- 「EDIT 必須搭配 VIEW」在該模組有 VIEW 時的行為完全不變
- 前端不再合成目錄中不存在的權限碼
- 規則的成立條件寫進 spec，讓下一個只有 EDIT 的模組不必重踩

**Non-Goals:**

- **不補 `BACKEND:ATTACHMENT:VIEW`**。附件只有 EDIT 是刻意的設計——上傳與刪除都是寫入操作，「只能看附件」不是一個有意義的權限。為了讓規則成立而新增一個沒有語意的權限碼，是讓規則決定領域模型。
- **不動 `PermissionsField`**：它已經依實際載入的 items 判斷。
- **不改權限碼格式或 `parsePermissionCode`**：4 段式（含 subModule）的碼目前沒有 EDIT/VIEW 配對需求，本 change 維持既有的 3 段式判斷。

## Decisions

### D1：依權限目錄判斷，不依字串推導

規則改為「**該模組確實提供 VIEW 時**，EDIT 才必須搭配它」。

不選「維持字串推導 + 為附件補一個 VIEW 碼」：那是讓驗證規則反過來決定領域模型。附件沒有「只能看」的場景，補出來的 `BACKEND:ATTACHMENT:VIEW` 會出現在權限樹上讓人以為可以只給檢視權，而它背後沒有任何端點。**用假資料遷就規則，代價會落在每個看到那個選項的人身上。**

不選「把附件排除在規則之外的白名單」：白名單會隨著下一個只有 EDIT 的模組而增長，且它要人記得維護——正是 `lessons.md` 那條「靠自律維護的清單一定會漂移」。依目錄判斷則不需要任何清單。

### D2：後端一次查完，不分兩次查詢

`findByCodes([...使用者送的碼, ...衍生的 VIEW 碼])`，一次拿回來再分別判斷。

不選「先查使用者的碼，需要時再查 VIEW 碼」：分兩次會讓「第二次查什麼」變成隱含契約，測試的 mock 很容易對不上——mock 只回第一次查詢的結果時，第二次拿到空陣列，於是規則靜默失效而測試全綠。一次查完的話 mock 的行為只有一種。

**「碼不存在」的判定只針對使用者實際送出的碼**：衍生的 VIEW 碼查不到是正常情況（那正是要偵測的東西），不能算進 `missing`。

### D3：前端在清單未載入時不補 VIEW

`normalizePermissionCodes(codes, availableCodes?)`，`availableCodes` 為 `undefined` 時直接回傳排序去重後的原清單。

不選「未載入時沿用字串推導」：那會保留本 change 要修的缺陷，只是縮小了觸發窗口——而縮小的窗口更難被發現。

不選「未載入時阻擋送出」：normalize 的定位是 defense in depth，不是驗證。**送出使用者實際勾的內容是最誠實的行為**，而後端仍是最後一道防線。實務上這個分支幾乎不會走到：`RoleFormDialog` 開啟時就會訂閱同一支 query，使用者要先看到權限樹才可能勾選。

### D4：前端不改用「後端回傳完整清單」之類的新機制

`RolesPage` 從既有的 `usePermissionOptionsQuery` 取集合。react-query 的快取讓這不是額外請求。

不選「把 normalize 整個搬到後端」：前端這層的定位本來就是 defense in depth（早一步收斂、少一次往返），拿掉它並不會讓系統更正確，只是把同一個判斷延後。

## Risks / Trade-offs

- **[前端多一個參數，既有呼叫端漏傳會靜默退回舊行為]** → 參數設為選填是刻意的（D3 的未載入情境需要它），但兩處呼叫端都在同一個檔案的同一段程式碼內，且測試涵蓋「有傳」與「沒傳」兩種。TypeScript 抓不到漏傳，這是知情的取捨。
- **[目錄裡若出現只有 VIEW 沒有 EDIT 的模組]** → 規則本來就只在看到 EDIT 時才觸發，不受影響。
- **[4 段式權限碼（含 subModule）不在本次判斷範圍]** → 與現況一致，`parsePermissionCode` 支援 4 段但 EDIT/VIEW 配對規則只處理 3 段。目前目錄裡沒有 4 段碼，出現時要一併評估。

## Migration Plan

無 migration、無 env 變更。

部署後既有角色不受影響——本 change 只放寬驗證，不改變任何已儲存的資料。原本存不進去的組合現在存得進去，原本存得進去的完全不變。
