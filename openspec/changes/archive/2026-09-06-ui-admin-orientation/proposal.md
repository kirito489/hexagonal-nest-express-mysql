## Why

後台的「方向感」有兩處是壞的。

**① 同一個東西有兩個名字，而其中一個是錯的。**

`/members` 管的是**後台管理員帳號**，但四處說法分歧：

| 位置 | 用字 |
| --- | --- |
| Sidebar | 會員管理 |
| 頁面標題 | 會員管理（副標卻寫「管理**後台帳號**、角色指派與啟用狀態」）|
| 權限樹 | 帳號管理 |
| `PERMISSION_CATALOG` | 後台-**帳號管理**-檢視 |

**頁面標題與它自己的副標互相矛盾**——標題說會員，副標說後台帳號。
而「會員」在一般用法裡指的是終端使用者，不是管理員。

這種漂移沒有任何守則擋得住：`permission-codes-sync.spec.ts` 檢查的是
「對照是否齊全」，**兩邊都在但用詞不同時它全綠**（那條限制在 C6c 就寫下來了，
只是當時沒發現模板已經處在那個狀態）。

**② 首頁還是模板的佔位頁。**

```tsx
管理後台骨架已建立完成，後續會接上會員、角色、權限等模組。
```

那些模組**全部接完了**（`/members`、`/roles`、三頁 `/security/*`），
而 `/me` 那段的註解還寫著「**示範**：呼叫 /me 取登入者資料」。
**登入後的第一個畫面，講的是一個早就不存在的狀態。**

它一直沒被發現，是因為**沒有任何 spec 涵蓋首頁**——沒有需求，就沒有東西會過期。

## What Changes

- **統一命名為「管理者帳號」**，四處全改（含 `PERMISSION_CATALOG` 的 `name`）：
  - `_nav-items.ts` 的 label、`members/page.tsx` 的 `PageHeader`
  - `permission-labels.ts` 的 `MODULE_LABELS.ACCOUNT`
  - `shared/constants/permissions.ts` 的「後台-帳號管理-*」→「後台-管理者帳號-*」
- **Sidebar 分組改依「管理誰」命名**：「使用者與權限」→「管理者與權限」。
  判準是換一個維度：**「管理者 / 會員」說的是「是誰」**，
  「使用者與權限」把「對象」與「機制」混在同一個名字裡。
- **首頁拿掉佔位文字**，只留真正屬於首頁的內容（個人資料），
  並補上「此帳號可用的功能」的入口說明。
  **不做假的營運摘要**——模板沒有任何統計端點，硬做出來的數字是騙人的（design D3）。
- **新增 `ui-home` capability**：首頁至今沒有任何 spec，所以那句佔位文字
  過期了也沒有東西會發現。三條需求：內容依權限決定、不重複 Sidebar 的導覽、
  不得留下描述舊狀態的文字。

**不做**：

- **不新增前台會員管理**。藍本的 ① 是「兩個帳號體系混在同一組」，
  本模板前台側只有 `ping`，**沒有第二個帳號體系**，那個問題不存在。
- 不動路由、權限碼、API 契約、資料庫結構。

## Capabilities

### Modified Capabilities

- `ui-member-management`：Sidebar 入口與頁面標題的用字。
- `platform-frontend-conventions`：Sidebar 分組的規範補上**分組的判準**
  ——現況只說「依 group 分組渲染」，沒說 group 該怎麼切，而這次的問題正是切錯了維度。

### Added Capabilities

- `ui-home`：首頁的畫面行為。

## Impact

| 面向 | 影響 |
| --- | --- |
| Schema / migration | 無 |
| 環境變數 | 無 |
| 權限碼 | **碼本身不動**，只改 `PERMISSION_CATALOG` 的 `name` 顯示字串 |
| **部署相依** | ⚠️ **需重跑 `pnpm --filter @app/api db:seed`**——`name` 改了要同步到 DB。seed 是 upsert，重跑安全 |
| API 契約 / Swagger | 無（`GET /roles/permissions` 的欄位不變，只是 `name` 的值變了） |
| 前端 | `_nav-items.ts`、`members/page.tsx`、`home/page.tsx`、`permission-labels.ts` |

**BREAKING（操作面）**：熟悉舊介面的人會撞一次肌肉記憶。
舊用法本來就是錯的——後台管理員帳號不是「會員」。
