## Why

**`BACKEND:ATTACHMENT:EDIT` 對任何角色都不可能被指派。** 它在權限目錄裡、會渲染在權限樹上、就是存不進去——連「全選」都會失敗。

原因是「EDIT 蘊含 VIEW」這條規則被實作成**無條件的字串推導**，而附件模組刻意只有 EDIT（上傳與刪除都是寫入操作，沒有「只能看」的場景）：

- **後端** `permission-validator.ts` 看到 `X:Y:EDIT` 就要求 `X:Y:VIEW` 也在清單裡，否則拋 `InvalidPermissionCombinationException`。附件沒有 VIEW 碼，於是永遠不合格。
- **前端** `normalizePermissionCodes` 更嚴重——它**主動合成** `BACKEND:ATTACHMENT:VIEW` 加進送出的清單。那個碼不存在於目錄，後端會以「Permission code 不存在」退件。也就是說**即使後端修好了，前端仍會自己塞一個幻影碼把儲存打掉**。

實測（探針，跑完已移除）：只給 `BACKEND:ATTACHMENT:EDIT` 或給目錄裡全部的權限，兩者都被拒絕。

這個碼是「附件端點補授權」那輪加進來的，加的時候沒有人試過把它指派給角色，而既有測試全部只用有 VIEW 的模組當樣本——**規則與樣本一起長大，於是沒有樣本能證偽它**。

## What Changes

- 後端 `validatePermissions`：「EDIT 必須搭配 VIEW」改為**只在該模組確實提供 VIEW 時才成立**。判斷依權限目錄而非字串推導——驗證流程本來就要查目錄確認每個碼存在，一次把要求的 VIEW 碼一起查即可回答「它存不存在」
- 前端 `normalizePermissionCodes`：接受 `availableCodes` 參數，只補**目錄裡真的有**的 VIEW 碼；清單尚未載入時不補（送出使用者實際勾的內容，臆測比不補更糟，後端仍是最後一道防線）
- `RolesPage` 從既有的 `usePermissionOptionsQuery` 取得可用碼集合傳入（該 query 已被 `RoleFormDialog` 訂閱，是共用快取不是多一次請求）
- 補測試：後端 validator 的新 spec 檔、前端 `role-form-schema` 的 normalize 測試

不做的事：改動權限目錄（附件只有 EDIT 是刻意的，不是缺漏）、動 `PermissionsField` 的勾選連動（它已經用實際載入的 `group.view` 判斷並有 `if (group.view)` 守衛，不會合成幻影碼）。

## Capabilities

### Modified Capabilities

- `api-role-management`：角色建立 / 更新的權限驗證規則——「EDIT 必須搭配 VIEW」需補上成立條件（該模組也提供 VIEW），並明確指出目錄中允許存在只有 EDIT 的模組。
- `ui-role-management`：權限欄位的送出前 normalize 行為——需求要寫明補 VIEW 必須依後端實際提供的碼，不得字串推導。

## Impact

- **修改檔案**：`apps/api/src/application/service/admin/role/permission-validator.ts`、`apps/web/src/routes/roles/lib/role-form-schema.ts`、`apps/web/src/routes/roles/page.tsx`
- **新增檔案**：`permission-validator.spec.ts`、`role-form-schema.test.ts`
- **無 migration、無 env 變更、無新增相依套件**
- **行為變更**：先前必定失敗的組合（含只有 EDIT 的模組）現在會成功。**沒有反向的破壞性**——原本能存的組合仍然能存，因為有 VIEW 的模組其規則完全不變
